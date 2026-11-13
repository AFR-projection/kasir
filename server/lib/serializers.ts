export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "cashier";
}

export interface UserDto extends SessionUser {
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryDto {
  id: string;
  name: string;
  productCount: number;
  activeProductCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDto {
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

export interface StockMovementDto {
  id: string;
  productId: string;
  productName: string;
  userId: string;
  userName: string;
  transactionId: string | null;
  invoiceNumber: string | null;
  movementType: "in" | "out" | "adjustment" | "sale";
  quantity: number;
  previousStock: number;
  currentStock: number;
  notes: string | null;
  createdAt: string;
}

export interface TransactionSummaryDto {
  id: string;
  invoiceNumber: string;
  cashierId: string;
  cashierName: string;
  total: number;
  discountTotal: number;
  paymentMethod: "cash" | "qris" | "debit" | "transfer";
  itemCount: number;
  createdAt: string;
}

export interface TransactionItemDto {
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

export interface StoreDto {
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  receiptFooter: string | null;
}

export interface TransactionDetailDto extends TransactionSummaryDto {
  subtotal: number;
  amountPaid: number;
  changeDue: number;
  notes: string | null;
  discountReason: string | null;
  items: TransactionItemDto[];
  store: StoreDto;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "owner" | "cashier";
  is_active: boolean;
  auth_version: number;
  last_login_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function mapUser(row: UserRow): UserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: iso(row.last_login_at),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

export function toSessionUser(row: Pick<UserRow, "id" | "name" | "email" | "role">): SessionUser {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export interface ProductRow {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  cost_price: number;
  selling_price: number;
  stock: number;
  min_stock: number;
  unit: string;
  image_url: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export function mapProduct(row: ProductRow): ProductDto {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    costPrice: Number(row.cost_price),
    sellingPrice: Number(row.selling_price),
    stock: Number(row.stock),
    minStock: Number(row.min_stock),
    unit: row.unit,
    imageUrl: row.image_url,
    isActive: row.is_active,
    lowStock: Number(row.stock) <= Number(row.min_stock),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

export interface CategoryRow {
  id: string;
  name: string;
  product_count: number;
  active_product_count: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export function mapCategory(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    productCount: Number(row.product_count),
    activeProductCount: Number(row.active_product_count),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

export interface StockMovementRow {
  id: string;
  product_id: string;
  product_name: string;
  user_id: string;
  user_name: string;
  transaction_id: string | null;
  invoice_number: string | null;
  movement_type: "in" | "out" | "adjustment" | "sale";
  quantity: number;
  previous_stock: number;
  current_stock: number;
  notes: string | null;
  created_at: Date | string;
}

export function mapStockMovement(row: StockMovementRow): StockMovementDto {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    userId: row.user_id,
    userName: row.user_name,
    transactionId: row.transaction_id,
    invoiceNumber: row.invoice_number,
    movementType: row.movement_type,
    quantity: Number(row.quantity),
    previousStock: Number(row.previous_stock),
    currentStock: Number(row.current_stock),
    notes: row.notes,
    createdAt: iso(row.created_at)!,
  };
}

export interface TransactionSummaryRow {
  id: string;
  invoice_number: string;
  cashier_id: string;
  cashier_name: string;
  total: number;
  discount_total: number;
  payment_method: "cash" | "qris" | "debit" | "transfer";
  item_count: number;
  created_at: Date | string;
}

export function mapTransactionSummary(row: TransactionSummaryRow): TransactionSummaryDto {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    cashierId: row.cashier_id,
    cashierName: row.cashier_name,
    total: Number(row.total),
    discountTotal: Number(row.discount_total),
    paymentMethod: row.payment_method,
    itemCount: Number(row.item_count),
    createdAt: iso(row.created_at)!,
  };
}

export interface StoreRow {
  store_name: string;
  store_address: string | null;
  store_phone: string | null;
  receipt_footer: string | null;
}

export function mapStore(row: StoreRow): StoreDto {
  return {
    storeName: row.store_name,
    storeAddress: row.store_address,
    storePhone: row.store_phone,
    receiptFooter: row.receipt_footer,
  };
}
