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

  // Support KEY1 s/d KEY5
  for (let i = 1; i <= 5; i++) {
    const key = process.env[`TWELVE_API_KEY${i}`]?.trim();
    if (key && !keys.includes(key)) {
      keys.push(key);
    }
  }

  // Support CSV: TWELVE_API_KEYS=key1,key2,key3
  const csv = process.env.TWELVE_API_KEYS
    ?.split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (csv?.length) {
    for (const k of csv) {
      if (!keys.includes(k)) keys.push(k);
    }
  }

  // Support single key
  const single = process.env.TWELVE_API_KEY?.trim();
  if (single && !keys.includes(single)) {
    keys.push(single);
  }

  return keys;
}

const TWELVE_API_KEYS = loadTwelveApiKeys();

console.log("[TwelveData] API keys loaded:", TWELVE_API_KEYS.length);
if (TWELVE_API_KEYS.length > 0) {
  console.log(
    "[TwelveData] Keys:",
    TWELVE_API_KEYS.map((_, i) => `KEY${i + 1}`).join(", ")
  );
}

// ============================================================
// BLACKLIST KEY YANG DAILY LIMIT HABIS
// ============================================================

// Map: key → timestamp (ms) sampai kapan di-blacklist
const dailyLimitBlacklist = new Map<string, number>();

// Reset blacklist setiap hari jam 00:00 UTC
function getNextUtcMidnight(): number {
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1, // besok
    0, 0, 0, 0
  ));
  return next.getTime();
}

function isKeyBlacklisted(apiKey: string): boolean {
  const until = dailyLimitBlacklist.get(apiKey);
  if (!until) return false;

  if (Date.now() >= until) {
    // Sudah lewat midnight UTC → buka lagi
    dailyLimitBlacklist.delete(apiKey);
    return false;
  }
  return true;
}

function blacklistKey(apiKey: string, reason: string) {
  const until = getNextUtcMidnight();
  dailyLimitBlacklist.set(apiKey, until);
  const hoursLeft = ((until - Date.now()) / 1000 / 60 / 60).toFixed(1);
  console.warn(
    `[TwelveData] KEY BLACKLISTED until next UTC midnight (~${hoursLeft}h) | Reason: ${reason}`
  );
}

function isDailyLimitError(message: string): boolean {
  const msg = String(message || "").toLowerCase();
  return (
    msg.includes("run out of api credits") ||
    msg.includes("api credits for the day") ||
    msg.includes("daily limit")
  );
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
// FETCH WITH SMART KEY ROTATION
// ============================================================

async function fetchTwelveData(pathAndQuery: string): Promise<any> {
  if (TWELVE_API_KEYS.length === 0) {
    throw new Error("No Twelve Data API key configured");
  }

  // Ambil hanya key yang belum di-blacklist
  const availableIndexes = TWELVE_API_KEYS
    .map((_, i) => i)
    .filter((i) => !isKeyBlacklisted(TWELVE_API_KEYS[i]));

  if (availableIndexes.length === 0) {
    throw new Error(
      "All Twelve Data keys are blacklisted (daily limit reached). Wait until next UTC midnight."
    );
  }

  // Random rotate supaya beban merata
  // Shuffle available indexes
  for (let i = availableIndexes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableIndexes[i], availableIndexes[j]] = [availableIndexes[j], availableIndexes[i]];
  }

  let lastError = "Unknown Twelve Data error";

  for (const keyIndex of availableIndexes) {
    const apiKey = TWELVE_API_KEYS[keyIndex];
    const keyLabel = `KEY${keyIndex + 1}/${TWELVE_API_KEYS.length}`;

    const separator = pathAndQuery.includes("?") ? "&" : "?";
    const url = `${TWELVE_DATA_URL}${pathAndQuery}${separator}apikey=${encodeURIComponent(apiKey)}`;

    try {
      console.log(`[TwelveData] Request ${keyLabel}`);

      const response = await fetch(url, { cache: "no-store" });
      const body = await response.json();

      // Logging sisa kredit (kalau ada di header)
      const creditsUsed = response.headers.get("api-credits-used");
      const creditsLeft = response.headers.get("api-credits-left");
      if (creditsUsed || creditsLeft) {
        console.log(
          `[TwelveData] ${keyLabel} credits → used: ${creditsUsed ?? "?"} | left: ${creditsLeft ?? "?"}`
        );
      }

      if (!response.ok || body?.status === "error") {
        lastError =
          body?.message ??
          `HTTP ${response.status}: ${JSON.stringify(body)}`;

        const isDaily = isDailyLimitError(lastError);
        const isRate = isRateLimitError(lastError, body?.code ?? response.status);

        console.error(
          `[TwelveData] FAILED (${keyLabel}):`,
          lastError,
          isDaily ? "→ BLACKLIST + switch next key" : isRate ? "→ switch next key" : ""
        );

        // Kalau daily limit → blacklist sampai midnight UTC
        if (isDaily) {
          blacklistKey(apiKey, lastError);
        }

        continue;
      }

      // Success
      return body;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`[TwelveData] EXCEPTION (${keyLabel}):`, lastError);
    }
  }

  throw new Error(`All available Twelve Data keys failed: ${lastError}`);
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