import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../db/pool";
import { currentUser, requireAuth, requireCashier, requireOwner } from "../lib/auth";
import { asyncHandler, AppError } from "../lib/http";
import { emitEvent } from "../lib/realtime";
import { iso } from "../lib/serializers";
import {
  moneySchema,
  optionalTrimmedString,
  paginationSchema,
  parseId,
  roundMoney,
} from "../lib/validation";

export const cashSessionsRouter = Router();
cashSessionsRouter.use(requireAuth);

interface CashSessionRow {
  id: string;
  status: "open" | "closed";
  opening_cash: number;
  counted_cash: number | null;
  expected_cash: number | null;
  difference: number | null;
  opening_notes: string | null;
  closing_notes: string | null;
  opened_by: string;
  opened_by_name: string;
  closed_by: string | null;
  closed_by_name: string | null;
  opened_at: Date | string;
  closed_at: Date | string | null;
  transaction_count: number;
  total_sales: number;
  cash_sales: number;
  non_cash_sales: number;
  total_expenses: number;
}

export interface CashSessionDto {
  id: string;
  status: "open" | "closed";
  openingCash: number;
  countedCash: number | null;
  expectedCash: number;
  difference: number | null;
  openingNotes: string | null;
  closingNotes: string | null;
  openedBy: { id: string; name: string };
  closedBy: { id: string; name: string } | null;
  openedAt: string;
  closedAt: string | null;
  transactionCount: number;
  totalSales: number;
  cashSales: number;
  nonCashSales: number;
  totalExpenses: number;
}

const sessionSelect = `
  SELECT cs.id, cs.status, cs.opening_cash, cs.counted_cash, cs.expected_cash, cs.difference,
         cs.opening_notes, cs.closing_notes, cs.opened_by, ob.name AS opened_by_name,
         cs.closed_by, cb.name AS closed_by_name, cs.opened_at, cs.closed_at,
         (SELECT COUNT(*)::int
            FROM transactions t WHERE t.cash_session_id = cs.id) AS transaction_count,
         (SELECT COALESCE(SUM(t.total), 0)::numeric
            FROM transactions t WHERE t.cash_session_id = cs.id) AS total_sales,
         (SELECT COALESCE(SUM(t.total) FILTER (WHERE t.payment_method = 'cash'), 0)::numeric
            FROM transactions t WHERE t.cash_session_id = cs.id) AS cash_sales,
         (SELECT COALESCE(SUM(t.total) FILTER (WHERE t.payment_method <> 'cash'), 0)::numeric
            FROM transactions t WHERE t.cash_session_id = cs.id) AS non_cash_sales,
         (SELECT COALESCE(SUM(e.amount), 0)::numeric
            FROM cash_expenses e WHERE e.cash_session_id = cs.id) AS total_expenses
  FROM cash_sessions cs
  JOIN users ob ON ob.id = cs.opened_by
  LEFT JOIN users cb ON cb.id = cs.closed_by
`;

function mapCashSession(row: CashSessionRow): CashSessionDto {
  const openingCash = Number(row.opening_cash);
  const cashSales = Number(row.cash_sales);
  const totalExpenses = Number(row.total_expenses);
  const isClosed = row.status === "closed";

  return {
    id: row.id,
    status: row.status,
    openingCash,
    countedCash: row.counted_cash === null ? null : Number(row.counted_cash),
    expectedCash: isClosed && row.expected_cash !== null
      ? Number(row.expected_cash)
      : roundMoney(openingCash + cashSales - totalExpenses),
    difference: row.difference === null ? null : Number(row.difference),
    openingNotes: row.opening_notes,
    closingNotes: row.closing_notes,
    openedBy: { id: row.opened_by, name: row.opened_by_name },
    closedBy: row.closed_by && row.closed_by_name
      ? { id: row.closed_by, name: row.closed_by_name }
      : null,
    openedAt: iso(row.opened_at)!,
    closedAt: iso(row.closed_at),
    transactionCount: Number(row.transaction_count),
    totalSales: Number(row.total_sales),
    cashSales,
    nonCashSales: Number(row.non_cash_sales),
    totalExpenses,
  };
}

async function getCashSessionById(
  id: string,
  client: Pick<typeof pool, "query"> = pool,
): Promise<CashSessionDto | null> {
  const result = await client.query<CashSessionRow>(
    `${sessionSelect}
     WHERE cs.id = $1`,
    [id],
  );
  return result.rows[0] ? mapCashSession(result.rows[0]) : null;
}

async function findOpenSessionId(client: Pick<typeof pool, "query"> = pool): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    "SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1",
  );
  return result.rows[0]?.id ?? null;
}

cashSessionsRouter.get(
  "/current",
  asyncHandler(async (_req, res) => {
    const openId = await findOpenSessionId();
    const session = openId ? await getCashSessionById(openId) : null;

    const lastResult = await pool.query<{ id: string }>(
      "SELECT id FROM cash_sessions WHERE status = 'closed' ORDER BY closed_at DESC LIMIT 1",
    );
    const lastClosed = lastResult.rows[0]
      ? await getCashSessionById(lastResult.rows[0].id)
      : null;

    res.json({
      session: session?.status === "open" ? session : null,
      lastClosed,
    });
  }),
);

