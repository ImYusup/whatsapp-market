// lib/market/providers/goldApi.ts

import {
  Candle,
  MarketDataProvider,
} from "../types";

const GOLD_API_URL = "https://api.gold-api.com";
const GOLD_SYMBOL = "XAU";
const TWELVE_DATA_URL = "https://api.twelvedata.com";

// ============================================================
// TWELVE DATA API KEYS (untuk OHLC saja)
// Urutan: KEY1 → KEY2 → TWELVE_API_KEYS → TWELVE_API_KEY
// ============================================================

function loadTwelveApiKeys(): string[] {
  const keys: string[] = [];

  const key1 = process.env.TWELVE_API_KEY1?.trim();
  const key2 = process.env.TWELVE_API_KEY2?.trim();

  if (key1) keys.push(key1);
  if (key2) keys.push(key2);

  const csv = process.env.TWELVE_API_KEYS
    ?.split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (csv?.length) {
    for (const k of csv) {
      if (!keys.includes(k)) keys.push(k);
    }
  }

  const single = process.env.TWELVE_API_KEY?.trim();
  if (single && !keys.includes(single)) {
    keys.push(single);
  }

  return keys;
}

const TWELVE_API_KEYS = loadTwelveApiKeys();

console.log("[XAU] Twelve Data API keys loaded:", TWELVE_API_KEYS.length);
console.log("[XAU] KEY1 exists:", Boolean(process.env.TWELVE_API_KEY1));
console.log("[XAU] KEY2 exists:", Boolean(process.env.TWELVE_API_KEY2));

// ============================================================
// HELPERS
// ============================================================

function roundPrice(value: number): number {
  return Number(value.toFixed(2));
}

function isRateLimitError(message: string, code?: number | string): boolean {
  const msg = String(message || "").toLowerCase();
  return (
    code === 429 ||
    code === "429" ||
    msg.includes("api credits") ||
    msg.includes("run out") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  );
}

// ============================================================
// CURRENT PRICE — Gold API only
// ============================================================

async function getGoldPrice(): Promise<number> {
  const response = await fetch(`${GOLD_API_URL}/price/${GOLD_SYMBOL}`, {
    method: "GET",
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Gold API price request failed: ${response.status}`);
  }

  const price = Number(data?.price);

  if (!Number.isFinite(price)) {
    throw new Error("Invalid XAU price returned by Gold API");
  }

  return roundPrice(price);
}

// ============================================================
// OHLC — Twelve Data only (auto switch key)
// ============================================================

async function getGoldCandles(
  interval: "15min" | "30min" | "1h"
): Promise<Candle[]> {
  if (TWELVE_API_KEYS.length === 0) {
    throw new Error("No Twelve Data API key configured");
  }

  let lastError = "Unknown Twelve Data error";

  for (let keyIndex = 0; keyIndex < TWELVE_API_KEYS.length; keyIndex++) {
    const apiKey = TWELVE_API_KEYS[keyIndex];
    const keyLabel = `${keyIndex + 1}/${TWELVE_API_KEYS.length}`;

    console.log(`[XAU] ${interval} using Twelve Data key ${keyLabel}`);

    try {
      const url = new URL(`${TWELVE_DATA_URL}/time_series`);
      url.searchParams.set("symbol", "XAU/USD");
      url.searchParams.set("interval", interval);
      url.searchParams.set("outputsize", "100");
      url.searchParams.set("apikey", apiKey);

      const response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
      });

      const rawText = await response.text();
      let data: any;

      try {
        data = JSON.parse(rawText);
      } catch {
        data = null;
      }

      console.log(`[XAU] ${interval} RESPONSE`, {
        key: keyLabel,
        httpStatus: response.status,
        ok: response.ok,
        status: data?.status,
        code: data?.code,
        message: data?.message,
        values: Array.isArray(data?.values) ? data.values.length : 0,
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${data?.message ?? rawText}`;
        console.error(
          `[XAU] ${interval} FAILED (key ${keyLabel}):`,
          lastError,
          isRateLimitError(lastError, response.status) ? "→ switch next key" : ""
        );
        continue;
      }

      if (data?.status === "error" || data?.code) {
        lastError =
          data?.message ?? `Twelve Data error code ${data?.code}`;

        console.error(
          `[XAU] ${interval} FAILED (key ${keyLabel}):`,
          lastError,
          isRateLimitError(lastError, data?.code) ? "→ switch next key" : ""
        );
        continue;
      }

      if (!Array.isArray(data?.values)) {
        lastError = "Twelve Data returned no values";
        console.error(`[XAU] ${interval} FAILED (key ${keyLabel}):`, lastError);
        continue;
      }

      const candles: Candle[] = data.values
        .map(
          (item: any): Candle => ({
            datetime: String(item.datetime ?? ""),
            open: Number(item.open),
            high: Number(item.high),
            low: Number(item.low),
            close: Number(item.close),
            volume:
              item.volume !== undefined ? Number(item.volume) : null,
          })
        )
        .filter(
          (candle: Candle) =>
            Number.isFinite(candle.open) &&
            Number.isFinite(candle.high) &&
            Number.isFinite(candle.low) &&
            Number.isFinite(candle.close)
        )
        .sort(
          (a: Candle, b: Candle) =>
            new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
        );

      if (candles.length === 0) {
        lastError = "Twelve Data returned zero valid candles";
        console.error(`[XAU] ${interval} FAILED (key ${keyLabel}):`, lastError);
        continue;
      }

      console.log(
        `[XAU] ${interval} SUCCESS (key ${keyLabel}): ${candles.length} candles`
      );

      return candles;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`[XAU] ${interval} EXCEPTION (key ${keyLabel}):`, lastError);
    }
  }

  throw new Error(
    `All Twelve Data keys failed for ${interval}: ${lastError}`
  );
}

// ============================================================
// PROVIDER
// ============================================================

export const goldApi: MarketDataProvider = {
  async getCurrentPrice(_market: string): Promise<number> {
    return getGoldPrice();
  },

  async getCandles(_market: string, timeframe: string): Promise<Candle[]> {
    if (
      timeframe !== "15min" &&
      timeframe !== "30min" &&
      timeframe !== "1h"
    ) {
      throw new Error(`Unsupported XAU timeframe: ${timeframe}`);
    }

    return getGoldCandles(timeframe as "15min" | "30min" | "1h");
  },
};