// lib/market/providers/usdIdr.ts

export async function getUsdIdrRate(): Promise<number> {
  // 1) optional override manual
  const envRate = Number(process.env.USD_IDR_RATE);
  if (Number.isFinite(envRate) && envRate > 0) {
    return envRate;
  }

  // 2) auto dari API (contoh Frankfurter)
  const res = await fetch(
    "https://api.frankfurter.app/latest?from=USD&to=IDR",
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(`USD/IDR fetch failed: ${res.status}`);
  }

  const data = await res.json();
  const rate = Number(data?.rates?.IDR);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Invalid USD/IDR rate");
  }

  return rate;
}