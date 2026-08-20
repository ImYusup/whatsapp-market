// app/api/cron/market/btc/route.ts

import { NextResponse } from "next/server";
import { generateSignal } from "@/lib/market/signal";
import { twelveDataProvider } from "@/lib/market/providers/twelveData";
import { Market } from "@/lib/market/markets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MARKET: Market = "BTC/USD";   // ← ini yang beda

function getCronSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET belum diset.");
  }
  return secret;
}

async function sendToAppsScript(
  signal: Awaited<ReturnType<typeof generateSignal>>
) {
  const url = process.env.APPS_SCRIPT_WEBHOOK_URL;
  const secret = process.env.APPS_SCRIPT_WEBHOOK_SECRET;

  if (!url) {
    throw new Error("APPS_SCRIPT_WEBHOOK_URL belum diset.");
  }
  if (!secret) {
    throw new Error("APPS_SCRIPT_WEBHOOK_SECRET belum diset.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      secret,
      action: "MARKET_SIGNAL",
      signal,
    }),
    cache: "no-store",
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Apps Script HTTP ${response.status}: ${body}`);
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Apps Script invalid JSON: ${body}`);
  }

  if (!data.ok) {
    throw new Error(`Apps Script rejected: ${body}`);
  }

  return data;
}

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");

    if (authorization !== `Bearer ${getCronSecret()}`) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("==========================================");
    console.log("🟡 BTC/USD CRON START");

    const signal = await generateSignal(MARKET, twelveDataProvider);

    console.log("🟡 BTC SIGNAL:", JSON.stringify(signal));

    const whatsapp = await sendToAppsScript(signal);

    console.log("🟡 BTC WHATSAPP RESULT:", whatsapp);

    return NextResponse.json({
      ok: true,
      market: MARKET,
      signal,
      whatsapp,
    });
  } catch (error) {
    console.error("❌ BTC CRON ERROR:", error);

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