import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  CalendarClock,
  CircleAlert,
  ClipboardCheck,
  Eye,
  LockKeyhole,
  Package,
  Wallet,
} from "lucide-react";
import { api } from "../lib/api";
import type { CashSession } from "../types";
import {
  formatDateTime,
  formatExpenseCategory,
  formatMoney,
  formatTime,
  getErrorMessage,
} from "../lib/utils";
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  PageError,
  PageHeader,
  PageLoader,
  Pagination,
} from "../components/ui";

function signedMoney(value: number): string {
  if (value === 0) return formatMoney(0);
  return `${value > 0 ? "+" : "−"}${formatMoney(Math.abs(value))}`;
}

function differenceTone(value: number | null): "green" | "red" | "amber" | "gray" {
  if (value === null) return "gray";
  if (value === 0) return "green";
  return value > 0 ? "amber" : "red";
}

function ActiveSessionBanner({ session }: { session: CashSession }) {
  return (
    <section className="session-live-banner">
      <span className="session-live-banner__icon">
        <Banknote size={20} />
      </span>
      <div className="session-live-banner__body">
        <div>
          <strong>Kas sedang dibuka</strong>
          <Badge tone="green" dot>
            Berjalan
          </Badge>
        </div>
        <p>
          Sejak {formatTime(session.openedAt)} oleh {session.openedBy.name} · {session.transactionCount} transaksi
        </p>
      </div>
      <div className="session-live-banner__metric">
        <span>Penjualan tunai</span>
        <strong>{formatMoney(session.cashSales)}</strong>
      </div>
      <div className="session-live-banner__metric">
        <span>Pengeluaran</span>
        <strong>−{formatMoney(session.totalExpenses)}</strong>
      </div>
      <div className="session-live-banner__metric">
        <span>Estimasi uang laci</span>
        <strong>{formatMoney(session.expectedCash)}</strong>
      </div>
    </section>
  );
}

function SessionExpenseModal({
  session,
  onClose,
}: {
  session: CashSession;
  onClose: () => void;
}) {
  const expensesQuery = useQuery({
    queryKey: ["expenses", { sessionId: session.id }],
    queryFn: () => api.expenses.list({ sessionId: session.id, page: 1, limit: 100 }),
  });

  const expenses = expensesQuery.data?.items ?? [];
  const totalExpenses = expensesQuery.data?.summary.totalAmount ?? session.totalExpenses;

  return (
    <Modal
      open
      onClose={onClose}
      title="Detail Sesi Kas"
      subtitle={`${formatDateTime(session.openedAt)} · ${session.openedBy.name}`}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Tutup
        </Button>
      }
    >
      <div className="session-detail-summary">
        <div>
          <span>Kas awal</span>
          <strong>{formatMoney(session.openingCash)}</strong>
        </div>
        <div>
          <span>Penjualan tunai</span>
          <strong>{formatMoney(session.cashSales)}</strong>
        </div>
        <div className="session-detail-summary__expense">
          <span>Pengeluaran kas</span>
          <strong>−{formatMoney(totalExpenses)}</strong>
        </div>
        <div>
          <span>Uang laci seharusnya</span>
          <strong>{formatMoney(session.expectedCash)}</strong>
        </div>
        <div>
          <span>Uang dihitung</span>
          <strong>{session.countedCash === null ? "—" : formatMoney(session.countedCash)}</strong>
        </div>
        <div>
          <span>Selisih</span>
          <Badge tone={differenceTone(session.difference)}>
            {session.difference === null ? "Berjalan" : signedMoney(session.difference)}
          </Badge>
        </div>
      </div>

      <div className="session-expense-head">
        <div>
          <strong>Pengeluaran pada sesi ini</strong>
          <span>{expenses.length > 0 ? `${expenses.length} catatan` : "Tidak ada pengeluaran"}</span>
        </div>
        <Badge tone={totalExpenses > 0 ? "amber" : "gray"}>
          Total {formatMoney(totalExpenses)}
        </Badge>
      </div>

      {expensesQuery.isLoading ? (
        <PageLoader label="Memuat pengeluaran..." />
      ) : expensesQuery.isError ? (
        <PageError
          message={getErrorMessage(expensesQuery.error)}
          onRetry={() => void expensesQuery.refetch()}
        />
      ) : expenses.length === 0 ? (
        <EmptyState
          compact
          icon={<Package size={22} />}
          title="Tidak ada pengeluaran"
          description="Kasir tidak mencatat pengeluaran kas pada sesi ini."
        />
      ) : (
        <ul className="expense-items">
          {expenses.map((expense) => (
            <li className="expense-item" key={expense.id}>
              <span className="expense-item__icon">
                <Wallet size={16} />
              </span>
              <div className="expense-item__body">
                <div className="expense-item__title">
                  <strong>{expense.description}</strong>
                  <Badge tone="blue">{formatExpenseCategory(expense.category)}</Badge>
                </div>
                <span className="expense-item__meta">
                  {formatDateTime(expense.createdAt)} · {expense.createdBy.name}
                </span>
              </div>
              <div className="expense-item__amount">
                <strong>−{formatMoney(expense.amount)}</strong>
              </div>
            </li>
          ))}
        </ul>
      )}

      {session.closingNotes && (
        <div className="session-detail-notes">
          <strong>Catatan penutupan</strong>
          <p>{session.closingNotes}</p>
        </div>
      )}
    </Modal>
  );
}

