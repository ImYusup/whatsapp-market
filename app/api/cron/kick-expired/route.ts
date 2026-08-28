// app/api/cron/kick-expired/route.ts

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { kickTelegramUser } from "@/lib/telegram/kick";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getCronSecret() {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET belum diset");
  return secret;
}

function getSheets() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!email || !key || !sheetId) throw new Error("Google Sheets env missing");

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return { sheets: google.sheets({ version: "v4", auth }), sheetId };
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${getCronSecret()}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { sheets, sheetId } = getSheets();
    const now = new Date();

    // 1. Ambil subscriptions
    const subRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Subscriptions!A:E",
    });
    const subRows = subRes.data.values || [];

    // 2. Ambil subscribers (butuh telegram_user_id)
    const userRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Subscribers!A:H",
    });
    const userRows = userRes.data.values || [];

    const telegramBySubscriber = new Map<string, { userId: string; rowNumber: number }>();
    for (let i = 1; i < userRows.length; i++) {
      const sid = userRows[i][0] || "";
      const tgId = userRows[i][5] || ""; // kolom F
      if (sid && tgId) {
        telegramBySubscriber.set(sid, { userId: tgId, rowNumber: i + 1 });
      }
    }

    const results: any[] = [];

    for (let i = 1; i < subRows.length; i++) {
      const row = subRows[i];
      const subscriptionId = row[0] || "";
      const subscriberId = row[1] || "";
      const expiredAt = row[3] || "";
      const status = row[4] || "";

      if (status !== "ACTIVE") continue;

      const exp = new Date(expiredAt);
      if (Number.isNaN(exp.getTime()) || exp > now) continue;

      // Expired
      const tg = telegramBySubscriber.get(subscriberId);

      // Update status subscription → EXPIRED
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `Subscriptions!E${i + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [["EXPIRED"]] },
      });

      if (!tg) {
        results.push({
          subscriptionId,
          subscriberId,
          kicked: false,
          reason: "no_telegram_user_id",
        });
        continue;
      }

      try {
        await kickTelegramUser(tg.userId);
        results.push({
          subscriptionId,
          subscriberId,
          telegramUserId: tg.userId,
          kicked: true,
        });
        console.log("✅ Kicked:", tg.userId);
      } catch (err) {
        results.push({
          subscriptionId,
          subscriberId,
          telegramUserId: tg.userId,
          kicked: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      checked: subRows.length - 1,
      results,
    });
  } catch (error) {
    console.error("kick-expired error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}