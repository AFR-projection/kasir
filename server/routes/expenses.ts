import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../db/pool";
import { currentUser, requireCashier } from "../lib/auth";
import { asyncHandler, AppError } from "../lib/http";
import { emitEvent } from "../lib/realtime";
import { iso } from "../lib/serializers";
import {
  moneySchema,
  paginationSchema,
  parseId,
  roundMoney,
  trimmedString,
  uuidSchema,
} from "../lib/validation";

export const expensesRouter = Router();

export const expenseCategories = ["supplies", "equipment", "transport", "other"] as const;
type ExpenseCategory = (typeof expenseCategories)[number];

export interface CashExpenseDto {
  id: string;
  cashSessionId: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  createdBy: { id: string; name: string };
  createdAt: string;
}

interface ExpenseRow {
  id: string;
  cash_session_id: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  created_by: string;
  created_by_name: string;
  created_at: Date | string;
}

function mapExpense(row: ExpenseRow): CashExpenseDto {
  return {
    id: row.id,
    cashSessionId: row.cash_session_id,
    amount: Number(row.amount),
    category: row.category,
    description: row.description,
    createdBy: { id: row.created_by, name: row.created_by_name },
    createdAt: iso(row.created_at)!,
  };
}

const expenseSelect = `
  SELECT e.id, e.cash_session_id, e.amount, e.category, e.description,
         e.created_by, u.name AS created_by_name, e.created_at
  FROM cash_expenses e
  JOIN users u ON u.id = e.created_by
`;

async function findOpenSessionId(
  client: Pick<typeof pool, "query"> = pool,
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    "SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1",
  );
  return result.rows[0]?.id ?? null;
}

async function getExpenseById(
  id: string,
  client: Pick<typeof pool, "query"> = pool,
): Promise<CashExpenseDto | null> {
  const result = await client.query<ExpenseRow>(`${expenseSelect} WHERE e.id = $1`, [id]);
  return result.rows[0] ? mapExpense(result.rows[0]) : null;
}

const listQuerySchema = paginationSchema.extend({
  sessionId: uuidSchema.optional(),
});

expensesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const query = listQuerySchema.parse(req.query);

    let sessionId = query.sessionId ?? null;
    if (user.role === "cashier") {
      const openSessionId = await findOpenSessionId();
      if (!openSessionId) {
        res.json({
          items: [],
          total: 0,
          page: query.page,
          limit: query.limit,
          summary: { totalAmount: 0 },
        });
        return;
      }
      if (sessionId && sessionId !== openSessionId) {
        throw new AppError(404, "Sesi kas tidak ditemukan.", { code: "CASH_SESSION_NOT_FOUND" });
      }
      sessionId = openSessionId;
    }

    const conditions: string[] = [];
    const values: unknown[] = [];
    if (sessionId) {
      values.push(sessionId);
      conditions.push(`e.cash_session_id = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const summaryResult = await pool.query<{ total: number; total_amount: number }>(
      `SELECT COUNT(*)::int AS total, COALESCE(SUM(e.amount), 0)::numeric AS total_amount
       FROM cash_expenses e
       ${where}`,
      values,
    );

    const offset = (query.page - 1) * query.limit;
    const listValues = [...values, query.limit, offset];
    const result = await pool.query<ExpenseRow>(
      `${expenseSelect}
       ${where}
       ORDER BY e.created_at DESC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues,
    );

    res.json({
      items: result.rows.map(mapExpense),
      total: summaryResult.rows[0].total,
      page: query.page,
      limit: query.limit,
      summary: { totalAmount: Number(summaryResult.rows[0].total_amount) },
    });
  }),
);

const createExpenseSchema = z.object({
  amount: moneySchema.refine((value) => value > 0, "Nominal pengeluaran harus lebih dari 0."),
  category: z.enum(expenseCategories, {
    errorMap: () => ({ message: "Kategori pengeluaran tidak valid." }),
  }),
  description: trimmedString(3, 300, "Keterangan"),
  clientReference: z.string().uuid("Referensi pengeluaran tidak valid."),
});

