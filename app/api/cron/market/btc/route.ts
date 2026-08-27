// app/api/cron/market/btc/route.ts
import { NextResponse } from "next/server";
import { generateSignal } from "@/lib/market/signal";
import { twelveDataProvider } from "@/lib/market/providers/twelveData";
import { Market } from "@/lib/market/markets";
import { sendTelegramSignal } from "@/lib/telegram/send";
import { formatSignalMessage } from "@/lib/telegram/formatSignal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CRYPTO_MARKETS: Market[] = [
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "BNB/USD",
];

function getCronSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET belum diset.");
  return secret;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateSignalWithRetry(market: Market, maxRetries = 3) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateSignal(market, twelveDataProvider);
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);

      if (msg.includes("429") || msg.includes("run out of API credits")) {
        const waitSec = 25 + attempt * 10;
        console.log(`⏳ ${market} rate limit (attempt ${attempt}). Tunggu ${waitSec}s...`);
        await sleep(waitSec * 1000);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (authorization !== `Bearer ${getCronSecret()}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    console.log("==========================================");
    console.log("🟡 CRYPTOCURRENCY CRON START → TELEGRAM");
    console.log("📊 MARKETS:", CRYPTO_MARKETS.join(", "));
    console.log("==========================================");

    const results: {
      market: string;
      ok: boolean;
      signal?: unknown;
      telegram?: boolean;
      error?: string;
    }[] = [];

    for (let i = 0; i < CRYPTO_MARKETS.length; i++) {
      const market = CRYPTO_MARKETS[i];

      try {
        console.log(`\n🟡 Processing ${market}...`);

        const signal = await generateSignalWithRetry(market);
        console.log(`🟡 ${market} SIGNAL OK`);

        const message = formatSignalMessage(signal);
        await sendTelegramSignal(message);

        console.log(`✅ ${market} SENT TO PRIVATE CHANNEL`);

        results.push({
          market,
          ok: true,
          signal,
          telegram: true,
        });
      } catch (error) {
        console.error(`❌ ${market} ERROR:`, error);
        results.push({
          market,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Delay antar market (aman untuk free tier)
      if (i < CRYPTO_MARKETS.length - 1) {
        console.log(`⏳ Waiting 20 seconds...`);
        await sleep(35_000);
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    const failedCount = results.filter((r) => !r.ok).length;

    console.log("\n==========================================");
    console.log(`✅ SUCCESS: ${successCount} | ❌ FAILED: ${failedCount}`);
    console.log("==========================================");

    return NextResponse.json({
      ok: true,
      category: "cryptocurrency",
      markets: CRYPTO_MARKETS,
      success: successCount,
      failed: failedCount,
      results,
    });
  } catch (error) {
    console.error("❌ CRON ERROR:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}