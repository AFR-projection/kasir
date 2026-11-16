import { FormEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CalendarRange,
  ChartPie,
  Info,
  LockKeyhole,
  ReceiptText,
  RotateCcw,
  SearchX,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  CategoryRevenue,
  PaymentMethod,
  TransactionDetail,
  TransactionStatus,
  TransactionSummary,
  VoidType,
} from "../types";
import { useDebouncedValue } from "../lib/hooks";
import {
  dateInputDaysAgo,
  formatDateTime,
  formatMoney,
  formatMoneyCompact,
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
  Field,
  Modal,
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

function statusLabel(status: TransactionStatus, voidType: VoidType | null): string {
  if (status === "voided") return voidType === "return" ? "Retur" : "Dibatalkan";
  return "Selesai";
}

const categoryTones = ["green", "amber", "blue", "purple", "red"] as const;
type CategoryTone = (typeof categoryTones)[number];

function categoryTone(index: number): CategoryTone {
  return categoryTones[index % categoryTones.length];
}

const reportDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const shareFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
});

function formatReportDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return reportDateFormatter.format(new Date(year, month - 1, day));
}

function formatShare(value: number): string {
  return `${shareFormatter.format(value)}%`;
}

function categoryKey(category: CategoryRevenue): string {
  return `${category.categoryId ?? "tanpa-kategori"}:${category.categoryName}`;
}