cashSessionsRouter.get(
  "/",
  requireOwner,
  asyncHandler(async (req, res) => {
    const query = paginationSchema.parse(req.query);
    const offset = (query.page - 1) * query.limit;

    const summaryResult = await pool.query<{
      total_sessions: number;
      closed_sessions: number;
      total_difference: number;
      sessions_with_difference: number;
    }>(
      `SELECT COUNT(*)::int AS total_sessions,
              COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_sessions,
              COALESCE(SUM(difference) FILTER (WHERE status = 'closed'), 0)::numeric AS total_difference,
              COUNT(*) FILTER (WHERE status = 'closed' AND difference <> 0)::int AS sessions_with_difference
       FROM cash_sessions`,
    );

    const listResult = await pool.query<CashSessionRow>(
      `${sessionSelect}
       ORDER BY cs.opened_at DESC
       LIMIT $1 OFFSET $2`,
      [query.limit, offset],
    );

    const summary = summaryResult.rows[0];
    res.json({
      items: listResult.rows.map(mapCashSession),
      total: Number(summary.total_sessions),
      page: query.page,
      limit: query.limit,
      summary: {
        closedSessions: Number(summary.closed_sessions),
        totalDifference: Number(summary.total_difference),
        sessionsWithDifference: Number(summary.sessions_with_difference),
      },
    });
  }),
);

cashSessionsRouter.post(
  "/open",
  requireCashier,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = z
      .object({
        openingCash: moneySchema,
        notes: optionalTrimmedString(500, "Catatan"),
      })
      .parse(req.body);

    const openingCash = roundMoney(body.openingCash);

    try {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO cash_sessions (opening_cash, opening_notes, opened_by)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [openingCash.toFixed(2), body.notes, user.id],
      );
      const session = await getCashSessionById(result.rows[0].id);
      if (!session) throw new AppError(500, "Kas berhasil dibuka tetapi gagal dimuat.");

      emitEvent("cash-session.changed", { id: session.id, action: "opened" });
      res.status(201).json({
        session,
        message: `Kas dibuka dengan uang awal ${new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          minimumFractionDigits: 0,
        }).format(openingCash)}.`,
      });
    } catch (error) {
      const pgError = error as { code?: string; constraint?: string };
      if (pgError.code === "23505" && pgError.constraint === "cash_sessions_one_open_idx") {
        throw new AppError(409, "Kas sudah dibuka. Tutup sesi kas berjalan terlebih dahulu.", {
          code: "CASH_SESSION_ALREADY_OPEN",
        });
      }
      throw error;
    }
  }),
);

cashSessionsRouter.post(
  "/:id/close",
  requireCashier,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const id = parseId(req.params.id);
    const body = z
      .object({
        countedCash: moneySchema,
        notes: optionalTrimmedString(500, "Catatan"),
      })
      .parse(req.body);

    const countedCash = roundMoney(body.countedCash);

    const closedId = await withTransaction(async (client) => {
      // Kunci eksklusif membuat proses tutup kas menunggu checkout yang sedang
      // berjalan, dan mencegah checkout baru dimulai setelah kas ditutup.
      const lockResult = await client.query<{
        id: string;
        status: "open" | "closed";
        opening_cash: number;
      }>(
        "SELECT id, status, opening_cash FROM cash_sessions WHERE id = $1 FOR UPDATE",
        [id],
      );
      const session = lockResult.rows[0];
      if (!session) throw new AppError(404, "Sesi kas tidak ditemukan.");
      if (session.status === "closed") {
        throw new AppError(409, "Sesi kas ini sudah ditutup.", { code: "CASH_SESSION_ALREADY_CLOSED" });
      }

      const salesResult = await client.query<{ cash_sales: number; total_sales: number }>(
        `SELECT COALESCE(SUM(total) FILTER (WHERE payment_method = 'cash'), 0)::numeric AS cash_sales,
                COALESCE(SUM(total), 0)::numeric AS total_sales
         FROM transactions
         WHERE cash_session_id = $1`,
        [id],
      );
      const expensesResult = await client.query<{ total_expenses: number }>(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total_expenses
         FROM cash_expenses
         WHERE cash_session_id = $1`,
        [id],
      );
      const cashSales = Number(salesResult.rows[0].cash_sales);
      const totalExpenses = Number(expensesResult.rows[0].total_expenses);
      const expectedCash = roundMoney(Number(session.opening_cash) + cashSales - totalExpenses);
      const difference = roundMoney(countedCash - expectedCash);

      if (difference !== 0 && !body.notes) {
        throw new AppError(400, "Selisih uang laci wajib disertai catatan penjelasan.", {
          code: "CASH_DIFFERENCE_NOTE_REQUIRED",
        });
      }

      await client.query(
        `UPDATE cash_sessions
         SET status = 'closed',
             counted_cash = $1,
             expected_cash = $2,
             difference = $3,
             closing_notes = $4,
             closed_by = $5,
             closed_at = NOW()
         WHERE id = $6`,
        [
          countedCash.toFixed(2),
          expectedCash.toFixed(2),
          difference.toFixed(2),
          body.notes,
          user.id,
          id,
        ],
      );

      return id;
    });

    const session = await getCashSessionById(closedId);
    if (!session) throw new AppError(500, "Kas ditutup tetapi data gagal dimuat.");

    emitEvent("cash-session.changed", { id: session.id, action: "closed" });
    res.json({
      session,
      message: session.difference === 0
        ? "Kas ditutup. Uang laci sesuai dengan catatan."
        : `Kas ditutup dengan selisih ${new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
          }).format(session.difference ?? 0)}.`,
    });
  }),
);
