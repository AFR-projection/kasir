import { Router } from "express";
import { pool } from "../db/pool";
import { config } from "../config";
import { requireOwner } from "../lib/auth";
import { asyncHandler } from "../lib/http";
import {
  mapProduct,
  mapTransactionSummary,
  type ProductRow,
  type TransactionSummaryRow,
} from "../lib/serializers";

export const dashboardRouter = Router();
dashboardRouter.use(requireOwner);

interface MetricsRow {
  today_sales: number;
  today_transactions: number;
  month_sales: number;
  total_transactions: number;
}

interface ProductStatsRow {
  total_products: number;
  active_products: number;
  low_stock_count: number;
  out_of_stock_count: number;
}

interface SalesDayRow {
  date: string;
  total: number;
  count: number;
}

interface TopProductRow {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: number;
  revenue: number;
}

dashboardRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const timezone = config.storeTimezone;

    const [metricsResult, productStatsResult, salesSeriesResult, lowStockResult, recentResult, topProductsResult] =
      await Promise.all([
        pool.query<MetricsRow>(
          `SELECT
             COALESCE(SUM(t.total) FILTER (
               WHERE (t.created_at AT TIME ZONE $1)::date = (NOW() AT TIME ZONE $1)::date
             ), 0)::numeric AS today_sales,
             COUNT(*) FILTER (
               WHERE (t.created_at AT TIME ZONE $1)::date = (NOW() AT TIME ZONE $1)::date
             )::int AS today_transactions,
             COALESCE(SUM(t.total) FILTER (
               WHERE date_trunc('month', t.created_at AT TIME ZONE $1)
                   = date_trunc('month', NOW() AT TIME ZONE $1)
             ), 0)::numeric AS month_sales,
             COUNT(*)::int AS total_transactions
           FROM transactions t`,
          [timezone],
        ),
        pool.query<ProductStatsRow>(
          `SELECT
             COUNT(*)::int AS total_products,
             COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active_products,
             COUNT(*) FILTER (WHERE is_active = TRUE AND stock <= min_stock)::int AS low_stock_count,
             COUNT(*) FILTER (WHERE is_active = TRUE AND stock = 0)::int AS out_of_stock_count
           FROM products
           WHERE deleted_at IS NULL`,
        ),
        pool.query<SalesDayRow>(
          `WITH days AS (
             SELECT generate_series(
               (NOW() AT TIME ZONE $1)::date - 6,
               (NOW() AT TIME ZONE $1)::date,
               '1 day'::interval
             )::date AS day
           )
           SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
                  COALESCE(SUM(t.total), 0)::numeric AS total,
                  COUNT(t.id)::int AS count
           FROM days d
           LEFT JOIN transactions t ON (t.created_at AT TIME ZONE $1)::date = d.day
           GROUP BY d.day
           ORDER BY d.day ASC`,
          [timezone],
        ),
        pool.query<ProductRow>(
          `SELECT p.id, p.name, p.category_id, c.name AS category_name,
                  p.cost_price, p.selling_price, p.stock, p.min_stock, p.unit,
                  p.image_url, p.is_active, p.created_at, p.updated_at
           FROM products p
           JOIN categories c ON c.id = p.category_id
           WHERE p.deleted_at IS NULL AND p.is_active = TRUE AND p.stock <= p.min_stock
           ORDER BY (p.stock = 0) DESC, p.stock ASC, lower(p.name) ASC
           LIMIT 6`,
        ),
        pool.query<TransactionSummaryRow>(
          `SELECT t.id, t.invoice_number, t.cashier_id, u.name AS cashier_name,
                  t.total, t.discount_total, t.payment_method, t.created_at,
                  (SELECT COUNT(*)::int FROM transaction_items ti WHERE ti.transaction_id = t.id) AS item_count
           FROM transactions t
           JOIN users u ON u.id = t.cashier_id
           ORDER BY t.created_at DESC
           LIMIT 6`,
        ),
        pool.query<TopProductRow>(
          `SELECT ti.product_id, ti.product_name, ti.unit,
                  SUM(ti.quantity)::numeric AS quantity,
                  SUM(ti.line_total)::numeric AS revenue
           FROM transaction_items ti
           JOIN transactions t ON t.id = ti.transaction_id
           WHERE date_trunc('month', t.created_at AT TIME ZONE $1)
               = date_trunc('month', NOW() AT TIME ZONE $1)
           GROUP BY ti.product_id, ti.product_name, ti.unit
           ORDER BY revenue DESC
           LIMIT 5`,
          [timezone],
        ),
      ]);

    const metrics = metricsResult.rows[0];
    const productStats = productStatsResult.rows[0];

    res.json({
      metrics: {
        todaySales: Number(metrics.today_sales),
        todayTransactions: metrics.today_transactions,
        monthSales: Number(metrics.month_sales),
        totalTransactions: metrics.total_transactions,
        averageTransaction:
          metrics.today_transactions > 0
            ? Math.round(Number(metrics.today_sales) / metrics.today_transactions)
            : 0,
        totalProducts: productStats.total_products,
        activeProducts: productStats.active_products,
        lowStockCount: productStats.low_stock_count,
        outOfStockCount: productStats.out_of_stock_count,
      },
      salesSeries: salesSeriesResult.rows.map((row) => ({
        date: row.date,
        total: Number(row.total),
        count: Number(row.count),
      })),
      lowStockProducts: lowStockResult.rows.map(mapProduct),
      recentTransactions: recentResult.rows.map(mapTransactionSummary),
      topProducts: topProductsResult.rows.map((row) => ({
        productId: row.product_id,
        productName: row.product_name,
        unit: row.unit,
        quantity: Number(row.quantity),
        revenue: Number(row.revenue),
      })),
    });
  }),
);
