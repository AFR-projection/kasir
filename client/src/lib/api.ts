import type {
  AccountUser,
  AdjustmentInput,
  AuthMeResponse,
  CashExpense,
  CashExpenseListResponse,
  CashExpenseQuery,
  CashSession,
  CashSessionCurrentResponse,
  CashSessionListResponse,
  CashSessionQuery,
  Category,
  CheckoutInput,
  CheckoutResponse,
  CloseCashSessionInput,
  CreateCashExpenseInput,
  CreateProductInput,
  DashboardData,
  Product,
  ProductInput,
  ProductListResponse,
  ProductQuery,
  OpenCashSessionInput,
  SessionUser,
  SetupStatus,
  StockAdjustmentResponse,
  StockMovementListResponse,
  StockMovementQuery,
  Store,
  StoreInput,
  TransactionDetail,
  TransactionListResponse,
  TransactionQuery,
  UserInput,
} from "../types";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, string>;

  constructor(message: string, status: number, code?: string, details?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

interface UploadConfig {
  mode: "blob" | "local" | "unavailable";
  maxSize: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method || "GET",
      headers,
      body,
      credentials: "include",
      signal: options.signal,
    });
  } catch {
    throw new ApiError("Tidak dapat terhubung ke server. Periksa koneksi internet Anda.", 0, "NETWORK_ERROR");
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorPayload = payload as
      | { message?: string; code?: string; details?: Record<string, string> | unknown }
      | null;

    if (response.status === 401 && !path.startsWith("/auth/me") && !path.startsWith("/auth/login")) {
      window.dispatchEvent(new Event("kasir:unauthorized"));
    }

    const details =
      errorPayload?.details && typeof errorPayload.details === "object"
        ? (errorPayload.details as Record<string, string>)
        : undefined;

    let message = errorPayload?.message;
    if (!message && response.status === 413) {
      message = "Ukuran file terlalu besar untuk server. Gunakan gambar yang lebih kecil.";
    }

    throw new ApiError(message || "Terjadi kesalahan. Silakan coba lagi.", response.status, errorPayload?.code, details);
  }

  return payload as T;
}

function toQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const api = {
  auth: {
    me: () => request<AuthMeResponse>("/auth/me"),
    login: (input: { email: string; password: string }) =>
      request<{ user: SessionUser; account: AccountUser; message: string }>("/auth/login", {
        method: "POST",
        body: input,
      }),
    logout: () => request<{ message: string }>("/auth/logout", { method: "POST" }),
    updateProfile: (input: { name: string; email: string }) =>
      request<{ user: SessionUser; account: AccountUser }>("/auth/profile", {
        method: "PATCH",
        body: input,
      }),
    changePassword: (input: { currentPassword: string; newPassword: string }) =>
      request<{ message: string; user: SessionUser }>("/auth/change-password", {
        method: "POST",
        body: input,
      }),
  },
  setup: {
    status: () => request<SetupStatus>("/setup/status"),
    create: (input: { ownerName: string; email: string; password: string; storeName: string }) =>
      request<{ user: SessionUser; account: AccountUser; store: Store; message: string }>("/setup", {
        method: "POST",
        body: input,
      }),
  },
  categories: {
    list: () => request<{ categories: Category[] }>("/categories"),
    create: (name: string) => request<{ category: Category }>("/categories", { method: "POST", body: { name } }),
    update: (id: string, name: string) =>
      request<{ category: Category }>(`/categories/${id}`, { method: "PATCH", body: { name } }),
    remove: (id: string) => request<{ message: string }>(`/categories/${id}`, { method: "DELETE" }),
  },
  products: {
    list: (params: ProductQuery = {}) => request<ProductListResponse>(`/products${toQuery(params)}`),
    get: (id: string) => request<{ product: Product }>(`/products/${id}`),
    create: (input: CreateProductInput) =>
      request<{ product: Product }>("/products", { method: "POST", body: input }),
    update: (id: string, input: ProductInput) =>
      request<{ product: Product; message: string }>(`/products/${id}`, { method: "PUT", body: input }),
    setStatus: (id: string, isActive: boolean) =>
      request<{ product: Product; message: string }>(`/products/${id}/status`, {
        method: "PATCH",
        body: { isActive },
      }),
    remove: (id: string) => request<{ message: string }>(`/products/${id}`, { method: "DELETE" }),
    adjustStock: (id: string, input: AdjustmentInput) =>
      request<StockAdjustmentResponse>(`/products/${id}/stock`, { method: "POST", body: input }),
  },
  stockMovements: {
    list: (params: StockMovementQuery = {}) =>
      request<StockMovementListResponse>(`/stock-movements${toQuery(params)}`),
  },
  transactions: {
    list: (params: TransactionQuery = {}) =>
      request<TransactionListResponse>(`/transactions${toQuery(params)}`),
    get: (id: string) => request<{ transaction: TransactionDetail }>(`/transactions/${id}`),
    checkout: (input: CheckoutInput) =>
      request<CheckoutResponse>("/transactions", { method: "POST", body: input }),
  },
  cashSessions: {
    current: () => request<CashSessionCurrentResponse>("/cash-sessions/current"),
    open: (input: OpenCashSessionInput) =>
      request<{ session: CashSession; message: string }>("/cash-sessions/open", {
        method: "POST",
        body: input,
      }),
    close: (id: string, input: CloseCashSessionInput) =>
      request<{ session: CashSession; message: string }>(`/cash-sessions/${id}/close`, {
        method: "POST",
        body: input,
      }),
    list: (params: CashSessionQuery = {}) =>
      request<CashSessionListResponse>(`/cash-sessions${toQuery(params)}`),
  },
  expenses: {
    list: (params: CashExpenseQuery = {}) =>
      request<CashExpenseListResponse>(`/expenses${toQuery(params)}`),
    create: (input: CreateCashExpenseInput) =>
      request<{ expense: CashExpense; alreadyProcessed: boolean; message: string }>("/expenses", {
        method: "POST",
        body: input,
      }),
    remove: (id: string) => request<{ message: string }>(`/expenses/${id}`, { method: "DELETE" }),
  },
  dashboard: {
    get: () => request<DashboardData>("/dashboard"),
  },
  users: {
    list: () => request<{ users: AccountUser[] }>("/users"),
    create: (input: UserInput) =>
      request<{ user: AccountUser }>("/users", { method: "POST", body: input }),
    update: (id: string, input: Partial<UserInput>) =>
      request<{ user: AccountUser }>(`/users/${id}`, { method: "PATCH", body: input }),
  },
  settings: {
    get: () => request<{ store: Store }>("/settings"),
    update: (input: StoreInput) =>
      request<{ store: Store; message: string }>("/settings", { method: "PUT", body: input }),
  },
  uploads: {
    config: () => request<UploadConfig>("/uploads/config"),
    productImage: async (file: File) => {
      const uploadConfig = await request<UploadConfig>("/uploads/config");

      if (uploadConfig.mode === "unavailable") {
        throw new ApiError(
          "Penyimpanan gambar belum dikonfigurasi. Hubungkan Vercel Blob ke project (BLOB_READ_WRITE_TOKEN).",
          503,
          "UPLOAD_STORAGE_UNAVAILABLE",
        );
      }

      if (uploadConfig.mode === "blob") {
        const { upload } = await import("@vercel/blob/client");
        const extension = file.type === "image/png" ? ".png" : file.type === "image/webp" ? ".webp" : ".jpg";
        const randomId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const pathname = `products/${randomId}${extension}`;

        try {
          const blob = await upload(pathname, file, {
            access: "public",
            handleUploadUrl: "/api/uploads/blob",
            contentType: file.type,
            multipart: false,
          });
          return {
            url: blob.url,
            filename: pathname.split("/").pop() || pathname,
            size: file.size,
          };
        } catch (error) {
          const message = error instanceof Error && error.message ? error.message : "";
          throw new ApiError(
            message.includes("client token")
              ? "Penyimpanan gambar menolak unggahan. Pastikan Vercel Blob sudah terhubung dan di-redeploy."
              : "Gagal mengunggah gambar ke penyimpanan. Silakan coba lagi.",
            0,
            "UPLOAD_FAILED",
          );
        }
      }

      const formData = new FormData();
      formData.append("image", file);
      return request<{ url: string; filename: string; size: number }>("/uploads/product-image", {
        method: "POST",
        formData,
      });
    },
  },
};
