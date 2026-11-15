export const scaleRoundingOptions = [0, 100, 500, 1000] as const;

export type ScaleRounding = (typeof scaleRoundingOptions)[number];

const scaleUnits = new Set(["kg", "gram"]);

export function isScaleUnit(unit: string): boolean {
  return scaleUnits.has(unit.trim().toLowerCase());
}

/**
 * Membulatkan nominal rupiah ke kelipatan terdekat.
 * Perhitungan dilakukan dalam satuan sen agar hasilnya konsisten.
 */
export function roundToScaleStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return value;
  }

  const cents = Math.round(value * 100);
  const stepCents = Math.round(step * 100);
  if (stepCents <= 0) return value;

  return (Math.round(cents / stepCents) * stepCents) / 100;
}
