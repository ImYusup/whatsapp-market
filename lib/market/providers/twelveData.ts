// lib/market/providers/twelveData.ts

import {
  Candle,
  MarketDataProvider,
} from "../types";

const TWELVE_DATA_URL = "https://api.twelvedata.com";

// ============================================================
// TWELVE DATA API KEYS
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

console.log("[TwelveData] API keys loaded:", TWELVE_API_KEYS.length);

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
// SYMBOL
// ============================================================

function getSymbol(market: string): string {
  switch (market) {
    case "XAU/USD":
      return "XAU/USD";
    case "BTC/USD":
      return "BTC/USD";
    case "ETH/USD":
      return "ETH/USD";
    case "SOL/USD":
      return "SOL/USD";
    case "BNB/USD":
      return "BNB/USD";
    default:
      throw new Error(`Unsupported Twelve Data market: ${market}`);
  }
}

// ============================================================
// FETCH WITH KEY ROTATION
// ============================================================

async function fetchTwelveData(pathAndQuery: string): Promise<any> {
  if (TWELVE_API_KEYS.length === 0) {
    throw new Error("No Twelve Data API key configured");
  }

  let lastError = "Unknown Twelve Data error";

  for (let keyIndex = 0; keyIndex < TWELVE_API_KEYS.length; keyIndex++) {
    const apiKey = TWELVE_API_KEYS[keyIndex];
    const keyLabel = `${keyIndex + 1}/${TWELVE_API_KEYS.length}`;

    const separator = pathAndQuery.includes("?") ? "&" : "?";
    const url = `${TWELVE_DATA_URL}${pathAndQuery}${separator}apikey=${encodeURIComponent(apiKey)}`;

    try {
      console.log(`[TwelveData] Request key ${keyLabel}`);

      const response = await fetch(url, { cache: "no-store" });
      const body = await response.json();

      if (!response.ok || body?.status === "error") {
        lastError =
          body?.message ??
          `HTTP ${response.status}: ${JSON.stringify(body)}`;

        console.error(
          `[TwelveData] FAILED (key ${keyLabel}):`,
          lastError,
          isRateLimitError(lastError, body?.code ?? response.status)
            ? "→ switch next key"
            : ""
        );
        continue;
      }

      return body;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`[TwelveData] EXCEPTION (key ${keyLabel}):`, lastError);
    }
  }

  throw new Error(`All Twelve Data keys failed: ${lastError}`);
}

// ============================================================
// CURRENT PRICE
// ============================================================

async function getCurrentPrice(market: string): Promise<number> {
  const symbol = getSymbol(market);

  const body = await fetchTwelveData(
    `/price?symbol=${encodeURIComponent(symbol)}`
  );

  const price = Number(body.price);

  if (!Number.isFinite(price)) {
    throw new Error(`Invalid Twelve Data price: ${JSON.stringify(body)}`);
  }

  return price;
}

// ============================================================
// CANDLES
// ============================================================

async function getCandles(
  market: string,
  timeframe: string
): Promise<Candle[]> {
  const symbol = getSymbol(market);

  const body = await fetchTwelveData(
    `/time_series?symbol=${encodeURIComponent(symbol)}` +
      `&interval=${encodeURIComponent(timeframe)}` +
      `&outputsize=100`
  );

  if (!Array.isArray(body.values)) {
    throw new Error(
      `Twelve Data OHLC invalid response: ${JSON.stringify(body)}`
    );
  }

  const candles = body.values
    .map(
      (item: {
        datetime: string;
        open: string;
        high: string;
        low: string;
        close: string;
        volume?: string;
      }): Candle => ({
        datetime: item.datetime,
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close),
        volume: item.volume !== undefined ? Number(item.volume) : null,
      })
    )
    .filter(
      (candle: Candle) =>
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close)
    )
    .reverse();

  if (candles.length === 0) {
    throw new Error(
      `Twelve Data returned no candles for ${market} ${timeframe}`
    );
  }

  return candles;
}

// ============================================================
// PROVIDER
// ============================================================

export const twelveDataProvider: MarketDataProvider = {
  getCurrentPrice,
  getCandles,
};