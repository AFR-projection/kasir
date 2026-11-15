import { AppError } from "./http";
import { isScaleUnit, roundToScaleStep } from "./rounding";
import { roundMoney } from "./validation";

export interface PricingProduct {
  name: string;
  costPrice: number;
  sellingPrice: number;
  unit: string;
}

export interface CartLineRequest {
  quantity: number;
  unitPrice: number | null;
  negotiatedTotal: number | null;
}

export interface PricedLine {
  listUnitPrice: number;
  unitPrice: number;
  listLineTotal: number;
  discountAmount: number;
  roundingAmount: number;
  negotiationMode: "unit" | "total" | null;
  lineTotal: number;
}

const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

export function formatRupiah(value: number): string {
  return rupiahFormatter.format(value);
}

/**
 * Menghitung harga satu baris keranjang. Dipakai oleh checkout dan hold cart
 * agar aturan nego, harga modal, serta pembulatan timbangan selalu sama.
 */
export function priceCartLine(
  product: PricingProduct,
  request: CartLineRequest,
  scaleRounding: number,
): PricedLine {
  const quantity = request.quantity;
  const listUnitPrice = roundMoney(product.sellingPrice);
  const costPrice = roundMoney(product.costPrice);
  const listLineTotal = roundMoney(listUnitPrice * quantity);

  let unitPrice = listUnitPrice;
  let lineTotal: number;
  let discountAmount: number;
  let roundingAmount = 0;
  let negotiationMode: "unit" | "total" | null = null;

  if (request.negotiatedTotal !== null) {
    if (request.negotiatedTotal > listLineTotal) {
      throw new AppError(
        400,
        `Total nego "${product.name}" tidak boleh melebihi harga normal (${formatRupiah(listLineTotal)}).`,
        { code: "PRICE_ABOVE_LIST" },
      );
    }

    const costLineTotal = roundMoney(costPrice * quantity);
    if (costPrice > 0 && request.negotiatedTotal < costLineTotal) {
      throw new AppError(
        400,
        `Total nego "${product.name}" di bawah harga modal (${formatRupiah(costLineTotal)}).`,
        { code: "PRICE_BELOW_COST" },
      );
    }

    lineTotal = request.negotiatedTotal;
    unitPrice = Math.min(listUnitPrice, roundMoney(lineTotal / quantity));
    discountAmount = roundMoney(listLineTotal - lineTotal);
    negotiationMode = lineTotal < listLineTotal ? "total" : null;
  } else {
    if (request.unitPrice !== null) {
      if (request.unitPrice > listUnitPrice) {
        throw new AppError(
          400,
          `Harga nego "${product.name}" tidak boleh melebihi harga normal (${formatRupiah(listUnitPrice)}).`,
          { code: "PRICE_ABOVE_LIST" },
        );
      }

      if (costPrice > 0 && request.unitPrice < costPrice) {
        throw new AppError(
          400,
          `Harga nego "${product.name}" di bawah harga modal (${formatRupiah(costPrice)}).`,
          { code: "PRICE_BELOW_COST" },
        );
      }

      unitPrice = request.unitPrice;
    }

    const exactLineTotal = roundMoney(unitPrice * quantity);
    discountAmount = roundMoney(listLineTotal - exactLineTotal);
    roundingAmount =
      request.unitPrice === null && scaleRounding > 0 && isScaleUnit(product.unit)
        ? roundMoney(roundToScaleStep(exactLineTotal, scaleRounding) - exactLineTotal)
        : 0;
    lineTotal = roundMoney(exactLineTotal + roundingAmount);
    negotiationMode =
      request.unitPrice !== null && unitPrice < listUnitPrice ? "unit" : null;
  }

  if (listLineTotal > 999_999_999_999.99 || lineTotal > 999_999_999_999.99) {
    throw new AppError(400, "Total item melebihi batas maksimum transaksi.");
  }

  return {
    listUnitPrice,
    unitPrice,
    listLineTotal,
    discountAmount,
    roundingAmount,
    negotiationMode,
    lineTotal,
  };
}
