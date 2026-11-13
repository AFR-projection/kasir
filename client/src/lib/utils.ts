const moneyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const moneyDecimalFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const quantityFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 3,
});

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
});

const dayNameFormatter = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
});

export function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return Number.isInteger(safe) ? moneyFormatter.format(safe) : moneyDecimalFormatter.format(safe);
}

export function formatMoneyCompact(value: number): string {
  if (value >= 1_000_000_000) return `Rp${(value / 1_000_000_000).toFixed(1).replace(".", ",")} M`;
  if (value >= 1_000_000) return `Rp${(value / 1_000_000).toFixed(1).replace(".", ",")} jt`;
  if (value >= 1_000) return `Rp${(value / 1_000).toFixed(0)} rb`;
  return formatMoney(value);
}

export function formatQuantity(value: number): string {
  return quantityFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatQuantityWithUnit(value: number, unit: string): string {
  return `${formatQuantity(value)} ${unit}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return dateFormatter.format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return dateTimeFormatter.format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return timeFormatter.format(date);
}

export function formatDayShort(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return dayNameFormatter.format(date);
}

export function formatPaymentMethod(method: string): string {
  const labels: Record<string, string> = {
    cash: "Tunai",
    qris: "QRIS",
    debit: "Kartu Debit",
    transfer: "Transfer",
  };
  return labels[method] || method;
}

export function formatMovementType(type: string): string {
  const labels: Record<string, string> = {
    in: "Stok Masuk",
    out: "Stok Keluar",
    adjustment: "Penyesuaian",
    sale: "Penjualan",
  };
  return labels[type] || type;
}

export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Terjadi kesalahan. Silakan coba lagi.";
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateInputDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const unitOptions = [
  "pcs",
  "kg",
  "gram",
  "liter",
  "ml",
  "ikat",
  "bungkus",
  "pack",
  "box",
  "botol",
  "kaleng",
  "karung",
  "meter",
  "lusin",
  "rim",
  "porsi",
];

export function isFractionalUnit(unit: string): boolean {
  return ["kg", "gram", "liter", "ml", "meter"].includes(unit.toLowerCase());
}

export function quantityStep(unit: string): number {
  return isFractionalUnit(unit) ? 0.1 : 1;
}

export async function compressImage(file: File): Promise<File> {
  if (file.type === "image/heic" || file.type === "image/heif") {
    throw new Error("Foto HEIC/HEIF belum didukung. Ubah dulu ke JPG, PNG, atau WEBP.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("File harus berupa gambar JPG, PNG, atau WEBP.");
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("Ukuran gambar maksimal 15 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Gambar tidak dapat dibaca."));
      element.src = objectUrl;
    });

    const maxDimension = 1200;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser tidak mendukung pemrosesan gambar.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.84);
    });
    if (!blob) throw new Error("Gagal memproses gambar.");

    return new File([blob], "product.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function roundMoneyValue(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundQuantityValue(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
