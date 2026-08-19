// src/lib/market/markets.ts

export const MARKETS = [
  "XAU/USD",
  "XAG/USD",
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "BNB/USD",
] as const;

export const MARKET_PROVIDER = {
  "XAU/USD": "gold",

  "XAG/USD": "twelveData",
  "BTC/USD": "twelveData",
  "ETH/USD": "twelveData",
  "SOL/USD": "twelveData",
  "BNB/USD": "twelveData",
} as const;

export type Market =
  (typeof MARKETS)[number];

export function isMarket(
  value: string
): value is Market {
  return MARKETS.includes(
    value as Market
  );
}