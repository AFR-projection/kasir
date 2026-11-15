import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ClipboardList,
  History,
  PackageCheck,
  SlidersHorizontal,
  TrendingDown,
} from "lucide-react";
import { api } from "../lib/api";
import type { Product, StockMovement, StockMovementType } from "../types";
import { useDebouncedValue } from "../lib/hooks";
import {
  formatDateTime,
  formatMoney,
  formatMovementType,
  formatQuantity,
  getErrorMessage,
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
import { ProductImage } from "../components/ProductImage";

type StockTab = "current" | "history";
type AdjustmentMode = "in" | "out" | "adjustment";

function movementTone(type: StockMovementType): "green" | "red" | "blue" | "purple" | "amber" {
  if (type === "in") return "green";
  if (type === "out") return "red";
  if (type === "sale") return "purple";
  if (type === "void") return "amber";
  return "blue";
}

function signedQuantity(movement: StockMovement): string {
  const difference = movement.currentStock - movement.previousStock;
  const sign = difference > 0 ? "+" : difference < 0 ? "−" : "±";
  return `${sign}${formatQuantity(Math.abs(difference))}`;
}

export function OwnerStockPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<StockTab>("current");
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const productId = searchParams.get("product");
    if (!productId) return;

    let cancelled = false;
    setLoadingProduct(true);
    api.products
      .get(productId)
      .then((result) => {
        if (!cancelled) {
          setAdjustProduct(result.product);
          setTab("current");
        }
      })
      .catch((error) => {
        if (!cancelled) toast.error(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingProduct(false);
          const next = new URLSearchParams(searchParams);
          next.delete("product");
          setSearchParams(next, { replace: true });
        }
      });

    return () => {
      cancelled = true;
    };
    // Hanya dipicu saat parameter produk berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Kontrol persediaan"
        title="Stok & Riwayat"
        description="Pantau ketersediaan produk, lakukan penyesuaian, dan telusuri setiap perubahan stok."
        actions={
          loadingProduct ? (
            <Badge tone="blue" dot>
              Memuat produk...
            </Badge>
          ) : undefined
        }
      />

      <div className="tab-switcher" role="tablist" aria-label="Menu stok">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "current"}
          className={`tab-switcher__tab${tab === "current" ? " tab-switcher__tab--active" : ""}`}
          onClick={() => setTab("current")}
        >
          <Boxes size={17} />
          Stok Saat Ini
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          className={`tab-switcher__tab${tab === "history" ? " tab-switcher__tab--active" : ""}`}
          onClick={() => setTab("history")}
        >
          <History size={17} />
          Riwayat Perubahan
        </button>
      </div>

      {tab === "current" ? (
        <CurrentStockTab onAdjust={setAdjustProduct} />
      ) : (
        <StockHistoryTab />
      )}

      <StockAdjustmentModal
        product={adjustProduct}
        onClose={() => setAdjustProduct(null)}
      />
    </div>
  );
}

