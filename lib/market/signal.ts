// lib/market/signal.ts

import {
  Candle,
  MarketDataProvider,
} from "./types";

import { Market } from "./markets";
import { getUsdIdrRate } from "@/lib/market/providers/usdIdr";
import { goldOzToIdrPerGram } from "@/lib/market/goldIdr";

// ============================================================
// TYPES
// ============================================================

export type Direction =
  | "BUY"
  | "STRONG BUY"
  | "SELL"
  | "STRONG SELL"
  | "WAIT";

export type TimeframeAnalysis = {
  timeframe: "15M" | "30M" | "1H";
  direction: Direction;
  score: number;
};

export type SignalResult = {
  market: Market;
  price: string;

  analysis: {
    "15M": TimeframeAnalysis;
    "30M": TimeframeAnalysis;
    "1H": TimeframeAnalysis;
  };

  overall: Direction;

  support: string | null;
  resistance: string | null;

  supports: string[];
  resistances: string[];

  confidence: number;

  generatedAt: string;

  /** XAU/USD */
  usdIdr?: number | null;
  priceIdrPerGram?: number | null;
};

// ============================================================
// PRICE FORMAT
// ============================================================

function roundPrice(
  value: number | null
): string | null {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return value.toFixed(2);
}

// ============================================================
// TREND ANALYSIS
// ============================================================

function analyzeTrend(
  candles: Candle[],
  timeframe: "15M" | "30M" | "1H"
): TimeframeAnalysis {

  if (candles.length < 6) {
    return {
      timeframe,
      direction: "WAIT",
      score: 0,
    };
  }

  const recent =
    candles[candles.length - 1];

  const previous =
    candles[candles.length - 6];

  const difference =
    recent.close -
    previous.close;

  const percentage =
    previous.close !== 0
      ? (difference / previous.close) * 100
      : 0;

  if (percentage >= 0.15) {
    return {
      timeframe,
      direction: "STRONG BUY",
      score: 2,
    };
  }

  if (percentage >= 0.05) {
    return {
      timeframe,
      direction: "BUY",
      score: 1,
    };
  }

  if (percentage <= -0.15) {
    return {
      timeframe,
      direction: "STRONG SELL",
      score: -2,
    };
  }

  if (percentage <= -0.05) {
    return {
      timeframe,
      direction: "SELL",
      score: -1,
    };
  }

  return {
    timeframe,
    direction: "WAIT",
    score: 0,
  };
}

// ============================================================
// PIVOT LOWS
// ============================================================

function findPivotLows(
  candles: Candle[],
  left = 2,
  right = 2
): number[] {

  const pivots: number[] = [];

  for (
    let i = left;
    i < candles.length - right;
    i++
  ) {

    const current =
      candles[i].low;

    let isPivot = true;

    for (
      let j = i - left;
      j <= i + right;
      j++
    ) {

      if (
        j !== i &&
        candles[j].low <= current
      ) {
        isPivot = false;
        break;
      }
    }

    if (isPivot) {
      pivots.push(current);
    }
  }

  return pivots;
}

// ============================================================
// PIVOT HIGHS
// ============================================================

function findPivotHighs(
  candles: Candle[],
  left = 2,
  right = 2
): number[] {

  const pivots: number[] = [];

  for (
    let i = left;
    i < candles.length - right;
    i++
  ) {

    const current =
      candles[i].high;

    let isPivot = true;

    for (
      let j = i - left;
      j <= i + right;
      j++
    ) {

      if (
        j !== i &&
        candles[j].high >= current
      ) {
        isPivot = false;
        break;
      }
    }

    if (isPivot) {
      pivots.push(current);
    }
  }

  return pivots;
}

// ============================================================
// CLUSTER LEVELS
// ============================================================

function clusterLevels(
  levels: number[],
  tolerancePercent = 0.25
): number[] {

  if (levels.length === 0) {
    return [];
  }

  const sorted =
    [...levels].sort(
      (a, b) => a - b
    );

  const clusters: number[][] = [];

  for (const level of sorted) {

    const lastCluster =
      clusters[
      clusters.length - 1
      ];

    if (!lastCluster) {
      clusters.push([level]);
      continue;
    }

    const reference =
      lastCluster[
      lastCluster.length - 1
      ];

    const differencePercent =
      reference !== 0
        ? Math.abs(
          (level - reference) /
          reference
        ) * 100
        : 0;

    if (
      differencePercent <=
      tolerancePercent
    ) {

      lastCluster.push(level);

    } else {

      clusters.push([level]);

    }
  }

  return clusters.map(
    (cluster) =>
      cluster.reduce(
        (sum, value) =>
          sum + value,
        0
      ) / cluster.length
  );
}

