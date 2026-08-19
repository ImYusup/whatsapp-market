// lib/market/providers/goldApi.ts

import {
  Candle,
  MarketDataProvider,
} from "../types";

const GOLD_API_URL =
  "https://api.gold-api.com";

const GOLD_SYMBOL = "XAU";

const TWELVE_DATA_URL =
  "https://api.twelvedata.com";

// ============================================================
// TWELVE DATA API KEYS
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

// ============================================================
// DEBUG ENV - NEVER PRINT API KEY
// ============================================================

console.log(
  "[XAU] Twelve Data API keys loaded:",
  TWELVE_API_KEYS.length
);

console.log(
  "[XAU] TWELVE_API_KEYS env exists:",
  Boolean(process.env.TWELVE_API_KEYS)
);

console.log(
  "[XAU] TWELVE_API_KEY fallback exists:",
  Boolean(process.env.TWELVE_API_KEY)
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

async function getGoldPrice(): Promise<number> {
  const response =
    await fetch(
      `${GOLD_API_URL}/price/${GOLD_SYMBOL}`,
      {
        method: "GET",
        cache: "no-store",
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      `Gold API price request failed: ${response.status}`
    );
  }

  const price =
    Number(data?.price);

  if (!Number.isFinite(price)) {
    throw new Error(
      "Invalid XAU price returned by Gold API"
    );
  }

  return roundPrice(price);
}

// ============================================================
// TWELVE DATA OHLC
// ============================================================

async function getGoldCandles(
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

  // ==========================================================
  // TRY KEYS
  // ==========================================================

  for (
    let keyIndex = 0;
    keyIndex <
    TWELVE_API_KEYS.length;
    keyIndex++
  ) {

    const apiKey =
      TWELVE_API_KEYS[keyIndex];

    console.log(
      `[XAU] ${interval} using Twelve Data key ${keyIndex + 1
      }/${TWELVE_API_KEYS.length}`
    );

    try {

      console.log(
        `[XAU] Requesting ${interval} using key ${keyIndex + 1
        }/${TWELVE_API_KEYS.length}`
      );

      const url =
        new URL(
          `${TWELVE_DATA_URL}/time_series`
        );

      url.searchParams.set(
        "symbol",
        "XAU/USD"
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

      // ========================================================
      // DEBUG
      // ========================================================

      console.log(
        `[XAU] ${interval} RESPONSE`,
        {
          httpStatus:
            response.status,

          ok:
            response.ok,

          status:
            data?.status,

          code:
            data?.code,

          message:
            data?.message,

          values:
            Array.isArray(
              data?.values
            )
              ? data.values.length
              : 0,
        }
      );

      // ========================================================
      // HTTP ERROR
      // ========================================================

      if (!response.ok) {

        lastError =
          `HTTP ${response.status}: ${data?.message ??
          rawText
          }`;

        console.error(
          `[XAU] ${interval} FAILED:`,
          lastError
        );

        continue;
      }

      // ========================================================
      // TWELVE DATA ERROR
      // ========================================================

      if (
        data?.status === "error" ||
        data?.code
      ) {

        lastError =
          data?.message ??
          `Twelve Data error code ${data?.code}`;

        console.error(
          `[XAU] ${interval} FAILED:`,
          lastError
        );

        continue;
      }

      // ========================================================
      // VALUES
      // ========================================================

      if (
        !Array.isArray(
          data?.values
        )
      ) {

        lastError =
          "Twelve Data returned no values";

        console.error(
          `[XAU] ${interval} FAILED:`,
          lastError
        );

        continue;
      }

      // ========================================================
      // MAP
      // ========================================================

      const candles: Candle[] =
        data.values
          .map(
            (item: any): Candle => ({
              datetime: String(
                item.datetime ?? ""
              ),

              open: Number(item.open),
              high: Number(item.high),
              low: Number(item.low),
              close: Number(item.close),

              volume:
                item.volume !== undefined
                  ? Number(item.volume)
                  : null,
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
              new Date(a.datetime).getTime() -
              new Date(b.datetime).getTime()
          );
      // ========================================================
      // EMPTY
      // ========================================================

      if (
        candles.length === 0
      ) {

        lastError =
          "Twelve Data returned zero valid candles";

        console.error(
          `[XAU] ${interval} FAILED:`,
          lastError
        );

        continue;
      }

      // ========================================================
      // SUCCESS
      // ========================================================

      console.log(
        `[XAU] ${interval} SUCCESS: ${candles.length} candles`
      );

      console.log(
        `[XAU] ${interval} FIRST:`,
        candles[0]
      );

      console.log(
        `[XAU] ${interval} LAST:`,
        candles[
        candles.length - 1
        ]
      );

      return candles;

    } catch (error) {

      lastError =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        `[XAU] ${interval} EXCEPTION:`,
        lastError
      );
    }
  }

  throw new Error(
    `All Twelve Data keys failed for ${interval}: ${lastError}`
  );
}

// ============================================================
// PROVIDER
// ============================================================

export const goldApi:
  MarketDataProvider = {

  async getCurrentPrice(
    _market: string
  ): Promise<number> {

    return getGoldPrice();
  },

  async getCandles(
    _market: string,
    timeframe: string
  ): Promise<Candle[]> {

    if (
      timeframe !== "15min" &&
      timeframe !== "30min" &&
      timeframe !== "1h"
    ) {
      throw new Error(
        `Unsupported XAU timeframe: ${timeframe}`
      );
    }

    return getGoldCandles(
      timeframe as
      | "15min"
      | "30min"
      | "1h"
    );
  },
};