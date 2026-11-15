import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Eye, ReceiptText, SearchX } from "lucide-react";
import { api } from "../lib/api";
import type { PaymentMethod, TransactionDetail, TransactionSummary } from "../types";
import { useDebouncedValue } from "../lib/hooks";
import {
  formatDateTime,
  formatMoney,
  formatPaymentMethod,
  formatSignedMoney,
  getErrorMessage,
  todayInputValue,
} from "../lib/utils";
import { useToast } from "../context/ToastContext";
import {
  Badge,
  Button,
  EmptyState,
  PageError,
  PageHeader,
  PageLoader,
  Pagination,
  SearchField,
} from "../components/ui";
import { ReceiptModal } from "../components/Receipt";

function paymentTone(method: PaymentMethod): "green" | "blue" | "purple" | "amber" {
  if (method === "cash") return "green";
  if (method === "qris") return "purple";
  if (method === "debit") return "blue";
  return "amber";
}

export function CashierHistoryPage() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDetail | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ["transactions", "my", { search: debouncedSearch, dateFrom, dateTo, page }],
    queryFn: () =>
      api.transactions.list({
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        limit: 15,
      }),
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateFrom, dateTo]);

  const openReceipt = async (transaction: TransactionSummary) => {
    setOpeningId(transaction.id);
    try {
      const result = await api.transactions.get(transaction.id);
      setSelectedTransaction(result.transaction);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setOpeningId(null);
    }
  };

  const setToday = () => {
    setDateFrom(todayInputValue());
    setDateTo(todayInputValue());
  };

  const hasFilters = search || dateFrom || dateTo;

  return (
    <div className="page-stack cashier-history-page">
      <PageHeader
        eyebrow="Aktivitas saya"
        title="Riwayat Transaksi"
        description="Semua transaksi yang Anda proses tersimpan di sini. Buka kembali struk kapan saja."
        actions={
          <Button variant="secondary" size="sm" icon={<CalendarDays size={16} />} onClick={setToday}>
            Hari ini
          </Button>
        }
      />

      <div className="transaction-summary-grid">
        <div className="summary-card">
          <span className="summary-card__icon summary-card__icon--green">
            <ReceiptText size={19} />
          </span>
          <div>
            <span>Transaksi ditemukan</span>
            <strong>{historyQuery.data?.summary.count ?? "—"}</strong>
          </div>
        </div>
        <div className="summary-card summary-card--wide">
          <span className="summary-card__icon summary-card__icon--blue">
            <WalletIcon />
          </span>
          <div>
            <span>Total nilai transaksi</span>
            <strong>{historyQuery.data ? formatMoney(historyQuery.data.summary.totalSales) : "—"}</strong>
          </div>
        </div>
      </div>

      <section className="panel">
        <div className="history-filter">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Cari nomor nota..."
            className="history-filter__search"
            ariaLabel="Cari riwayat transaksi"
          />
          <div className="date-range">
            <label>
              <span>Dari</span>
              <input
                type="date"
                className="input"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                max={dateTo || undefined}
              />
            </label>
            <span className="date-range__dash">—</span>
            <label>
              <span>Sampai</span>
              <input
                type="date"
                className="input"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                min={dateFrom || undefined}
              />
            </label>
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              icon={<SearchX size={15} />}
              onClick={() => {
                setSearch("");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Reset
            </Button>
          )}
        </div>

        {historyQuery.isLoading ? (
          <PageLoader label="Memuat riwayat transaksi..." />
        ) : historyQuery.isError ? (
          <PageError message={getErrorMessage(historyQuery.error)} onRetry={() => void historyQuery.refetch()} />
        ) : historyQuery.data?.items.length === 0 ? (
          <EmptyState
            icon={<ReceiptText size={24} />}
            title="Belum ada transaksi"
            description={
              hasFilters
                ? "Tidak ada transaksi yang sesuai filter. Coba ubah kata kunci atau tanggal."
                : "Transaksi yang Anda selesaikan akan tampil di sini beserta struknya."
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Tampilkan semua
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="cashier-transaction-list">
              {historyQuery.data?.items.map((transaction) => (
                <article className="cashier-transaction-card" key={transaction.id}>
                  <div className="cashier-transaction-card__icon">
                    <ReceiptText size={19} />
                  </div>
                  <div className="cashier-transaction-card__main">
                    <div>
                      <strong className="mono-text">{transaction.invoiceNumber}</strong>
                      <Badge tone={paymentTone(transaction.paymentMethod)}>
                        {formatPaymentMethod(transaction.paymentMethod)}
                      </Badge>
                    </div>
                    <span>{formatDateTime(transaction.createdAt)}</span>
                    <span>{transaction.itemCount} jenis produk</span>
                  </div>
                  <div className="cashier-transaction-card__amount">
                    <span>Total</span>
                    <strong>{formatMoney(transaction.total)}</strong>
                    {transaction.discountTotal > 0 && (
                      <span className="cashier-transaction-card__discount">
                        Hemat {formatMoney(transaction.discountTotal)}
                      </span>
                    )}
                    {transaction.roundingTotal !== 0 && (
                      <span className="cashier-transaction-card__rounding">
                        Bulat {formatSignedMoney(transaction.roundingTotal)}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Eye size={15} />}
                    loading={openingId === transaction.id}
                    onClick={() => void openReceipt(transaction)}
                  >
                    Lihat Struk
                  </Button>
                </article>
              ))}
            </div>
            <Pagination
              page={historyQuery.data?.page || 1}
              limit={historyQuery.data?.limit || 15}
              total={historyQuery.data?.total || 0}
              onPageChange={setPage}
            />
          </>
        )}
      </section>

      <ReceiptModal transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} />
    </div>
  );
}

function WalletIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3v4a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5" />
      <circle cx="16" cy="12" r=".5" fill="currentColor" />
    </svg>
  );
}
