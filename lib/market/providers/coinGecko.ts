// lib/market/providers/coinGecko.ts

import {
  Candle,
  MarketDataProvider,
} from "../types";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3";

const BTC_ID =
  "bitcoin";

// ============================================================
// CURRENT PRICE
// ============================================================

async function getBitcoinPrice(): Promise<number> {
  const url =
    new URL(
      `${COINGECKO_URL}/simple/price`
    );

  url.searchParams.set(
    "ids",
    BTC_ID
  );

  url.searchParams.set(
    "vs_currencies",
    "usd"
  );

  const response =
    await fetch(
      url.toString(),
      {
        method: "GET",
        cache: "no-store",
      }
    );

  if (!response.ok) {
    throw new Error(
      `CoinGecko price request failed: ${response.status}`
    );
  }

  const data =
    await response.json();

  const price =
    Number(
      data?.bitcoin?.usd
    );

  if (!Number.isFinite(price)) {
    throw new Error(
      "Invalid BTC price returned by CoinGecko"
    );
  }

  return Number(
    price.toFixed(2)
  );
}

// ============================================================
// OHLC
// ============================================================

async function getBitcoinCandles(
  days = 1
): Promise<Candle[]> {

  const url =
    new URL(
      `${COINGECKO_URL}/coins/${BTC_ID}/ohlc`
    );

  url.searchParams.set(
    "vs_currency",
    "usd"
  );

  url.searchParams.set(
    "days",
    String(days)
  );

  const response =
    await fetch(
      url.toString(),
      {
        method: "GET",
        cache: "no-store",
      }
    );

  if (!response.ok) {
    throw new Error(
      `CoinGecko OHLC request failed: ${response.status}`
    );
  }

  const data =
    await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      "Invalid BTC OHLC data returned by CoinGecko"
    );
  }

  const candles: Candle[] =
    data
      .map(
        (
          item: unknown
        ): Candle | null => {

          if (
            !Array.isArray(item) ||
            item.length < 5
          ) {
            return null;
          }

          const timestamp =
            Number(item[0]);

          const open =
            Number(item[1]);

          const high =
            Number(item[2]);

          const low =
            Number(item[3]);

          const close =
            Number(item[4]);

          if (
            !Number.isFinite(timestamp) ||
            !Number.isFinite(open) ||
            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close)
          ) {
            return null;
          }

          return {
            datetime:
              new Date(
                timestamp
              ).toISOString(),

            open,

            high,

            low,

            close,

            volume:
              null,
          };
        }
      )
      .filter(
        (
          candle
        ): candle is Candle =>
          candle !== null
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
    throw new Error(
      "CoinGecko returned zero valid BTC candles"
    );
  }

  console.log(
    `[BTC] CoinGecko OHLC loaded: ${candles.length} candles`
  );

  console.log(
    "[BTC] FIRST:",
    candles[0]
  );

  console.log(
    "[BTC] LAST:",
    candles[
      candles.length - 1
    ]
  );

  return candles;
}

// ============================================================
// PROVIDER
// ============================================================

export const coinGecko:
  MarketDataProvider = {

  // ----------------------------------------------------------
  // CURRENT PRICE
  // ----------------------------------------------------------

  async getCurrentPrice(
    _market: string
  ): Promise<number> {

    return getBitcoinPrice();
  },

  // ----------------------------------------------------------
  // OHLC
  // ----------------------------------------------------------

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
        `Unsupported BTC timeframe: ${timeframe}`
      );
    }

    /*
     * CoinGecko OHLC tidak menyediakan
     * endpoint terpisah untuk 15M / 30M / 1H.
     *
     * Untuk sementara kita ambil 1 hari
     * OHLC dan signal engine menggunakan
     * candle yang tersedia.
     */

    return getBitcoinCandles(1);
  },
};