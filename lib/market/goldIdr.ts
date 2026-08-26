// lib/market/goldIdr.ts

const TROY_OZ_TO_GRAM = 31.1034768;

/** XAU USD/oz → IDR per gram */
export function goldOzToIdrPerGram(
  xauUsdPerOz: number,
  usdIdr: number
): number {
  if (!Number.isFinite(xauUsdPerOz) || xauUsdPerOz <= 0) return NaN;
  if (!Number.isFinite(usdIdr) || usdIdr <= 0) return NaN;

  const usdPerGram = xauUsdPerOz / TROY_OZ_TO_GRAM;
  return usdPerGram * usdIdr;
}

export function formatIdr(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return (
    "Rp " +
    Math.round(value).toLocaleString("id-ID")
  );
}