export function OwnerCashSessionsPage() {
  const [page, setPage] = useState(1);
  const [selectedSession, setSelectedSession] = useState<CashSession | null>(null);

  const currentQuery = useQuery({
    queryKey: ["cash-session", "current"],
    queryFn: api.cashSessions.current,
    staleTime: 0,
  });

  const sessionsQuery = useQuery({
    queryKey: ["cash-sessions", { page }],
    queryFn: () => api.cashSessions.list({ page, limit: 20 }),
  });

  const summary = sessionsQuery.data?.summary;
  const activeSession = currentQuery.data?.session ?? null;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Kontrol uang tunai"
        title="Sesi Kas"
        description="Setiap buka dan tutup kas tercatat. Bandingkan uang laci hasil hitung dengan catatan sistem."
      />

      {activeSession && <ActiveSessionBanner session={activeSession} />}

      <div className="transaction-summary-grid">
        <div className="summary-card">
          <span className="summary-card__icon summary-card__icon--green">
            <ClipboardCheck size={19} />
          </span>
          <div>
            <span>Total sesi</span>
            <strong>{sessionsQuery.data?.total ?? "—"}</strong>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-card__icon summary-card__icon--blue">
            <Wallet size={19} />
          </span>
          <div>
            <span>Total selisih</span>
            <strong>{summary ? signedMoney(summary.totalDifference) : "—"}</strong>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-card__icon summary-card__icon--amber">
            <CircleAlert size={19} />
          </span>
          <div>
            <span>Sesi berselisih</span>
            <strong>{summary?.sessionsWithDifference ?? "—"}</strong>
          </div>
        </div>
      </div>

      <section className="panel">
        {sessionsQuery.isLoading ? (
          <PageLoader label="Memuat sesi kas..." />
        ) : sessionsQuery.isError ? (
          <PageError
            message={getErrorMessage(sessionsQuery.error)}
            onRetry={() => void sessionsQuery.refetch()}
          />
        ) : sessionsQuery.data?.items.length === 0 ? (
          <EmptyState
            icon={<LockKeyhole size={24} />}
            title="Belum ada sesi kas"
            description="Sesi akan muncul di sini setelah kasir membuka kas untuk pertama kali."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table cash-session-table">
                <thead>
                  <tr>
                    <th>Sesi</th>
                    <th className="text-right">Kas Awal</th>
                    <th className="text-right">Penjualan Tunai</th>
                    <th className="text-right">Pengeluaran</th>
                    <th className="text-right">Seharusnya</th>
                    <th className="text-right">Dihitung</th>
                    <th className="text-right">Selisih</th>
                    <th>Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionsQuery.data!.items.map((session) => (
                    <tr key={session.id}>
                      <td>
                        <div className="session-cell">
                          <span className={`session-cell__dot session-cell__dot--${session.status}`} />
                          <div>
                            <strong>{formatDateTime(session.openedAt)}</strong>
                            <span>
                              {session.status === "open"
                                ? "Masih berjalan"
                                : `Ditutup ${formatDateTime(session.closedAt)}`}
                            </span>
                            <span className="session-cell__people">
                              Buka: {session.openedBy.name}
                              {session.closedBy && ` · Tutup: ${session.closedBy.name}`}
                            </span>
                            <button
                              type="button"
                              className="session-cell__detail"
                              onClick={() => setSelectedSession(session)}
                            >
                              <Eye size={11} />
                              Lihat detail
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="text-right nowrap">{formatMoney(session.openingCash)}</td>
                      <td className="text-right nowrap">{formatMoney(session.cashSales)}</td>
                      <td className="text-right nowrap">
                        {session.totalExpenses > 0 ? (
                          <span className="session-expense-value">
                            −{formatMoney(session.totalExpenses)}
                          </span>
                        ) : (
                          <span className="muted-cell">{formatMoney(0)}</span>
                        )}
                      </td>
                      <td className="text-right strong-cell nowrap">{formatMoney(session.expectedCash)}</td>
                      <td className="text-right nowrap">
                        {session.countedCash === null ? "—" : formatMoney(session.countedCash)}
                      </td>
                      <td className="text-right">
                        <Badge tone={differenceTone(session.difference)}>
                          {session.difference === null ? "Berjalan" : signedMoney(session.difference)}
                        </Badge>
                      </td>
                      <td>
                        <div className="session-notes">
                          {session.closingNotes ? (
                            <span title={session.closingNotes}>{session.closingNotes}</span>
                          ) : session.status === "open" ? (
                            <span className="muted-cell">Belum ditutup</span>
                          ) : (
                            <span className="muted-cell">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={sessionsQuery.data!.page}
              limit={sessionsQuery.data!.limit}
              total={sessionsQuery.data!.total}
              onPageChange={setPage}
            />
          </>
        )}
      </section>

      <section className="session-info">
        <span className="session-info__icon">
          <CalendarClock size={20} />
        </span>
        <div>
          <strong>Bagaimana selisih dihitung?</strong>
          <p>
            Uang laci seharusnya = kas awal + seluruh penjualan tunai − pengeluaran kas. Selisih = uang hasil
            hitung − uang seharusnya. Penjualan QRIS, debit, dan transfer tidak menambah uang tunai di laci.
          </p>
        </div>
      </section>

      {selectedSession && (
        <SessionExpenseModal session={selectedSession} onClose={() => setSelectedSession(null)} />
      )}
    </div>
  );
}
