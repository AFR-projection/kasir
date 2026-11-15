import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  PackageCheck,
  ReceiptText,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { api } from "../lib/api";
import type { DashboardData, TransactionDetail, TransactionSummary } from "../types";
import { formatDateTime, formatDayShort, formatMoney, formatMoneyCompact, formatQuantity, getErrorMessage } from "../lib/utils";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { PageError, PageHeader, PageLoader, Badge, Button, EmptyState } from "../components/ui";
import { ProductImage } from "../components/ProductImage";
import { ReceiptModal } from "../components/Receipt";
import { useNavigate } from "react-router-dom";

function MetricCard({
  label,
  value,
  helper,
  icon,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  tone: "green" | "amber" | "blue" | "red";
}) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__top">
        <span>{label}</span>
        <div className="metric-card__icon">{icon}</div>
      </div>
      <strong>{value}</strong>
      <p>{helper}</p>
    </article>
  );
}

function SalesChart({ data }: { data: DashboardData["salesSeries"] }) {
  const gradientId = useId().replace(/:/g, "");
  const max = Math.max(...data.map((day) => day.total), 1);
  const weekTotal = data.reduce((total, day) => total + day.total, 0);
  const width = 720;
  const height = 240;
  const padding = { top: 20, right: 10, bottom: 30, left: 10 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const points = data.map((day, index) => ({
    ...day,
    x: padding.left + step * index,
    y: padding.top + plotHeight - (day.total / max) * plotHeight,
  }));
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = `${linePath} L${last.x.toFixed(1)},${(padding.top + plotHeight).toFixed(1)} L${first.x.toFixed(1)},${(padding.top + plotHeight).toFixed(1)} Z`;
  const gridLines = [0, 0.5, 1].map((ratio) => ({
    y: padding.top + plotHeight * ratio,
    value: max * (1 - ratio),
  }));

  return (
    <section className="panel chart-panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Performa penjualan</p>
          <h2>Tujuh hari terakhir</h2>
        </div>
        <div className="chart-panel__total">
          <span>Total minggu ini</span>
          <strong>{formatMoney(weekTotal)}</strong>
        </div>
      </div>

      <div className="sales-chart">
        <svg
          className="sales-chart__svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Grafik penjualan tujuh hari terakhir"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.24" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridLines.map((line) => (
            <g key={line.y}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={line.y}
                y2={line.y}
                stroke="var(--line)"
                strokeDasharray="2 8"
              />
              <text
                x={width - padding.right}
                y={Math.max(12, line.y - 7)}
                textAnchor="end"
                className="sales-chart__axis-label"
              >
                {formatMoneyCompact(line.value)}
              </text>
            </g>
          ))}

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((point, index) => (
            <circle
              key={point.date}
              cx={point.x}
              cy={point.y}
              r={index === points.length - 1 ? 4.6 : 3.2}
              fill={index === points.length - 1 ? "var(--brand)" : "var(--surface)"}
              stroke="var(--brand)"
              strokeWidth="2"
            >
              <title>
                {formatDayShort(point.date)}: {formatMoney(point.total)} ({point.count} transaksi)
              </title>
            </circle>
          ))}

          {points.map((point) => (
            <text
              key={`label-${point.date}`}
              x={point.x}
              y={height - 7}
              textAnchor="middle"
              className="sales-chart__day-label"
            >
              {formatDayShort(point.date)}
            </text>
          ))}
        </svg>
      </div>
    </section>
  );
}