function CurrentStockTab({ onAdjust }: { onAdjust: (product: Product) => void }) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [categoryId, setCategoryId] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  });
  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.dashboard.get,
  });
  const productsQuery = useQuery({
    queryKey: ["products", { stockPage: true, search: debouncedSearch, categoryId, lowStockOnly, page }],
    queryFn: () =>
      api.products.list({
        search: debouncedSearch || undefined,
        categoryId: categoryId || undefined,
        lowStock: lowStockOnly ? "true" : undefined,
        page,
        limit: 15,
      }),
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryId, lowStockOnly]);

  const metrics = dashboardQuery.data?.metrics;

  return (
    <div className="stock-tab">
      {metrics && metrics.lowStockCount > 0 && (
        <div className="inline-banner inline-banner--red">
          <AlertTriangle size={20} />
          <div>
            <strong>{metrics.lowStockCount} produk perlu segera diisi ulang</strong>
            <p>
              {metrics.outOfStockCount > 0
                ? `${metrics.outOfStockCount} produk sudah habis dan tidak dapat dijual.`
                : "Stok produk sudah mencapai atau berada di bawah batas minimum."}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setLowStockOnly(true)}>
            Tampilkan
          </Button>
        </div>
      )}

      <div className="stock-summary-grid">
        <div className="mini-stat">
          <span className="mini-stat__icon mini-stat__icon--green">
            <PackageCheck size={18} />
          </span>
          <div>
            <span>Produk aktif</span>
            <strong>{metrics?.activeProducts ?? "—"}</strong>
          </div>
        </div>
        <div className="mini-stat">
          <span className="mini-stat__icon mini-stat__icon--amber">
            <TrendingDown size={18} />
          </span>
          <div>
            <span>Stok menipis</span>
            <strong>{metrics?.lowStockCount ?? "—"}</strong>
          </div>
        </div>
        <div className="mini-stat">
          <span className="mini-stat__icon mini-stat__icon--red">
            <AlertTriangle size={18} />
          </span>
          <div>
            <span>Stok habis</span>
            <strong>{metrics?.outOfStockCount ?? "—"}</strong>
          </div>
        </div>
      </div>

      <section className="panel">
        <div className="filter-bar">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Cari produk..."
            className="filter-bar__search"
            ariaLabel="Cari produk untuk stok"
          />
          <select
            className="select"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            aria-label="Filter kategori stok"
          >
            <option value="">Semua kategori</option>
            {categoriesQuery.data?.categories.map((category) => (
              <option value={category.id} key={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <label className="check-filter">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(event) => setLowStockOnly(event.target.checked)}
            />
            <span>Stok menipis saja</span>
          </label>
        </div>

        {productsQuery.isLoading ? (
          <PageLoader label="Memuat stok..." />
        ) : productsQuery.isError ? (
          <PageError message={getErrorMessage(productsQuery.error)} onRetry={() => void productsQuery.refetch()} />
        ) : productsQuery.data?.items.length === 0 ? (
          <EmptyState
            icon={<Boxes size={24} />}
            title="Tidak ada produk"
            description={
              lowStockOnly
                ? "Semua stok dalam kondisi aman atau filter tidak menemukan produk."
                : "Belum ada produk yang dapat ditampilkan."
            }
            action={
              lowStockOnly ? (
                <Button variant="secondary" size="sm" onClick={() => setLowStockOnly(false)}>
                  Tampilkan semua
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="stock-list">
              {productsQuery.data?.items.map((product) => (
                <div className="stock-row" key={product.id}>
                  <ProductImage src={product.imageUrl} name={product.name} />
                  <div className="stock-row__product">
                    <strong>{product.name}</strong>
                    <span>
                      {product.categoryName} · {formatMoney(product.sellingPrice)} / {product.unit}
                    </span>
                  </div>
                  <div className="stock-row__numbers">
                    <div>
                      <span>Stok</span>
                      <strong className={product.lowStock ? "stock-warning-text" : ""}>
                        {formatQuantity(product.stock)} {product.unit}
                      </strong>
                    </div>
                    <div>
                      <span>Minimum</span>
                      <strong>
                        {formatQuantity(product.minStock)} {product.unit}
                      </strong>
                    </div>
                  </div>
                  <Badge tone={product.stock === 0 ? "red" : product.lowStock ? "amber" : "green"} dot>
                    {product.stock === 0 ? "Habis" : product.lowStock ? "Menipis" : "Aman"}
                  </Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<SlidersHorizontal size={15} />}
                    onClick={() => onAdjust(product)}
                  >
                    Sesuaikan
                  </Button>
                </div>
              ))}
            </div>
            <Pagination
              page={productsQuery.data?.page || 1}
              limit={productsQuery.data?.limit || 15}
              total={productsQuery.data?.total || 0}
              onPageChange={setPage}
            />
          </>
        )}
      </section>
    </div>
  );
}

function StockHistoryTab() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [movementType, setMovementType] = useState<"all" | StockMovementType>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const historyQuery = useQuery({
    queryKey: ["stock-movements", { search: debouncedSearch, movementType, dateFrom, dateTo, page }],
    queryFn: () =>
      api.stockMovements.list({
        search: debouncedSearch || undefined,
        movementType,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        limit: 20,
      }),
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, movementType, dateFrom, dateTo]);

  const hasFilters = search || movementType !== "all" || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch("");
    setMovementType("all");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <section className="panel">
      <div className="history-filter">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Cari produk, pengguna, atau catatan..."
          className="history-filter__search"
          ariaLabel="Cari riwayat stok"
        />
        <select
          className="select"
          value={movementType}
          onChange={(event) => setMovementType(event.target.value as "all" | StockMovementType)}
          aria-label="Filter jenis perubahan"
        >
          <option value="all">Semua jenis</option>
          <option value="in">Stok masuk</option>
          <option value="out">Stok keluar</option>
          <option value="adjustment">Penyesuaian</option>
          <option value="sale">Penjualan</option>
          <option value="void">Pembatalan / retur</option>
        </select>
        <div className="date-range">
          <label>
            <span>Dari</span>
            <input
              type="date"
              className="input"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              max={dateTo || undefined}
              aria-label="Tanggal mulai"
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
              aria-label="Tanggal akhir"
            />
          </label>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Reset
          </Button>
        )}
      </div>

      {historyQuery.isLoading ? (
        <PageLoader label="Memuat riwayat stok..." />
      ) : historyQuery.isError ? (
        <PageError message={getErrorMessage(historyQuery.error)} onRetry={() => void historyQuery.refetch()} />
      ) : historyQuery.data?.items.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={24} />}
          title="Belum ada riwayat"
          description="Semua perubahan stok, termasuk penjualan dan penyesuaian manual, akan tercatat di sini."
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table history-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Produk</th>
                  <th>Jenis</th>
                  <th className="text-right">Perubahan</th>
                  <th>Stok</th>
                  <th>Pengguna</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {historyQuery.data?.items.map((movement) => (
                  <tr key={movement.id}>
                    <td className="nowrap muted-cell">{formatDateTime(movement.createdAt)}</td>
                    <td>
                      <strong>{movement.productName}</strong>
                      {movement.invoiceNumber && (
                        <span className="table-subline mono-text">{movement.invoiceNumber}</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={movementTone(movement.movementType)}>{formatMovementType(movement.movementType)}</Badge>
                    </td>
                    <td className="text-right strong-cell nowrap">
                      {signedQuantity(movement)}
                    </td>
                    <td className="nowrap muted-cell">
                      {formatQuantity(movement.previousStock)} → {formatQuantity(movement.currentStock)}
                    </td>
                    <td>{movement.userName}</td>
                    <td className="notes-cell">{movement.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={historyQuery.data?.page || 1}
            limit={historyQuery.data?.limit || 20}
            total={historyQuery.data?.total || 0}
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}

const adjustmentCopy: Record<AdjustmentMode, { label: string; description: string; icon: React.ReactNode }> = {
  in: {
    label: "Tambah Stok",
    description: "Catat barang masuk secara manual.",
    icon: <ArrowDownToLine size={17} />,
  },
  out: {
    label: "Kurangi Stok",
    description: "Catat barang keluar di luar transaksi penjualan.",
    icon: <ArrowUpFromLine size={17} />,
  },
  adjustment: {
    label: "Setel Stok",
    description: "Sesuaikan jumlah stok dengan hasil hitung fisik.",
    icon: <SlidersHorizontal size={17} />,
  },
};

function StockAdjustmentModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AdjustmentMode>("in");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (product) {
      setMode("in");
      setQuantity("");
      setNotes("");
      setError("");
    }
  }, [product]);

  if (!product) return null;

  const numericQuantity = Number(quantity);
  let previewStock = product.stock;
  if (quantity !== "" && Number.isFinite(numericQuantity)) {
    if (mode === "in") previewStock = product.stock + numericQuantity;
    if (mode === "out") previewStock = product.stock - numericQuantity;
    if (mode === "adjustment") previewStock = numericQuantity;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (quantity === "" || Number.isNaN(numericQuantity)) {
      setError("Jumlah wajib diisi dengan angka.");
      return;
    }
    if (numericQuantity < 0) {
      setError("Jumlah tidak boleh negatif.");
      return;
    }
    if (mode !== "adjustment" && numericQuantity <= 0) {
      setError("Jumlah harus lebih dari 0.");
      return;
    }
    if (previewStock < 0) {
      setError(`Stok tidak cukup. Stok saat ini ${formatQuantity(product.stock)} ${product.unit}.`);
      return;
    }
    if (mode === "adjustment" && previewStock === product.stock) {
      setError("Stok baru sama dengan stok saat ini.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.products.adjustStock(product.id, {
        movementType: mode,
        quantity: numericQuantity,
        notes: notes.trim() || undefined,
      });
      toast.success(result.message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["stock-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      onClose();
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
      title="Sesuaikan Stok"
      subtitle={`${product.name} · ${formatQuantity(product.stock)} ${product.unit} tersedia`}
      size="md"
      closeOnOverlay={!submitting}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" form="stock-adjustment-form" loading={submitting}>
            Simpan Perubahan
          </Button>
        </>
      }
    >
      <form id="stock-adjustment-form" className="form-stack" onSubmit={handleSubmit} noValidate>
        <div className="adjustment-modes">
          {(Object.keys(adjustmentCopy) as AdjustmentMode[]).map((modeKey) => (
            <button
              key={modeKey}
              type="button"
              className={`adjustment-mode${mode === modeKey ? " adjustment-mode--active" : ""}`}
              onClick={() => {
                setMode(modeKey);
                setQuantity("");
                setError("");
              }}
            >
              {adjustmentCopy[modeKey].icon}
              <strong>{adjustmentCopy[modeKey].label}</strong>
              <span>{adjustmentCopy[modeKey].description}</span>
            </button>
          ))}
        </div>

        <div className="stock-adjustment-summary">
          <div>
            <span>Stok saat ini</span>
            <strong>{formatQuantity(product.stock)} {product.unit}</strong>
          </div>
          <span className="stock-adjustment-summary__arrow">→</span>
          <div>
            <span>Stok setelah perubahan</span>
            <strong className={previewStock < 0 ? "stock-warning-text" : ""}>
              {Number.isFinite(previewStock) ? formatQuantity(previewStock) : "—"} {product.unit}
            </strong>
          </div>
        </div>

        <Field
          label={
            mode === "in"
              ? `Jumlah stok masuk (${product.unit})`
              : mode === "out"
                ? `Jumlah stok keluar (${product.unit})`
                : `Jumlah stok baru (${product.unit})`
          }
          htmlFor="adjustment-quantity"
          required
        >
          <div className="input-suffix">
            <input
              id="adjustment-quantity"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="0"
              autoFocus
            />
            <span>{product.unit}</span>
          </div>
        </Field>

        <Field label="Catatan" htmlFor="adjustment-notes" hint="Opsional. Contoh: kiriman dari supplier, koreksi stok opname.">
          <textarea
            id="adjustment-notes"
            className="textarea"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            placeholder="Tambahkan keterangan perubahan stok..."
          />
        </Field>

        {error && <div className="auth-alert auth-alert--error">{error}</div>}
      </form>
    </Modal>
  );
}
