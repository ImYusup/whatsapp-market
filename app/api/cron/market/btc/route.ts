// app/api/cron/market/btc/route.ts

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { generateSignal } from "@/lib/market/signal";
import { twelveDataProvider } from "@/lib/market/providers/twelveData";
import { Market } from "@/lib/market/markets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MARKET: Market = "BTC/USD";

function getCronSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET belum diset.");
  }
  return secret;
}

function getSheetsClient() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!email || !key || !sheetId) {
    throw new Error("Google Sheets environment variables belum lengkap.");
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return {
    sheets: google.sheets({ version: "v4", auth }),
    sheetId,
  };
}

async function enqueueMarketSignal(
  signal: Awaited<ReturnType<typeof generateSignal>>
) {
  const { sheets, sheetId } = getSheetsClient();

  const queueId = `QUEUE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "Market_Queue!A:G",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          queueId,                 // A: queue_id
          signal.market,          // B: market
          JSON.stringify(signal), // C: signal_json
          "PENDING",              // D: status
          now,                    // E: created_at
          "",                     // F: processed_at
          "",                     // G: error
        ],
      ],
    },
  });

  return {
    queueId,
    market: signal.market,
  };
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

    const queueResult = await enqueueMarketSignal(signal);

    console.log("🟡 BTC QUEUED:", queueResult);

    return NextResponse.json({
      ok: true,
      market: MARKET,
      signal,
      queue: queueResult,
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