export function OwnerDashboardPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDetail | null>(null);
  const [openingReceipt, setOpeningReceipt] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.dashboard.get,
  });

  const openReceipt = async (transaction: TransactionSummary) => {
    setOpeningReceipt(true);
    setSelectedId(transaction.id);
    try {
      const result = await api.transactions.get(transaction.id);
      setSelectedTransaction(result.transaction);
    } catch (error) {
      toast.error(getErrorMessage(error));
      setSelectedId(null);
    } finally {
      setOpeningReceipt(false);
    }
  };

  if (dashboardQuery.isLoading) return <PageLoader label="Memuat ringkasan toko..." />;
  if (dashboardQuery.isError) {
    return (
      <PageError
        message={getErrorMessage(dashboardQuery.error)}
        onRetry={() => void dashboardQuery.refetch()}
      />
    );
  }

  const data = dashboardQuery.data;
  if (!data) return null;

  const firstName = user?.name.split(" ")[0] || "Pemilik";
  const maxTopRevenue = Math.max(...data.topProducts.map((product) => product.revenue), 1);
  const todayLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Dashboard pemilik"
        title={`Selamat datang, ${firstName}.`}
        description="Pantau performa toko, stok, dan transaksi terbaru dari satu tempat."
        actions={
          <>
            <span className="date-chip">
              <CalendarDays size={16} />
              {todayLabel}
            </span>
            <Link to="/owner/products" className="btn btn--primary btn--md">
              <ShoppingBag size={17} /> Kelola produk
            </Link>
          </>
        }
      />

      <div className="metric-grid">
        <MetricCard
          label="Penjualan Hari Ini"
          value={formatMoney(data.metrics.todaySales)}
          helper={`${data.metrics.todayTransactions} transaksi · rata-rata ${formatMoneyCompact(
            data.metrics.averageTransaction,
          )}`}
          icon={<Wallet size={20} />}
          tone="green"
        />
        <MetricCard
          label="Penjualan Bulan Ini"
          value={formatMoney(data.metrics.monthSales)}
          helper={`${data.metrics.totalTransactions} transaksi tercatat`}
          icon={<TrendingUp size={20} />}
          tone="blue"
        />
        <MetricCard
          label="Produk Aktif"
          value={String(data.metrics.activeProducts)}
          helper={`Dari ${data.metrics.totalProducts} produk terdaftar`}
          icon={<PackageCheck size={20} />}
          tone="amber"
        />
        <MetricCard
          label="Stok Menipis"
          value={String(data.metrics.lowStockCount)}
          helper={
            data.metrics.outOfStockCount > 0
              ? `${data.metrics.outOfStockCount} produk habis`
              : "Tidak ada produk yang habis"
          }
          icon={<CircleAlert size={20} />}
          tone="red"
        />
      </div>

      <div className="dashboard-grid">
        <SalesChart data={data.salesSeries} />

        <section className="panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Perlu perhatian</p>
              <h2>Stok Menipis</h2>
            </div>
            <Link to="/owner/stock" className="text-link">
              Kelola stok <ArrowRight size={15} />
            </Link>
          </div>

          {data.lowStockProducts.length === 0 ? (
            <EmptyState
              compact
              icon={<PackageCheck size={22} />}
              title="Stok aman"
              description="Semua produk aktif berada di atas batas minimum."
            />
          ) : (
            <div className="low-stock-list">
              {data.lowStockProducts.map((product) => (
                <div className="low-stock-item" key={product.id}>
                  <ProductImage src={product.imageUrl} name={product.name} size="sm" />
                  <div className="low-stock-item__info">
                    <strong>{product.name}</strong>
                    <span>
                      Tersisa {formatQuantity(product.stock)} {product.unit} · min. {formatQuantity(product.minStock)}
                    </span>
                  </div>
                  <Badge tone={product.stock === 0 ? "red" : "amber"} dot>
                    {product.stock === 0 ? "Habis" : "Menipis"}
                  </Badge>
                  <Link className="low-stock-item__action" to={`/owner/stock?product=${product.id}`}>
                    Atur
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid--wide-left">
        <section className="panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Aktivitas terbaru</p>
              <h2>Transaksi Terakhir</h2>
            </div>
            <Link to="/owner/transactions" className="text-link">
              Lihat semua <ArrowRight size={15} />
            </Link>
          </div>

          {data.recentTransactions.length === 0 ? (
            <EmptyState
              compact
              icon={<ReceiptText size={22} />}
              title="Belum ada transaksi"
              description="Transaksi yang dilakukan kasir akan tampil di sini."
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nota</th>
                    <th>Waktu</th>
                    <th>Kasir</th>
                    <th>Item</th>
                    <th className="text-right">Total</th>
                    <th aria-label="Aksi" />
                  </tr>
                </thead>
                <tbody>
                  {data.recentTransactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>
                        <span className="mono-text">{transaction.invoiceNumber}</span>
                      </td>
                      <td className="muted-cell">{formatDateTime(transaction.createdAt)}</td>
                      <td>{transaction.cashierName}</td>
                      <td className="muted-cell">{transaction.itemCount} item</td>
                      <td className="text-right strong-cell">{formatMoney(transaction.total)}</td>
                      <td className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={openingReceipt && selectedId === transaction.id}
                          onClick={() => void openReceipt(transaction)}
                        >
                          Detail
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Bulan ini</p>
              <h2>Produk Terlaris</h2>
            </div>
          </div>

          {data.topProducts.length === 0 ? (
            <EmptyState
              compact
              icon={<TrendingUp size={22} />}
              title="Belum ada data penjualan"
              description="Produk terlaris muncul setelah ada transaksi bulan ini."
            />
          ) : (
            <div className="ranked-list">
              {data.topProducts.map((product, index) => (
                <div className="ranked-item" key={`${product.productId}-${product.unit}`}>
                  <span className={`ranked-item__rank${index === 0 ? " ranked-item__rank--top" : ""}`}>
                    {index + 1}
                  </span>
                  <div className="ranked-item__info">
                    <div className="ranked-item__row">
                      <strong>{product.productName}</strong>
                      <span className="ranked-item__value">{formatMoneyCompact(product.revenue)}</span>
                    </div>
                    <span className="ranked-item__meta">
                      {formatQuantity(product.quantity)} {product.unit} terjual
                    </span>
                    <span className="ranked-item__track" aria-hidden="true">
                      <span style={{ width: `${Math.max(6, (product.revenue / maxTopRevenue) * 100)}%` }} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <ReceiptModal transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} />
    </div>
  );
}
