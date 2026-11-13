export type Role = "owner" | "cashier";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface AccountUser extends SessionUser {
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  receiptFooter: string | null;
}

export interface AuthMeResponse {
  user: SessionUser | null;
  store: Store;
}

export interface SetupStatus {
  needsSetup: boolean;
  storeName: string;
}

export interface Category {
  id: string;
  name: string;
  productCount: number;
  activeProductCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  minStock: number;
  unit: string;
  imageUrl: string | null;
  isActive: boolean;
  lowStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  limit: number;
}

export interface ProductQuery {
  search?: string;
  categoryId?: string;
  status?: "all" | "active" | "inactive";
  lowStock?: "true" | "false";
  page?: number;
  limit?: number;
}

export interface ProductInput {
  name: string;
  categoryId: string;
  costPrice: number;
  sellingPrice: number;
  minStock: number;
  unit: string;
  imageUrl: string | null;
  isActive: boolean;
}

export interface CreateProductInput extends ProductInput {
  stock: number;
}

export type StockMovementType = "in" | "out" | "adjustment" | "sale";

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  userId: string;
  userName: string;
  transactionId: string | null;
  invoiceNumber: string | null;
  movementType: StockMovementType;
  quantity: number;
  previousStock: number;
  currentStock: number;
  notes: string | null;
  createdAt: string;
}

export interface StockMovementQuery {
  search?: string;
  movementType?: "all" | StockMovementType;
  productId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface StockMovementListResponse {
  items: StockMovement[];
  total: number;
  page: number;
  limit: number;
}

export interface AdjustmentInput {
  movementType: "in" | "out" | "adjustment";
  quantity: number;
  notes?: string;
}

export interface StockAdjustmentResponse {
  product: Product;
  movement: {
    id: string;
    movementType: "in" | "out" | "adjustment";
    quantity: number;
    previousStock: number;
    currentStock: number;
    notes: string;
    createdAt: string;
  };
  message: string;
}

export type PaymentMethod = "cash" | "qris" | "debit" | "transfer";

export interface TransactionSummary {
  id: string;
  invoiceNumber: string;
  cashierId: string;
  cashierName: string;
  total: number;
  discountTotal: number;
  paymentMethod: PaymentMethod;
  itemCount: number;
  createdAt: string;
}

export interface TransactionItem {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  listUnitPrice: number;
  unitPrice: number;
  listLineTotal: number;
  discountAmount: number;
  lineTotal: number;
}

export interface TransactionDetail extends TransactionSummary {
  subtotal: number;
  amountPaid: number;
  changeDue: number;
  notes: string | null;
  discountReason: string | null;
  items: TransactionItem[];
  store: Store;
}

export interface TransactionListResponse {
  items: TransactionSummary[];
  total: number;
  page: number;
  limit: number;
  summary: {
    count: number;
    totalSales: number;
  };
}

export interface CheckoutInput {
  items: Array<{ productId: string; quantity: number; unitPrice?: number }>;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  notes?: string;
  discountReason?: string;
  clientReference: string;
}

export interface CheckoutResponse {
  transaction: TransactionDetail;
  alreadyProcessed: boolean;
  message: string;
}

export interface DashboardData {
  metrics: {
    todaySales: number;
    todayTransactions: number;
    monthSales: number;
    totalTransactions: number;
    averageTransaction: number;
    totalProducts: number;
    activeProducts: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
  salesSeries: Array<{ date: string; total: number; count: number }>;
  lowStockProducts: Product[];
  recentTransactions: TransactionSummary[];
  topProducts: Array<{
    productId: string;
    productName: string;
    unit: string;
    quantity: number;
    revenue: number;
  }>;
}

export interface TransactionQuery {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface UserInput {
  name: string;
  email: string;
  password?: string;
  isActive?: boolean;
}

export interface StoreInput {
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  receiptFooter: string | null;
}

export type CashSessionStatus = "open" | "closed";

export interface CashSession {
  id: string;
  status: CashSessionStatus;
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

export interface CashSessionCurrentResponse {
  session: CashSession | null;
  lastClosed: CashSession | null;
}

export type ExpenseCategory = "supplies" | "equipment" | "transport" | "other";

export interface CashExpense {
  id: string;
  cashSessionId: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  createdBy: { id: string; name: string };
  createdAt: string;
}

export interface CashExpenseListResponse {
  items: CashExpense[];
  total: number;
  page: number;
  limit: number;
  summary: {
    totalAmount: number;
  };
}

export interface CreateCashExpenseInput {
  amount: number;
  category: ExpenseCategory;
  description: string;
  clientReference: string;
}

export interface CashExpenseQuery {
  sessionId?: string;
  page?: number;
  limit?: number;
}

export interface CashSessionListResponse {
  items: CashSession[];
  total: number;
  page: number;
  limit: number;
  summary: {
    closedSessions: number;
    totalDifference: number;
    sessionsWithDifference: number;
  };
}

export interface CashSessionQuery {
  page?: number;
  limit?: number;
}

export interface OpenCashSessionInput {
  openingCash: number;
  notes?: string;
}

export interface CloseCashSessionInput {
  countedCash: number;
  notes?: string;
}