// ============================================================
// SUPPORT / RESISTANCE
// ============================================================

type SupportResistanceResult = {
  support: number | null;
  resistance: number | null;
  supports: number[];
  resistances: number[];
};

/**
 * Pastikan selalu ada 3 level.
 * Kalau pivot kurang, isi dari price dengan step %.
 */
function ensureThreeLevels(
  levels: number[],
  price: number,
  type: "support" | "resistance"
): number[] {
  const unique = [
    ...new Set(
      levels.filter(
        (n) => Number.isFinite(n) && n > 0
      )
    ),
  ];

  // support: paling dekat price dulu (turun)
  // resistance: paling dekat price dulu (naik)
  unique.sort((a, b) =>
    type === "support" ? b - a : a - b
  );

  const result = unique.slice(0, 3);

  // Step fallback:
  // XAU ~0.25–0.40%, crypto juga aman pakai 0.35%
  const step = 0.0035;

  while (result.length < 3 && Number.isFinite(price) && price > 0) {
    const last =
      result.length > 0
        ? result[result.length - 1]
        : price;

    const next =
      type === "resistance"
        ? Number((last * (1 + step)).toFixed(2))
        : Number((last * (1 - step)).toFixed(2));

    if (type === "resistance") {
      if (next > last) result.push(next);
      else break;
    } else {
      if (next < last && next > 0) result.push(next);
      else break;
    }
  }

  // Safety terakhir
  while (result.length < 3 && Number.isFinite(price) && price > 0) {
    const i = result.length;
    const next =
      type === "resistance"
        ? Number((price * (1 + step * (i + 1))).toFixed(2))
        : Number((price * (1 - step * (i + 1))).toFixed(2));
    result.push(next);
  }

  return result.slice(0, 3);
}

function calculateSupportResistance(
  candles: Candle[],
  currentPrice: number
): SupportResistanceResult {
  if (
    candles.length < 10 ||
    !Number.isFinite(currentPrice)
  ) {
    const supports = ensureThreeLevels([], currentPrice, "support");
    const resistances = ensureThreeLevels([], currentPrice, "resistance");

    return {
      support: supports[0] ?? null,
      resistance: resistances[0] ?? null,
      supports,
      resistances,
    };
  }

  const pivotLows = findPivotLows(candles);
  const pivotHighs = findPivotHighs(candles);

  // Gold lebih “rapat” → toleransi cluster sedikit lebih kecil
  // biar level tidak terlalu sering digabung
  const supportLevels = clusterLevels(pivotLows, 0.15);
  const resistanceLevels = clusterLevels(pivotHighs, 0.15);

  const rawSupports = supportLevels
    .filter((level) => level < currentPrice)
    .sort((a, b) => b - a);

  const rawResistances = resistanceLevels
    .filter((level) => level > currentPrice)
    .sort((a, b) => a - b);

  const supports = ensureThreeLevels(
    rawSupports,
    currentPrice,
    "support"
  );

  const resistances = ensureThreeLevels(
    rawResistances,
    currentPrice,
    "resistance"
  );

  return {
    support: supports[0] ?? null,
    resistance: resistances[0] ?? null,
    supports,
    resistances,
  };
}

// ============================================================
// OVERALL
// ============================================================

function calculateOverall(
  analyses: TimeframeAnalysis[]
): Direction {

  const score =
    analyses.reduce(
      (total, item) =>
        total + item.score,
      0
    );

  if (score >= 4) {
    return "STRONG BUY";
  }

  if (score >= 2) {
    return "BUY";
  }

  if (score <= -4) {
    return "STRONG SELL";
  }

  if (score <= -2) {
    return "SELL";
  }

  return "WAIT";
}

// ============================================================
// CONFIDENCE
// ============================================================

