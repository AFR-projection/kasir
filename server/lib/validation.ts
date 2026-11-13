import { z } from "zod";

export const uuidSchema = z.string().uuid("ID tidak valid.");

const numericPreprocess = (value: unknown) => {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
};

export const moneySchema = z.preprocess(
  numericPreprocess,
  z
    .number({ invalid_type_error: "Nominal harus berupa angka." })
    .finite("Nominal tidak valid.")
    .min(0, "Nominal tidak boleh negatif.")
    .max(999_999_999_999, "Nominal terlalu besar."),
);

export const quantitySchema = z.preprocess(
  numericPreprocess,
  z
    .number({ invalid_type_error: "Jumlah harus berupa angka." })
    .finite("Jumlah tidak valid.")
    .min(0, "Jumlah tidak boleh negatif.")
    .max(1_000_000, "Jumlah terlalu besar."),
);

export const positiveQuantitySchema = z.preprocess(
  numericPreprocess,
  z
    .number({ invalid_type_error: "Jumlah harus berupa angka." })
    .finite("Jumlah tidak valid.")
    .positive("Jumlah harus lebih dari 0.")
    .max(1_000_000, "Jumlah terlalu besar."),
);

export const trimmedString = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} minimal ${min} karakter.`)
    .max(max, `${label} maksimal ${max} karakter.`);

export const optionalTrimmedString = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} maksimal ${max} karakter.`)
    .optional()
    .transform((value) => (value ? value : null));

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Format email tidak valid.")
  .max(255, "Email terlalu panjang.");

export const passwordSchema = z
  .string()
  .min(8, "Password minimal 8 karakter.")
  .max(72, "Password maksimal 72 karakter.");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
});

export const dateInputSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.");

export const stockInputSchema = z.object({
  movementType: z.enum(["in", "out", "adjustment"]),
  quantity: quantitySchema,
  notes: optionalTrimmedString(500, "Catatan"),
});

export const paymentMethods = ["cash", "qris", "debit", "transfer"] as const;

export const transactionInputSchema = z.object({
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        quantity: positiveQuantitySchema,
        unitPrice: moneySchema.optional(),
      }),
    )
    .min(1, "Keranjang tidak boleh kosong.")
    .max(100, "Maksimal 100 produk per transaksi."),
  paymentMethod: z.enum(paymentMethods, {
    errorMap: () => ({ message: "Metode pembayaran tidak valid." }),
  }),
  amountPaid: moneySchema,
  notes: optionalTrimmedString(500, "Catatan"),
  discountReason: optionalTrimmedString(300, "Alasan nego/diskon"),
  clientReference: z.string().uuid("Referensi transaksi tidak valid."),
});

export function parseId(value: unknown): string {
  return uuidSchema.parse(value);
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function getPagination(req: import("express").Request) {
  return paginationSchema.parse(req.query);
}
