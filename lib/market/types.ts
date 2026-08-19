// lib/market/types.ts

export type Candle = {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type MarketDataProvider = {
  getCurrentPrice(
    market: string
  ): Promise<number>;

  getCandles(
    market: string,
    timeframe: string
  ): Promise<Candle[]>;
};