export function OwnerTransactionsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [preset, setPreset] = useState<DatePreset>("all");
  const [status, setStatus] = useState<"all" | TransactionStatus>("all");
  const [page, setPage] = useState(1);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDetail | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<TransactionSummary | null>(null);

  const transactionsQuery = useQuery({
    queryKey: ["transactions", { search: debouncedSearch, dateFrom, dateTo, status, page }],
    queryFn: () =>
      api.transactions.list({
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        status,
        page,
        limit: 20,
      }),
  });

  const categoryReportQuery = useQuery({
    queryKey: ["category-report", { search: debouncedSearch, dateFrom, dateTo }],
    queryFn: () =>
      api.transactions.categoryReport({
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateFrom, dateTo, status]);

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
  const average =
    summary && summary.completedCount > 0 ? summary.totalSales / summary.completedCount : 0;
  const hasFilters = search || dateFrom || dateTo || status !== "all";
  const categoryReport = categoryReportQuery.data?.report;
  const reportRangeLabel =
    dateFrom && dateTo
      ? dateFrom === dateTo
        ? formatReportDate(dateFrom)
        : `${formatReportDate(dateFrom)} - ${formatReportDate(dateTo)}`
      : dateFrom
        ? `sejak ${formatReportDate(dateFrom)}`
        : dateTo
          ? `sampai ${formatReportDate(dateTo)}`
          : "semua waktu";

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
            <span>Transaksi selesai</span>
            <strong>{summary?.completedCount ?? "—"}</strong>
            {summary && summary.voidedCount > 0 && (
              <small className="summary-card__note">
                {summary.voidedCount} dibatalkan/diretur
              </small>
            )}
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-card__icon summary-card__icon--blue">
            <WalletCards size={19} />
          </span>
          <div>
            <span>Total penjualan</span>
            <strong>{summary ? formatMoney(summary.totalSales) : "—"}</strong>
            <small className="summary-card__note">Transaksi void tidak dihitung</small>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-card__icon summary-card__icon--amber">
            <CalendarRange size={19} />
          </span>
          <div>
            <span>Rata-rata transaksi</span>
            <strong>{formatMoneyCompact(average)}</strong>
            <small className="summary-card__note">Dari transaksi selesai</small>
          </div>
        </div>
      </div>

      <section className="panel category-report" aria-labelledby="category-report-title">
        <div className="category-report__header">
          <div className="category-report__heading">
            <span className="category-report__icon">
              <ChartPie size={20} />
            </span>
            <div>
              <p className="panel__eyebrow">Analisis penjualan</p>
              <h2 id="category-report-title">Pendapatan per Kategori</h2>
              <p className="category-report__description">
                Transaksi selesai pada {reportRangeLabel}
                {debouncedSearch ? ` untuk pencarian "${debouncedSearch}"` : ""}. Void dan retur
                tidak dihitung.
              </p>
            </div>
          </div>
          <div className="category-report__total">
            <span>Total pendapatan</span>
            <strong>{categoryReport ? formatMoney(categoryReport.totalRevenue) : "-"}</strong>
            <small>
              {categoryReport
                ? `${categoryReport.categoryCount} kategori · ${categoryReport.transactionCount} transaksi`
                : "Menghitung pendapatan..."}
            </small>
          </div>
        </div>

        {categoryReportQuery.isLoading ? (
          <PageLoader label="Menghitung pendapatan per kategori..." />
        ) : categoryReportQuery.isError ? (
          <PageError
            message={getErrorMessage(categoryReportQuery.error)}
            onRetry={() => void categoryReportQuery.refetch()}
          />
        ) : categoryReport && categoryReport.categories.length > 0 ? (
          <div className="category-report__body">
            <div
              className="category-mix"
              role="img"
              aria-label={`Komposisi pendapatan: ${categoryReport.categories
                .map((category) => `${category.categoryName} ${formatShare(category.share)}`)
                .join(", ")}`}
            >
              {categoryReport.categories.map((category, index) => (
                <span
                  key={categoryKey(category)}
                  className={`category-mix__segment category-mix__segment--${categoryTone(index)}`}
                  style={{ width: `${category.share}%` }}
                />
              ))}
            </div>

            <div className="category-revenue-list">
              {categoryReport.categories.map((category, index) => (
                <article
                  key={categoryKey(category)}
                  className={`category-revenue-card category-revenue-card--${categoryTone(index)}`}
                >
                  <div className="category-revenue-card__top">
                    <span className="category-revenue-card__rank">{index + 1}</span>
                    <div className="category-revenue-card__name">
                      <strong>{category.categoryName}</strong>
                      <span>
                        {category.transactionCount} transaksi · {category.itemCount} baris item
                      </span>
                    </div>
                    <div className="category-revenue-card__value">
                      <strong>{formatMoney(category.revenue)}</strong>
                      <span>{formatShare(category.share)} dari pendapatan</span>
                    </div>
                  </div>
                  <div className="category-revenue-card__bar" aria-hidden="true">
                    <span style={{ width: `${category.share}%` }} />
                  </div>
                </article>
              ))}
            </div>

            <p className="category-report__footnote">
              <Info size={14} />
              Pendapatan kategori mengikuti total baris item, termasuk nego dan pembulatan
              timbangan. Persentase dihitung dari total pendapatan pada rentang tanggal ini.
            </p>
          </div>
        ) : (
          <EmptyState
            compact
            icon={<ChartPie size={23} />}
            title="Belum ada pendapatan kategori"
            description="Belum ada transaksi selesai pada rentang tanggal dan pencarian ini. Coba ubah filter atau pilih rentang tanggal lain."
          />
        )}
      </section>

      <section className="panel">
        <div className="transaction-toolbar">
          <div className="transaction-status-filter" role="group" aria-label="Filter status transaksi">
            {(
              [
                ["all", "Semua status"],
                ["completed", "Selesai"],
                ["voided", "Void / retur"],
              ] as Array<["all" | TransactionStatus, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`filter-chip${status === value ? " filter-chip--active" : ""}`}
                onClick={() => setStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>
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
                setStatus("all");
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
                    <th>Status</th>
                    <th className="text-right">Total</th>
                    <th aria-label="Aksi" />
                  </tr>
                </thead>
                <tbody>
                  {transactionsQuery.data?.items.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className={transaction.status === "voided" ? "transaction-row--voided" : undefined}
                    >
                      <td>
                        <span className="mono-text strong-cell">{transaction.invoiceNumber}</span>
                        {transaction.status === "voided" && transaction.voidReason && (
                          <span className="transaction-void-reason" title={transaction.voidReason}>
                            {transaction.voidReason}
                          </span>
                        )}
                      </td>
                      <td className="muted-cell nowrap">{formatDateTime(transaction.createdAt)}</td>
                      <td>{transaction.cashierName}</td>
                      <td className="muted-cell">{transaction.itemCount} item</td>
                      <td>
                        <Badge tone={paymentTone(transaction.paymentMethod)}>
                          {formatPaymentMethod(transaction.paymentMethod)}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={transaction.status === "voided" ? "red" : "green"}>
                          {statusLabel(transaction.status, transaction.voidType)}
                        </Badge>
                        {transaction.status === "voided" && (
                          <span className="transaction-void-meta">
                            {transaction.voidedBy?.name ?? "Owner"}
                            {transaction.voidedAt && ` · ${formatDateTime(transaction.voidedAt)}`}
                          </span>
                        )}
                      </td>
                      <td
                        className={`text-right strong-cell nowrap${
                          transaction.status === "voided" ? " transaction-total--voided" : ""
                        }`}
                      >
                        {formatMoney(transaction.total)}
                        {transaction.discountTotal > 0 && (
                          <span className="transaction-discount-note">
                            Nego −{formatMoney(transaction.discountTotal)}
                          </span>
                        )}
                        {transaction.roundingTotal !== 0 && (
                          <span className="transaction-discount-note transaction-rounding-note">
                            Bulat {formatSignedMoney(transaction.roundingTotal)}
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="transaction-row-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={openingId === transaction.id}
                            onClick={() => void openReceipt(transaction)}
                          >
                            Struk
                          </Button>
                          {transaction.status === "completed" &&
                            (transaction.canVoid ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Ban size={14} />}
                                onClick={() => setVoidTarget(transaction)}
                              >
                                Batalkan
                              </Button>
                            ) : (
                              <span
                                className="transaction-void-locked"
                                title="Pembatalan hanya bisa dilakukan selama sesi kas transaksi masih terbuka."
                              >
                                <LockKeyhole size={12} />
                                Terkunci
                              </span>
                            ))}
                        </div>
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

      {voidTarget && (
        <VoidTransactionModal
          transaction={voidTarget}
          onClose={() => setVoidTarget(null)}
          onSuccess={(transaction, message) => {
            toast.success(message);
            setVoidTarget(null);
            setSelectedTransaction((current) =>
              current && current.id === transaction.id ? transaction : current,
            );
            void queryClient.invalidateQueries({ queryKey: ["transactions"] });
            void queryClient.invalidateQueries({ queryKey: ["category-report"] });
            void queryClient.invalidateQueries({ queryKey: ["transaction"] });
            void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            void queryClient.invalidateQueries({ queryKey: ["products"] });
            void queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
            void queryClient.invalidateQueries({ queryKey: ["cash-session"] });
          }}
        />
      )}
    </div>
  );
}

interface VoidTransactionModalProps {
  transaction: TransactionSummary;
  onClose: () => void;
  onSuccess: (transaction: TransactionDetail, message: string) => void;
}

function VoidTransactionModal({ transaction, onClose, onSuccess }: VoidTransactionModalProps) {
  const [type, setType] = useState<VoidType>("void");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setError("Alasan minimal 3 karakter agar jejak audit jelas.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.transactions.voidTransaction(transaction.id, {
        type,
        reason: trimmedReason,
      });
      onSuccess(result.transaction, result.message);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !submitting && onClose()}
      title={type === "return" ? "Retur Transaksi" : "Batalkan Transaksi"}
      subtitle={`${transaction.invoiceNumber} · ${formatMoney(transaction.total)}`}
      size="sm"
      closeOnOverlay={!submitting}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            type="submit"
            form="void-transaction-form"
            variant={type === "void" ? "danger" : "primary"}
            loading={submitting}
            icon={!submitting ? type === "return" ? <RotateCcw size={17} /> : <Ban size={17} /> : undefined}
          >
            {type === "return" ? "Proses Retur" : "Batalkan Transaksi"}
          </Button>
        </>
      }
    >
      <form id="void-transaction-form" className="form-stack" onSubmit={handleSubmit} noValidate>
        <div className="void-transaction-warning">
          <ShieldAlert size={18} />
          <p>
            Stok seluruh item akan dikembalikan, dan transaksi ini tidak lagi dihitung dalam
            laporan penjualan maupun rekap kas. Tindakan ini tidak dapat dibatalkan.
          </p>
        </div>

        <div>
          <span className="field__label">Jenis koreksi</span>
          <div className="void-type-options" role="radiogroup" aria-label="Jenis koreksi">
            <button
              type="button"
              role="radio"
              aria-checked={type === "void"}
              className={`void-type-option${type === "void" ? " void-type-option--active" : ""}`}
              onClick={() => {
                setType("void");
                setError("");
              }}
            >
              <Ban size={18} />
              <span>
                <strong>Pembatalan</strong>
                <small>Transaksi tidak sah, salah input, atau gagal diproses.</small>
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={type === "return"}
              className={`void-type-option${type === "return" ? " void-type-option--active" : ""}`}
              onClick={() => {
                setType("return");
                setError("");
              }}
            >
              <RotateCcw size={18} />
              <span>
                <strong>Retur</strong>
                <small>Barang dikembalikan pelanggan setelah transaksi selesai.</small>
              </span>
            </button>
          </div>
        </div>

        <div className="void-transaction-meta">
          <div>
            <span>Kasir</span>
            <strong>{transaction.cashierName}</strong>
          </div>
          <div>
            <span>Metode</span>
            <strong>{formatPaymentMethod(transaction.paymentMethod)}</strong>
          </div>
          <div>
            <span>Waktu</span>
            <strong>{formatDateTime(transaction.createdAt)}</strong>
          </div>
        </div>

        {transaction.paymentMethod === "cash" && (
          <div className="void-cash-note">
            <WalletCards size={16} />
            <p>
              Kembalikan uang tunai sebesar <strong>{formatMoney(transaction.total)}</strong> kepada
              pelanggan dan pastikan isi laci sesuai sebelum kas ditutup.
            </p>
          </div>
        )}

        <Field
          label="Alasan pembatalan / retur"
          htmlFor="void-reason"
          hint={`Wajib diisi 3–300 karakter. ${reason.length}/300`}
          required
        >
          <textarea
            id="void-reason"
            rows={3}
            maxLength={300}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError("");
            }}
            placeholder={
              type === "return"
                ? "Misalnya: produk rusak, pelanggan menukar barang..."
                : "Misalnya: salah input jumlah, transaksi ganda..."
            }
            autoFocus
          />
        </Field>

        {error && <div className="auth-alert auth-alert--error">{error}</div>}
      </form>
    </Modal>
  );
}
