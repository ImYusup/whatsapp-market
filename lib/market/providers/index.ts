import { goldApi } from "./goldApi";
import { twelveDataProvider } from "./twelveData";

export const MARKET_PROVIDERS = {
  gold: goldApi,
  twelveData: twelveDataProvider,
} as const;

export type MarketProviderName =
  keyof typeof MARKET_PROVIDERS;