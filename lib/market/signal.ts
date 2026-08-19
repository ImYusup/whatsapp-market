// lib/market/signal.ts

import {
  Candle,
  MarketDataProvider,
} from "./types";

import { Market } from "./markets";

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

  /*
   * Gunakan beberapa candle terakhir.
   *
   * Ini lebih stabil daripada hanya membandingkan
   * candle terakhir dengan candle ke-5.
   */
  const previous =
    candles[candles.length - 6];

  const difference =
    recent.close -
    previous.close;

  const percentage =
    previous.close !== 0
      ? (difference / previous.close) * 100
      : 0;

  // ==========================================================
  // STRONG BUY
  // ==========================================================

  if (percentage >= 0.15) {
    return {
      timeframe,
      direction: "STRONG BUY",
      score: 2,
    };
  }

  // ==========================================================
  // BUY
  // ==========================================================

  if (percentage >= 0.05) {
    return {
      timeframe,
      direction: "BUY",
      score: 1,
    };
  }

  // ==========================================================
  // STRONG SELL
  // ==========================================================

  if (percentage <= -0.15) {
    return {
      timeframe,
      direction: "STRONG SELL",
      score: -2,
    };
  }

  // ==========================================================
  // SELL
  // ==========================================================

  if (percentage <= -0.05) {
    return {
      timeframe,
      direction: "SELL",
      score: -1,
    };
  }

  // ==========================================================
  // WAIT
  // ==========================================================

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

function calculateSupportResistance(
  candles: Candle[],
  currentPrice: number
): SupportResistanceResult {

  if (
    candles.length < 10 ||
    !Number.isFinite(currentPrice)
  ) {
    return {
      support: null,
      resistance: null,
      supports: [],
      resistances: [],
    };
  }

  const pivotLows =
    findPivotLows(candles);

  const pivotHighs =
    findPivotHighs(candles);

  const supportLevels =
    clusterLevels(
      pivotLows
    );

  const resistanceLevels =
    clusterLevels(
      pivotHighs
    );

  const supports =
    supportLevels
      .filter(
        (level) =>
          level < currentPrice
      )
      .sort(
        (a, b) => b - a
      )
      .slice(0, 3);

  const resistances =
    resistanceLevels
      .filter(
        (level) =>
          level > currentPrice
      )
      .sort(
        (a, b) => a - b
      )
      .slice(0, 3);

  return {
    support:
      supports.length > 0
        ? supports[0]
        : null,

    resistance:
      resistances.length > 0
        ? resistances[0]
        : null,

    supports,
    resistances,
  };
}

// ============================================================
// OVERALL DIRECTION
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

  /*
   * ==========================================================
   * CONFIDENCE PHILOSOPHY
   * ==========================================================
   *
   * Confidence = seberapa yakin sistem membaca kondisi market.
   *
   * BUKAN:
   *
   * "95% pasti profit"
   *
   * Threshold:
   *
   * < 50  = WAIT & SEE
   * 50-69 = CAUTIOUS
   * >= 70 = CONFIRMED
   *
   * ==========================================================
   */

  const weights = {
    "15M": 0.25,
    "30M": 0.30,
    "1H": 0.45,
  };

  // ==========================================================
  // 1. BASE STRENGTH
  // ==========================================================

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

  /*
   * Maximum weighted strength = 2
   */

  let confidence =
    (weightedStrength / 2) * 100;

  // ==========================================================
  // 2. DETECT DIRECTION
  // ==========================================================

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

  // ==========================================================
  // 3. TIMEFRAME AGREEMENT
  // ==========================================================

  /*
   * 3 timeframe satu arah:
   *
   * sangat konsisten
   */

  if (
    positive === 3 ||
    negative === 3
  ) {

    confidence += 12;

  } else if (
    positive === 2 ||
    negative === 2
  ) {

    /*
     * 2 timeframe satu arah
     * masih cukup kuat.
     */

    confidence += 6;
  }

  // ==========================================================
  // 4. CONFLICT PENALTY
  // ==========================================================

  /*
   * Kalau ada BUY dan SELL bersamaan,
   * confidence harus turun.
   */

  if (
    positive > 0 &&
    negative > 0
  ) {

    confidence -= 18;

    /*
     * Kalau 1H berlawanan dengan mayoritas
     * timeframe pendek, conflict lebih serius
     * karena 1H memiliki bobot terbesar.
     */

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

  // ==========================================================
  // 5. WAIT PENALTY
  // ==========================================================

  /*
   * WAIT berarti timeframe tersebut
   * belum memberikan konfirmasi.
   */

  confidence -=
    wait * 8;

  // ==========================================================
  // 6. STRONG SIGNAL BONUS
  // ==========================================================

  /*
   * Strong signal boleh menaikkan confidence,
   * tapi tidak boleh mengalahkan conflict.
   */

  const strongCount =
    analyses.filter(
      (item) =>
        Math.abs(
          item.score
        ) === 2
    ).length;

  confidence +=
    strongCount * 3;

  // ==========================================================
  // 7. HIGHER TIMEFRAME CONFIRMATION
  // ==========================================================

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

    /*
     * 1H strong signal adalah evidence penting.
     */

    confidence += 4;
  }

  // ==========================================================
  // 8. FINAL RANGE
  // ==========================================================

  /*
   * Maximum display confidence:
   *
   * 95
   *
   * Supaya angka tidak terlihat seperti
   * probabilitas pasti profit.
   */

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
  // CURRENT PRICE
  // ==========================================================

  const price =
    await provider.getCurrentPrice(
      market
    );

  console.log(
    `${market} current price:`,
    price
  );

  // ==========================================================
  // OHLC
  // ==========================================================

  let candles15M: Candle[] = [];
  let candles30M: Candle[] = [];
  let candles1H: Candle[] = [];

  try {

    [
      candles15M,
      candles30M,
      candles1H,
    ] = await Promise.all([

      provider.getCandles(
        market,
        "15min"
      ),

      provider.getCandles(
        market,
        "30min"
      ),

      provider.getCandles(
        market,
        "1h"
      ),
    ]);

    console.log(
      `${market} OHLC loaded`,
      {
        "15M":
          candles15M.length,

        "30M":
          candles30M.length,

        "1H":
          candles1H.length,
      }
    );

  } catch (error) {

    console.error(
      `${market} OHLC ERROR:`,
      error
    );

    candles15M = [];
    candles30M = [];
    candles1H = [];
  }

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
  // LOG
  // ==========================================================

  console.log(
    `[${market}] SIGNAL`,
    {
      "15M":
        analysis15M.direction,

      "30M":
        analysis30M.direction,

      "1H":
        analysis1H.direction,

      overall,

      confidence,
    }
  );

  // ==========================================================
  // RESPONSE
  // ==========================================================

  return {

    market,

    price:
      roundPrice(
        price
      ) as string,

    analysis: {

      "15M":
        analysis15M,

      "30M":
        analysis30M,

      "1H":
        analysis1H,
    },

    overall,

    support:
      roundPrice(
        support
      ),

    resistance:
      roundPrice(
        resistance
      ),

    supports:
      supports
        .map(
          (level) =>
            roundPrice(
              level
            )
        )
        .filter(
          (
            value
          ): value is string =>
            value !== null
        ),

    resistances:
      resistances
        .map(
          (level) =>
            roundPrice(
              level
            )
        )
        .filter(
          (
            value
          ): value is string =>
            value !== null
        ),

    confidence,

    generatedAt:
      new Date().toISOString(),
  };
}