function calculateConfidence(
  analyses: TimeframeAnalysis[]
): number {

  const weights = {
    "15M": 0.25,
    "30M": 0.30,
    "1H": 0.45,
  };

  let weightedStrength = 0;

  for (const analysis of analyses) {

    weightedStrength +=
      Math.abs(
        analysis.score
      ) *
      weights[
      analysis.timeframe
      ];
  }

  let confidence =
    (weightedStrength / 2) * 100;

  const positive =
    analyses.filter(
      (item) =>
        item.score > 0
    ).length;

  const negative =
    analyses.filter(
      (item) =>
        item.score < 0
    ).length;

  const wait =
    analyses.filter(
      (item) =>
        item.score === 0
    ).length;

  if (
    positive === 3 ||
    negative === 3
  ) {

    confidence += 12;

  } else if (
    positive === 2 ||
    negative === 2
  ) {

    confidence += 6;

  }

  if (
    positive > 0 &&
    negative > 0
  ) {

    confidence -= 18;

    const oneHour =
      analyses.find(
        (item) =>
          item.timeframe === "1H"
      );

    if (oneHour) {

      const shortTermScore =
        analyses
          .filter(
            (item) =>
              item.timeframe !== "1H"
          )
          .reduce(
            (sum, item) =>
              sum + item.score,
            0
          );

      if (
        shortTermScore > 0 &&
        oneHour.score < 0
      ) {

        confidence -= 8;

      }

      if (
        shortTermScore < 0 &&
        oneHour.score > 0
      ) {

        confidence -= 8;

      }
    }
  }

  confidence -=
    wait * 8;

  const strongCount =
    analyses.filter(
      (item) =>
        Math.abs(
          item.score
        ) === 2
    ).length;

  confidence +=
    strongCount * 3;

  const oneHour =
    analyses.find(
      (item) =>
        item.timeframe === "1H"
    );

  if (
    oneHour &&
    Math.abs(
      oneHour.score
    ) === 2
  ) {

    confidence += 4;

  }

  return Math.max(
    0,
    Math.min(
      Math.round(
        confidence
      ),
      95
    )
  );
}

// ============================================================
// GENERATE SIGNAL
// ============================================================

export async function generateSignal(
  market: Market,
  provider: MarketDataProvider
): Promise<SignalResult> {

  console.log(
    `Generating signal for ${market}`
  );

  // ==========================================================
  // PRICE
  // ==========================================================

  const price =
    await provider.getCurrentPrice(
      market
    );

  if (
    !Number.isFinite(price)
  ) {

    throw new Error(
      `${market} current price invalid`
    );

  }

  console.log(
    `${market} current price:`,
    price
  );

  // ==========================================================
  // OHLC — sequential (hindari burst 429 per menit)
  // ==========================================================

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const candles15M = await provider.getCandles(market, "15min");
  await sleep(1500);

  const candles30M = await provider.getCandles(market, "30min");
  await sleep(1500);

  const candles1H = await provider.getCandles(market, "1h");

  if (
    candles15M.length < 6 ||
    candles30M.length < 6 ||
    candles1H.length < 10
  ) {
    throw new Error(`${market} insufficient OHLC data`);
  }

  console.log(`${market} OHLC loaded`, {
    "15M": candles15M.length,
    "30M": candles30M.length,
    "1H": candles1H.length,
  });

  // ==========================================================
  // ANALYSIS
  // ==========================================================

  const analysis15M =
    analyzeTrend(
      candles15M,
      "15M"
    );

  const analysis30M =
    analyzeTrend(
      candles30M,
      "30M"
    );

  const analysis1H =
    analyzeTrend(
      candles1H,
      "1H"
    );

  const analyses = [
    analysis15M,
    analysis30M,
    analysis1H,
  ];

  // ==========================================================
  // OVERALL
  // ==========================================================

  const overall =
    calculateOverall(
      analyses
    );

  // ==========================================================
  // CONFIDENCE
  // ==========================================================

  const confidence =
    calculateConfidence(
      analyses
    );

  // ==========================================================
  // SUPPORT / RESISTANCE
  // ==========================================================

  const {
    support,
    resistance,
    supports,
    resistances,
  } =
    calculateSupportResistance(
      candles1H,
      price
    );

  // ==========================================================
  // XAU → IDR per gram (opsional, gagal tidak gagalkan signal)
  // ==========================================================

  let usdIdr: number | null = null;
  let priceIdrPerGram: number | null = null;

  if (market === "XAU/USD") {
    try {
      usdIdr = await getUsdIdrRate();
      priceIdrPerGram = goldOzToIdrPerGram(price, usdIdr);

      console.log("[XAU] USD/IDR:", usdIdr, "IDR/gram:", priceIdrPerGram);
    } catch (e) {
      console.error("[XAU] USD/IDR failed:", e);
    }
  }

  // ==========================================================
  // RESULT
  // ==========================================================

  return {
    market,

    price: roundPrice(price) as string,

    analysis: {
      "15M": analysis15M,
      "30M": analysis30M,
      "1H": analysis1H,
    },

    overall,

    support: roundPrice(support),
    resistance: roundPrice(resistance),

    supports: supports
      .map((level) => roundPrice(level))
      .filter((value): value is string => value !== null),

    resistances: resistances
      .map((level) => roundPrice(level))
      .filter((value): value is string => value !== null),

    confidence,

    generatedAt: new Date().toISOString(),

    usdIdr,
    priceIdrPerGram,
  };
} 