expensesRouter.post(
  "/",
  requireCashier,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = createExpenseSchema.parse(req.body);
    const amount = roundMoney(body.amount);

    try {
      const outcome = await withTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
          body.clientReference,
        ]);

        const existing = await client.query<ExpenseRow>(
          `${expenseSelect} WHERE e.client_reference = $1`,
          [body.clientReference],
        );
        if (existing.rows[0]) {
          if (existing.rows[0].created_by !== user.id) {
            throw new AppError(409, "Referensi pengeluaran sudah digunakan.");
          }
          return {
            expense: mapExpense(existing.rows[0]),
            alreadyProcessed: true,
            sessionId: existing.rows[0].cash_session_id,
          };
        }

        // FOR UPDATE membuat pencatatan pengeluaran menunggu checkout/tutup kas
        // yang sedang berjalan dan mencegah dua pengeluaran melewati saldo laci
        // secara bersamaan.
        const sessionResult = await client.query<{ id: string; opening_cash: number }>(
          "SELECT id, opening_cash FROM cash_sessions WHERE status = 'open' FOR UPDATE LIMIT 1",
        );
        const session = sessionResult.rows[0];
        if (!session) {
          throw new AppError(409, "Kas belum dibuka. Buka kas sebelum mencatat pengeluaran.", {
            code: "CASH_SESSION_CLOSED",
          });
        }

        const drawerResult = await client.query<{
          cash_sales: number;
          total_expenses: number;
        }>(
          `SELECT
             (SELECT COALESCE(SUM(total) FILTER (WHERE payment_method = 'cash'), 0)
              FROM transactions WHERE cash_session_id = $1)::numeric AS cash_sales,
             (SELECT COALESCE(SUM(amount), 0)
              FROM cash_expenses WHERE cash_session_id = $1)::numeric AS total_expenses`,
          [session.id],
        );
        const availableCash = roundMoney(
          Number(session.opening_cash) +
            Number(drawerResult.rows[0].cash_sales) -
            Number(drawerResult.rows[0].total_expenses),
        );
        if (amount > availableCash) {
          const formatted = new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
          }).format(Math.max(0, availableCash));
          throw new AppError(
            409,
            `Pengeluaran melebihi saldo kas laci. Saldo tersedia ${formatted}.`,
            {
              code: "CASH_EXPENSE_EXCEEDS_DRAWER",
              details: { availableCash },
            },
          );
        }

        const insertResult = await client.query<{ id: string }>(
          `INSERT INTO cash_expenses
             (cash_session_id, amount, category, description, created_by, client_reference)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            session.id,
            amount.toFixed(2),
            body.category,
            body.description,
            user.id,
            body.clientReference,
          ],
        );

        const expense = await getExpenseById(insertResult.rows[0].id, client);
        if (!expense) throw new AppError(500, "Pengeluaran tersimpan tetapi gagal dimuat.");

        return { expense, alreadyProcessed: false, sessionId: session.id };
      });

      if (!outcome.alreadyProcessed) {
        emitEvent("cash-expense.changed", {
          id: outcome.expense.id,
          sessionId: outcome.sessionId,
          action: "created",
        });
      }

      res.status(outcome.alreadyProcessed ? 200 : 201).json({
        expense: outcome.expense,
        alreadyProcessed: outcome.alreadyProcessed,
        message: outcome.alreadyProcessed
          ? "Pengeluaran ini sudah dicatat sebelumnya."
          : "Pengeluaran berhasil dicatat.",
      });
    } catch (error) {
      const pgError = error as { code?: string; constraint?: string };
      if (pgError.code === "23505" && pgError.constraint === "cash_expenses_client_reference_key") {
        const existing = await pool.query<ExpenseRow>(
          `${expenseSelect} WHERE e.client_reference = $1`,
          [body.clientReference],
        );
        if (existing.rows[0]?.created_by === user.id) {
          res.status(200).json({
            expense: mapExpense(existing.rows[0]),
            alreadyProcessed: true,
            message: "Pengeluaran ini sudah dicatat sebelumnya.",
          });
          return;
        }
      }
      throw error;
    }
  }),
);

expensesRouter.delete(
  "/:id",
  requireCashier,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const id = parseId(req.params.id);

    const deleted = await withTransaction(async (client) => {
      const result = await client.query<{
        id: string;
        cash_session_id: string;
        created_by: string;
        status: "open" | "closed";
      }>(
        `SELECT e.id, e.cash_session_id, e.created_by, cs.status
         FROM cash_expenses e
         JOIN cash_sessions cs ON cs.id = e.cash_session_id
         WHERE e.id = $1
         FOR UPDATE OF e, cs`,
        [id],
      );
      const expense = result.rows[0];
      if (!expense) throw new AppError(404, "Pengeluaran tidak ditemukan.");
      if (expense.status !== "open") {
        throw new AppError(
          409,
          "Pengeluaran pada sesi kas yang sudah ditutup tidak dapat dihapus.",
          { code: "CASH_SESSION_CLOSED" },
        );
      }
      if (expense.created_by !== user.id) {
        throw new AppError(403, "Hanya pembuat catatan yang dapat menghapus pengeluaran ini.", {
          code: "EXPENSE_DELETE_FORBIDDEN",
        });
      }

      await client.query("DELETE FROM cash_expenses WHERE id = $1", [id]);
      return expense;
    });

    emitEvent("cash-expense.changed", {
      id: deleted.id,
      sessionId: deleted.cash_session_id,
      action: "deleted",
    });

    res.json({ message: "Pengeluaran berhasil dihapus." });
  }),
);

export type { ExpenseCategory };
