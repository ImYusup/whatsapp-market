// src/api/market/route.ts
import { NextRequest } from "next/server";

import {
  generateSignal,
} from "@/lib/market/signal";

import {
  isMarket,
  MARKET_PROVIDER,
} from "@/lib/market/markets";

import {
  MARKET_PROVIDERS,
} from "@/lib/market/providers";

export async function GET(
  req: NextRequest
) {
  try {

    const market =
      req.nextUrl.searchParams.get(
        "market"
      );

    // ============================================================
    // VALIDATE MARKET
    // ============================================================

    if (
      !market ||
      !isMarket(market)
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Invalid market. Use XAU/USD or BTC/USD",
        },
        {
          status: 400,
        }
      );
    }

    // ============================================================
    // PROVIDER
    // ============================================================

    const providerType =
      MARKET_PROVIDER[market];

    const provider =
      MARKET_PROVIDERS[
        providerType
      ];

    if (!provider) {
      return Response.json(
        {
          ok: false,
          error:
            `No provider configured for ${market}`,
        },
        {
          status: 500,
        }
      );
    }

    // ============================================================
    // GENERATE SIGNAL
    // ============================================================

    const signal =
      await generateSignal(
        market,
        provider
      );

    // ============================================================
    // RESPONSE
    // ============================================================

    return Response.json({
      ok: true,
      data: signal,
    });

  } catch (error) {

    console.error(
      "MARKET API ERROR:",
      error
    );

    return Response.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}