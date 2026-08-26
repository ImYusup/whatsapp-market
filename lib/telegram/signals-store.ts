// lib/telegram/signals-store.ts

import { google } from "googleapis";

/** Baca row terakhir per market dari sheet, sesuaikan kolom project kamu */
export async function getLastSignal(market: string) {
  // TODO: implement read from Google Sheet / DB
  // return { market, price, overall, analysis, supports, resistances, confidence, generatedAt }
  return null as any;
}

export async function getAllLastSignals() {
  const markets = ["XAU/USD", "BTC/USD", "ETH/USD", "BNB/USD", "SOL/USD"];
  const list = [];
  for (const m of markets) {
    const s = await getLastSignal(m);
    if (s) list.push(s);
  }
  return list;
}