import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ReceiptText, SearchX, WalletCards } from "lucide-react";
import { api } from "../lib/api";
import type { PaymentMethod, TransactionDetail, TransactionSummary } from "../types";
import { useDebouncedValue } from "../lib/hooks";
import {
  dateInputDaysAgo,
  formatDateTime,
  formatMoney,
  formatMoneyCompact,
  formatPaymentMethod,
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

type DatePreset = "today" | "7days" | "month" | "all";

function paymentTone(method: PaymentMethod): "green" | "blue" | "purple" | "amber" {
  if (method === "cash") return "green";
  if (method === "qris") return "purple";
  if (method === "debit") return "blue";
  return "amber";
}

export function OwnerTransactionsPage() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [preset, setPreset] = useState<DatePreset>("all");
  const [page, setPage] = useState(1);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDetail | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const transactionsQuery = useQuery({
    queryKey: ["transactions", { search: debouncedSearch, dateFrom, dateTo, page }],
    queryFn: () =>
      api.transactions.list({
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        limit: 20,
      }),
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateFrom, dateTo]);

  const applyPreset = (nextPreset: DatePreset) => {
    setPreset(nextPreset);
    if (nextPreset === "today") {
      const today = todayInputValue();
      setDateFrom(today);
      setDateTo(today);
    } else if (nextPreset === "7days") {
      setDateFrom(dateInputDaysAgo(6));
      setDateTo(todayInputValue());
    } else if (nextPreset === "month") {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const year = first.getFullYear();
      const month = String(first.getMonth() + 1).padStart(2, "0");
      setDateFrom(`${year}-${month}-01`);
      setDateTo(todayInputValue());
    } else {
      setDateFrom("");
      setDateTo("");
    }
  };

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

  const summary = transactionsQuery.data?.summary;
  const average = summary && summary.count > 0 ? summary.totalSales / summary.count : 0;
  const hasFilters = search || dateFrom || dateTo;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Penjualan toko"
        title="Transaksi"
        description="Telusuri seluruh transaksi kasir, periksa pembayaran, dan cetak ulang struk."
      />

      <div className="transaction-summary-grid">
        <div className="summary-card">
          <span className="summary-card__icon summary-card__icon--green">
            <ReceiptText size={19} />
          </span>
          <div>
            <span>Jumlah transaksi</span>
            <strong>{summary?.count ?? "—"}</strong>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-card__icon summary-card__icon--blue">
            <WalletCards size={19} />
          </span>
          <div>
            <span>Total penjualan</span>
            <strong>{summary ? formatMoney(summary.totalSales) : "—"}</strong>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-card__icon summary-card__icon--amber">
            <CalendarRange size={19} />
          </span>
          <div>
            <span>Rata-rata transaksi</span>
            <strong>{formatMoneyCompact(average)}</strong>
          </div>
        </div>
      </div>

      <section className="panel">
        <div className="transaction-toolbar">
          <div className="preset-row">
            {(
              [
                ["today", "Hari ini"],
                ["7days", "7 hari"],
                ["month", "Bulan ini"],
                ["all", "Semua"],
              ] as Array<[DatePreset, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`filter-chip${preset === value ? " filter-chip--active" : ""}`}
                onClick={() => applyPreset(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Cari nomor nota atau kasir..."
            className="transaction-toolbar__search"
            ariaLabel="Cari transaksi"
          />
          <div className="date-range">
            <label>
              <span>Dari</span>
              <input
                type="date"
                className="input"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  setPreset("all");
                }}
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
                onChange={(event) => {
                  setDateTo(event.target.value);
                  setPreset("all");
                }}
                min={dateFrom || undefined}
              />
            </label>
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setDateFrom("");
                setDateTo("");
                setPreset("all");
              }}
              icon={<SearchX size={15} />}
            >
              Reset
            </Button>
          )}
        </div>

        {transactionsQuery.isLoading ? (
          <PageLoader label="Memuat transaksi..." />
        ) : transactionsQuery.isError ? (
          <PageError
            message={getErrorMessage(transactionsQuery.error)}
            onRetry={() => void transactionsQuery.refetch()}
          />
        ) : transactionsQuery.data?.items.length === 0 ? (
          <EmptyState
            icon={<ReceiptText size={24} />}
            title="Tidak ada transaksi"
            description="Transaksi yang sesuai filter belum tersedia. Coba ubah rentang tanggal atau kata kunci."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table transaction-table">
                <thead>
                  <tr>
                    <th>Nomor Nota</th>
                    <th>Waktu</th>
                    <th>Kasir</th>
                    <th>Item</th>
                    <th>Pembayaran</th>
                    <th className="text-right">Total</th>
                    <th aria-label="Aksi" />
                  </tr>
                </thead>
                <tbody>
                  {transactionsQuery.data?.items.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>
                        <span className="mono-text strong-cell">{transaction.invoiceNumber}</span>
                      </td>
                      <td className="muted-cell nowrap">{formatDateTime(transaction.createdAt)}</td>
                      <td>{transaction.cashierName}</td>
                      <td className="muted-cell">{transaction.itemCount} item</td>
                      <td>
                        <Badge tone={paymentTone(transaction.paymentMethod)}>
                          {formatPaymentMethod(transaction.paymentMethod)}
                        </Badge>
                      </td>
                      <td className="text-right strong-cell nowrap">
                        {formatMoney(transaction.total)}
                        {transaction.discountTotal > 0 && (
                          <span className="transaction-discount-note">
                            Nego −{formatMoney(transaction.discountTotal)}
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={openingId === transaction.id}
                          onClick={() => void openReceipt(transaction)}
                        >
                          Struk
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={transactionsQuery.data?.page || 1}
              limit={transactionsQuery.data?.limit || 20}
              total={transactionsQuery.data?.total || 0}
              onPageChange={setPage}
            />
          </>
        )}
      </section>

      <ReceiptModal transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} />
    </div>
  );
}
