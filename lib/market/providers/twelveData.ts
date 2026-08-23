// lib/market/providers/twelveData.ts

import {
  Candle,
  MarketDataProvider,
} from "../types";

const TWELVE_DATA_URL =
  "https://api.twelvedata.com";

function getApiKey(): string {

  const key =
    process.env.TWELVE_API_KEY;

  if (!key) {
    throw new Error(
      "TWELVE_API_KEY belum diset."
    );
  }

  return key;
}

// ============================================================
// SYMBOL
// ============================================================

function getSymbol(
  market: string
): string {

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
      throw new Error(
        `Unsupported Twelve Data market: ${market}`
      );

  }
}

// ============================================================
// CURRENT PRICE
// ============================================================

async function getCurrentPrice(
  market: string
): Promise<number> {

  const symbol =
    getSymbol(market);

  const url =
    `${TWELVE_DATA_URL}/price` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&apikey=${getApiKey()}`;

  const response =
    await fetch(
      url,
      {
        cache: "no-store",
      }
    );

  const body =
    await response.json();

  if (
    !response.ok ||
    body.status === "error"
  ) {

    throw new Error(
      `Twelve Data price failed ${response.status}: ` +
      JSON.stringify(body)
    );

  }

  const price =
    Number(
      body.price
    );

  if (
    !Number.isFinite(price)
  ) {

    throw new Error(
      `Invalid Twelve Data price: ${JSON.stringify(body)}`
    );

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

  const symbol =
    getSymbol(market);

  const url =
    `${TWELVE_DATA_URL}/time_series` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${encodeURIComponent(timeframe)}` +
    `&outputsize=100` +
    `&apikey=${getApiKey()}`;

  const response =
    await fetch(
      url,
      {
        cache: "no-store",
      }
    );

  const body =
    await response.json();

  if (
    !response.ok ||
    body.status === "error" ||
    !Array.isArray(body.values)
  ) {

    throw new Error(
      `Twelve Data OHLC failed ${response.status}: ` +
      JSON.stringify(body)
    );

  }

  const candles =
    body.values
      .map(
        (
          item: {
            datetime: string;
            open: string;
            high: string;
            low: string;
            close: string;
            volume?: string;
          }
        ): Candle => ({
          datetime:
            item.datetime,

          open:
            Number(item.open),

          high:
            Number(item.high),

          low:
            Number(item.low),

          close:
            Number(item.close),

          volume:
            item.volume !== undefined
              ? Number(item.volume)
              : null,
        })
      )
      .filter(
        (
          candle: Candle
        ) =>
          Number.isFinite(
            candle.open
          ) &&
          Number.isFinite(
            candle.high
          ) &&
          Number.isFinite(
            candle.low
          ) &&
          Number.isFinite(
            candle.close
          )
      )
      .reverse();

  if (
    candles.length === 0
  ) {

    throw new Error(
      `Twelve Data returned no candles for ${market} ${timeframe}`
    );

  }

  return candles;
}

// ============================================================
// PROVIDER
// ============================================================

export const twelveDataProvider:
  MarketDataProvider = {

  getCurrentPrice,

  getCandles,

};