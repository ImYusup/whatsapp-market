// app/api/cron/market/route.ts

import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// ENV
// ============================================================

const GOOGLE_CLIENT_EMAIL =
  process.env.GOOGLE_CLIENT_EMAIL;

const GOOGLE_PRIVATE_KEY =
  process.env.GOOGLE_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );

const GOOGLE_SHEET_ID =
  process.env.GOOGLE_SHEET_ID;

const APPS_SCRIPT_WEBHOOK_URL =
  process.env.APPS_SCRIPT_WEBHOOK_URL;

const APPS_SCRIPT_WEBHOOK_SECRET =
  process.env.APPS_SCRIPT_WEBHOOK_SECRET;

// ============================================================
// GOOGLE SHEETS
// ============================================================

function getSheetsClient() {
  if (
    !GOOGLE_CLIENT_EMAIL ||
    !GOOGLE_PRIVATE_KEY ||
    !GOOGLE_SHEET_ID
  ) {
    throw new Error(
      "Google Sheets environment variables are not configured"
    );
  }

  const auth = new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });

  return google.sheets({
    version: "v4",
    auth,
  });
}

// ============================================================
// GET ACTIVE SUBSCRIBERS
// ============================================================

async function getActiveSubscribers() {
  const sheets =
    getSheetsClient();

  const response =
    await sheets.spreadsheets.values.get({
      spreadsheetId:
        GOOGLE_SHEET_ID!,
      range:
        "Subscribers!A:E",
    });

  const rows =
    response.data.values || [];

  if (rows.length <= 1) {
    return [];
  }

  return rows
    .slice(1)
    .filter(
      (row) =>
        row[4] === "ACTIVE"
    )
    .map((row) => ({
      subscriberId:
        row[0] || "",
      phone:
        row[1] || "",
      name:
        row[2] || "",
    }))
    .filter(
      (subscriber) =>
        subscriber.phone
    );
}

// ============================================================
// SEND MARKET NOTIFICATION
// ============================================================

async function sendMarketNotification(
  subscriber: {
    subscriberId: string;
    phone: string;
    name: string;
  }
) {
  if (
    !APPS_SCRIPT_WEBHOOK_URL
  ) {
    throw new Error(
      "APPS_SCRIPT_WEBHOOK_URL is not configured"
    );
  }

  if (
    !APPS_SCRIPT_WEBHOOK_SECRET
  ) {
    throw new Error(
      "APPS_SCRIPT_WEBHOOK_SECRET is not configured"
    );
  }

  const response =
    await fetch(
      APPS_SCRIPT_WEBHOOK_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          secret:
            APPS_SCRIPT_WEBHOOK_SECRET,

          action:
            "MARKET_NOTIFICATION",

          subscriberId:
            subscriber.subscriberId,

          phone:
            subscriber.phone,

          name:
            subscriber.name,

          markets: [
            "XAU/USD",
            "BTC/USD",
          ],
        }),

        cache: "no-store",
      }
    );

  const text =
    await response.text();

  console.log(
    "📡 APPS SCRIPT:",
    response.status,
    text
  );

  if (!response.ok) {
    throw new Error(
      `Apps Script failed: HTTP ${response.status} - ${text}`
    );
  }

  return text;
}

// ============================================================
// CRON
// ============================================================

export async function GET() {
  try {
    console.log(
      "=========================================="
    );

    console.log(
      "📡 MARKET CRON START"
    );

    console.log(
      "=========================================="
    );

    const now =
      new Date();

    console.log(
      "⏰ CRON TIME:",
      now.toISOString()
    );

    console.log(
      "📊 MARKETS:",
      "XAU/USD, BTC/USD"
    );

    // ==========================================================
    // GET ACTIVE USERS
    // ==========================================================

    const subscribers =
      await getActiveSubscribers();

    console.log(
      "👥 ACTIVE USERS:",
      subscribers.length
    );

    // ==========================================================
    // SEND TO ALL ACTIVE USERS
    // ==========================================================

    const results = [];

    for (
      const subscriber of subscribers
    ) {
      try {
        const response =
          await sendMarketNotification(
            subscriber
          );

        console.log(
          "✅ MARKET WA SENT:",
          subscriber.phone
        );

        results.push({
          phone:
            subscriber.phone,

          ok: true,

          response,
        });

      } catch (error) {
        console.error(
          "❌ MARKET WA FAILED:",
          subscriber.phone,
          error
        );

        results.push({
          phone:
            subscriber.phone,

          ok: false,

          error:
            error instanceof Error
              ? error.message
              : "Unknown error",
        });
      }
    }

    // ==========================================================
    // RESULT
    // ==========================================================

    const sent =
      results.filter(
        (item) => item.ok
      ).length;

    const failed =
      results.filter(
        (item) => !item.ok
      ).length;

    console.log(
      "=========================================="
    );

    console.log(
      "📡 MARKET CRON END"
    );

    console.log(
      `✅ SENT: ${sent}`
    );

    console.log(
      `❌ FAILED: ${failed}`
    );

    console.log(
      "=========================================="
    );

    return Response.json({
      ok: true,

      markets: [
        "XAU/USD",
        "BTC/USD",
      ],

      subscribers:
        subscribers.length,

      sent,

      failed,

      timestamp:
        now.toISOString(),

      results,
    });

  } catch (error) {
    console.error(
      "❌ MARKET CRON ERROR:",
      error
    );

    return Response.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "Market cron failed",
      },
      {
        status: 500,
      }
    );
  }
}