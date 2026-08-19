// lib/market/providers/twelveData.ts

import {
  Candle,
  MarketDataProvider,
} from "../types";

const TWELVE_DATA_URL =
  "https://api.twelvedata.com";

// ============================================================
// API KEYS
// ============================================================

const TWELVE_API_KEYS =
  process.env.TWELVE_API_KEYS
    ?.split(",")
    .map((key) => key.trim())
    .filter(Boolean) ?? [];

if (
  TWELVE_API_KEYS.length === 0 &&
  process.env.TWELVE_API_KEY
) {
  TWELVE_API_KEYS.push(
    process.env.TWELVE_API_KEY.trim()
  );
}

console.log(
  "[TwelveData] API keys loaded:",
  TWELVE_API_KEYS.length
);

// ============================================================
// HELPERS
// ============================================================

function roundPrice(
  value: number
): number {
  return Number(
    value.toFixed(2)
  );
}

// ============================================================
// CURRENT PRICE
// ============================================================

async function getPrice(
  symbol: string
): Promise<number> {

  if (
    TWELVE_API_KEYS.length === 0
  ) {
    throw new Error(
      "No Twelve Data API key configured"
    );
  }

  let lastError =
    "Unknown Twelve Data error";

  for (
    let keyIndex = 0;
    keyIndex < TWELVE_API_KEYS.length;
    keyIndex++
  ) {

    const apiKey =
      TWELVE_API_KEYS[keyIndex];

    try {

      const url =
        new URL(
          `${TWELVE_DATA_URL}/price`
        );

      url.searchParams.set(
        "symbol",
        symbol
      );

      url.searchParams.set(
        "apikey",
        apiKey
      );

      const response =
        await fetch(
          url.toString(),
          {
            method: "GET",
            cache: "no-store",
          }
        );

      const rawText =
        await response.text();

      let data: any;

      try {
        data =
          JSON.parse(rawText);
      } catch {
        data = null;
      }

      if (
        !response.ok ||
        data?.status === "error" ||
        data?.code
      ) {
        lastError =
          data?.message ??
          `HTTP ${response.status}`;

        console.error(
          `[TwelveData] ${symbol} PRICE FAILED:`,
          lastError
        );

        continue;
      }

      const price =
        Number(data?.price);

      if (
        !Number.isFinite(price)
      ) {
        lastError =
          `Invalid ${symbol} price`;

        continue;
      }

      console.log(
        `[TwelveData] ${symbol} PRICE:`,
        price
      );

      return roundPrice(price);

    } catch (error) {

      lastError =
        error instanceof Error
          ? error.message
          : String(error);
    }
  }

  throw new Error(
    `All Twelve Data keys failed for ${symbol} price: ${lastError}`
  );
}

// ============================================================
// OHLC
// ============================================================

async function getCandles(
  symbol: string,
  interval:
    | "15min"
    | "30min"
    | "1h"
): Promise<Candle[]> {

  if (
    TWELVE_API_KEYS.length === 0
  ) {
    throw new Error(
      "No Twelve Data API key configured"
    );
  }

  let lastError =
    "Unknown Twelve Data error";

  for (
    let keyIndex = 0;
    keyIndex < TWELVE_API_KEYS.length;
    keyIndex++
  ) {

    const apiKey =
      TWELVE_API_KEYS[keyIndex];

    console.log(
      `[TwelveData] ${symbol} ${interval} using key ${
        keyIndex + 1
      }/${TWELVE_API_KEYS.length}`
    );

    try {

      const url =
        new URL(
          `${TWELVE_DATA_URL}/time_series`
        );

      url.searchParams.set(
        "symbol",
        symbol
      );

      url.searchParams.set(
        "interval",
        interval
      );

      url.searchParams.set(
        "outputsize",
        "100"
      );

      url.searchParams.set(
        "apikey",
        apiKey
      );

      const response =
        await fetch(
          url.toString(),
          {
            method: "GET",
            cache: "no-store",
          }
        );

      const rawText =
        await response.text();

      let data: any;

      try {
        data =
          JSON.parse(rawText);
      } catch {
        data = null;
      }

      if (
        !response.ok ||
        data?.status === "error" ||
        data?.code
      ) {

        lastError =
          data?.message ??
          `HTTP ${response.status}`;

        console.error(
          `[TwelveData] ${symbol} ${interval} FAILED:`,
          lastError
        );

        continue;
      }

      if (
        !Array.isArray(
          data?.values
        )
      ) {

        lastError =
          "Twelve Data returned no values";

        continue;
      }

      const candles: Candle[] =
        data.values
          .map(
            (
              item: any
            ): Candle => ({
              datetime:
                String(
                  item.datetime ?? ""
                ),

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
          .sort(
            (
              a: Candle,
              b: Candle
            ) =>
              new Date(
                a.datetime
              ).getTime() -
              new Date(
                b.datetime
              ).getTime()
          );

      if (
        candles.length === 0
      ) {

        lastError =
          "Twelve Data returned zero valid candles";

        continue;
      }

      console.log(
        `[TwelveData] ${symbol} ${interval} SUCCESS: ${candles.length} candles`
      );

      console.log(
        `[TwelveData] ${symbol} ${interval} FIRST:`,
        candles[0]
      );

      console.log(
        `[TwelveData] ${symbol} ${interval} LAST:`,
        candles[candles.length - 1]
      );

      return candles;

    } catch (error) {

      lastError =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        `[TwelveData] ${symbol} ${interval} EXCEPTION:`,
        lastError
      );
    }
  }

  throw new Error(
    `All Twelve Data keys failed for ${symbol} ${interval}: ${lastError}`
  );
}

// ============================================================
// TWELVE DATA PROVIDER
// ============================================================

export const twelveData:
  MarketDataProvider = {

  async getCurrentPrice(
    market: string
  ): Promise<number> {

    return getPrice(
      market
    );
  },

  async getCandles(
    market: string,
    timeframe: string
  ): Promise<Candle[]> {

    if (
      timeframe !== "15min" &&
      timeframe !== "30min" &&
      timeframe !== "1h"
    ) {
      throw new Error(
        `Unsupported Twelve Data timeframe: ${timeframe}`
      );
    }

    return getCandles(
      market,
      timeframe as
        | "15min"
        | "30min"
        | "1h"
    );
  },
};