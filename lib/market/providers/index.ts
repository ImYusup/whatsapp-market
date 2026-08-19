// src/lib/market/providers/index.ts

import { goldApi } from "./goldApi";
import { twelveData } from "./twelveData";

export const MARKET_PROVIDERS = {
  gold: goldApi,
  twelveData: twelveData,
} as const;