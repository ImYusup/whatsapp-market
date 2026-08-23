// app/api/cron/market/xau/route.ts
import { NextResponse } from "next/server";
import { generateSignal } from "@/lib/market/signal";
import { goldApi } from "@/lib/market/providers/goldApi";
import { Market } from "@/lib/market/markets";
import { sendTelegramSignal } from "@/lib/telegram/send";
import { formatSignalMessage } from "@/lib/telegram/formatSignal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MARKET: Market = "XAU/USD";

function getCronSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET belum diset.");
  return secret;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cek weekend di timezone Jakarta */
function isWeekend(): boolean {
  const day = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
  });
  return day === "Sat" || day === "Sun";
}

async function generateSignalWithRetry(maxRetries = 3) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateSignal(MARKET, goldApi);
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);

      // Rate limit Twelve Data
      if (msg.includes("429") || msg.includes("run out of API credits") || msg.includes("All Twelve Data keys failed")) {
        const waitSec = 25 + attempt * 10;
        console.log(`⏳ XAU rate limit (attempt ${attempt}/${maxRetries}). Tunggu ${waitSec}s...`);
        await sleep(waitSec * 1000);
        continue;
      }

      // Market closed / no data
      if (
        msg.toLowerCase().includes("market is closed") ||
        msg.toLowerCase().includes("no data") ||
        msg.toLowerCase().includes("insufficient") ||
        msg.toLowerCase().includes("not available")
      ) {
        throw new Error("MARKET_CLOSED");
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

    // Skip total di weekend
    if (isWeekend()) {
      console.log("⏸️ XAU cron skipped — weekend (market closed)");
      return NextResponse.json({
        ok: true,
        market: MARKET,
        skipped: true,
        reason: "weekend",
        message: "XAU market closed on weekend",
      });
    }

    console.log("==========================================");
    console.log("🟠 XAU/USD CRON START → TELEGRAM");
    console.log("==========================================");

    try {
      const signal = await generateSignalWithRetry();
      console.log("🟠 XAU SIGNAL OK");

      const message = formatSignalMessage(signal);
      await sendTelegramSignal(message);

      console.log("✅ XAU SENT TO PRIVATE CHANNEL");

      return NextResponse.json({
        ok: true,
        market: MARKET,
        signal,
        telegram: true,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      if (msg === "MARKET_CLOSED") {
        console.log("⏸️ XAU skipped — market closed");
        return NextResponse.json({
          ok: true,
          market: MARKET,
          skipped: true,
          reason: "market_closed",
        });
      }

      throw error;
    }
  } catch (error) {
    console.error("❌ XAU CRON ERROR:", error);
    return NextResponse.json(
      {
        ok: false,
        market: MARKET,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}