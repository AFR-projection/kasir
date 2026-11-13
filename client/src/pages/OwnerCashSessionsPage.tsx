import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  CalendarClock,
  CircleAlert,
  ClipboardCheck,
  LockKeyhole,
  Wallet,
} from "lucide-react";
import { api } from "../lib/api";
import type { CashSession } from "../types";
import {
  formatDateTime,
  formatMoney,
  formatTime,
  getErrorMessage,
} from "../lib/utils";
import {
  Badge,
  EmptyState,
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
        <span>Estimasi uang laci</span>
        <strong>{formatMoney(session.expectedCash)}</strong>
      </div>
    </section>
  );
}

export function OwnerCashSessionsPage() {
  const [page, setPage] = useState(1);

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
                    <th>Kasir</th>
                    <th className="text-right">Kas Awal</th>
                    <th className="text-right">Penjualan Tunai</th>
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
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="session-people">
                          <span>Buka: {session.openedBy.name}</span>
                          {session.closedBy && <span>Tutup: {session.closedBy.name}</span>}
                        </div>
                      </td>
                      <td className="text-right nowrap">{formatMoney(session.openingCash)}</td>
                      <td className="text-right nowrap">{formatMoney(session.cashSales)}</td>
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
            Uang laci seharusnya = kas awal + seluruh penjualan tunai. Selisih = uang hasil hitung − uang
            seharusnya. Penjualan QRIS, debit, dan transfer tidak menambah uang tunai di laci.
          </p>
        </div>
      </section>
    </div>
  );
}
