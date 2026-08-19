// src/api/subscription/route.ts

import { NextRequest } from "next/server";
import { google } from "googleapis";
import crypto from "crypto";

// ============================================================
// ENV
// ============================================================

const GOOGLE_CLIENT_EMAIL =
  process.env.GOOGLE_CLIENT_EMAIL;

const GOOGLE_PRIVATE_KEY =
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

const GOOGLE_SHEET_ID =
  process.env.GOOGLE_SHEET_ID;

// Apps Script Web App URL
const APPS_SCRIPT_WEBHOOK_URL =
  process.env.APPS_SCRIPT_WEBHOOK_URL;

// Secret antara Next.js dan Apps Script
const APPS_SCRIPT_WEBHOOK_SECRET =
  process.env.APPS_SCRIPT_WEBHOOK_SECRET;

// ============================================================
// SHEET NAMES
// ============================================================

const SHEETS = {
  subscribers: "Subscribers",
  subscriptions: "Subscriptions",
  renewalHistory: "Renewal_History",
} as const;

// ============================================================
// GOOGLE SHEETS CLIENT
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
// HELPERS
// ============================================================

function generateId(prefix: string) {
  return `${prefix}_${Date.now()}_${crypto
    .randomBytes(4)
    .toString("hex")}`;
}

function normalizePhone(phone: string) {
  let value = phone.replace(/\D/g, "");

  if (value.startsWith("08")) {
    value = "62" + value.substring(1);
  }

  if (value.startsWith("8")) {
    value = "62" + value;
  }

  return value;
}

function normalizeName(name?: string) {
  return name?.trim() || "";
}

function addOneMonth(date: Date) {
  const result = new Date(date);

  result.setMonth(
    result.getMonth() + 1
  );

  return result;
}

// ============================================================
// READ SHEET
// ============================================================

async function readSheet(
  sheetName: string
) {
  const sheets = getSheetsClient();

  const response =
    await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID!,
      range: `${sheetName}!A:Z`,
    });

  return response.data.values || [];
}

// ============================================================
// APPEND SHEET
// ============================================================

async function appendSheet(
  sheetName: string,
  values: string[][]
) {
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${sheetName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values,
    },
  });
}

// ============================================================
// FIND SUBSCRIBER
// ============================================================

async function findSubscriber(
  phone: string
) {
  const rows = await readSheet(
    SHEETS.subscribers
  );

  if (rows.length <= 1) {
    return null;
  }

  for (
    let i = 1;
    i < rows.length;
    i++
  ) {
    const row = rows[i];

    const subscriberId =
      row[0] || "";

    const rowPhone =
      normalizePhone(
        row[1] || ""
      );

    const name =
      row[2] || "";

    const createdAt =
      row[3] || "";

    const status =
      row[4] || "";

    if (
      rowPhone === phone
    ) {
      return {
        rowNumber: i + 1,
        subscriberId,
        phone: rowPhone,
        name,
        createdAt,
        status,
      };
    }
  }

  return null;
}

// ============================================================
// FIND ACTIVE SUBSCRIPTION
// ============================================================

async function findActiveSubscription(
  subscriberId: string
) {
  const rows =
    await readSheet(
      SHEETS.subscriptions
    );

  if (rows.length <= 1) {
    return null;
  }

  const now =
    new Date();

  for (
    let i = 1;
    i < rows.length;
    i++
  ) {
    const row = rows[i];

    const subscriptionId =
      row[0] || "";

    const rowSubscriberId =
      row[1] || "";

    const startAt =
      row[2] || "";

    const expiredAt =
      row[3] || "";

    const status =
      row[4] || "";

    if (
      rowSubscriberId !==
        subscriberId ||
      status !== "ACTIVE"
    ) {
      continue;
    }

    const expiration =
      new Date(expiredAt);

    if (
      Number.isNaN(
        expiration.getTime()
      )
    ) {
      continue;
    }

    if (
      expiration > now
    ) {
      return {
        rowNumber: i + 1,
        subscriptionId,
        subscriberId:
          rowSubscriberId,
        startAt,
        expiredAt,
        status,
      };
    }
  }

  return null;
}

// ============================================================
// NOTIFY APPS SCRIPT
//
// NEXT.JS → APPS SCRIPT WEB APP
// ============================================================

async function notifyAppsScript(
  subscriberId: string
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

  console.log(
    "=========================================="
  );

  console.log(
    "📡 NOTIFY APPS SCRIPT"
  );

  console.log(
    "SUBSCRIBER ID:",
    subscriberId
  );

  console.log(
    "=========================================="
  );

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
            "SUBSCRIBER_CREATED",

          subscriberId,
        }),

        cache: "no-store",
      }
    );

  const text =
    await response.text();

  console.log(
    "📡 APPS SCRIPT HTTP:",
    response.status
  );

  console.log(
    "📡 APPS SCRIPT RESPONSE:",
    text
  );

  if (
    !response.ok
  ) {
    throw new Error(
      `Apps Script webhook failed: HTTP ${response.status} - ${text}`
    );
  }

  let data: unknown = null;

  try {
    data =
      JSON.parse(text);
  } catch {
    data = {
      raw: text,
    };
  }

  return {
    ok: true,
    status:
      response.status,
    data,
  };
}

// ============================================================
// SUBSCRIBE
// ============================================================

async function subscribe(
  phone: string,
  name: string
) {
  const now =
    new Date();

  let subscriber =
    await findSubscriber(
      phone
    );

  let subscriberCreated =
    false;

  // ==========================================================
  // CREATE SUBSCRIBER
  // ==========================================================

  if (!subscriber) {
    subscriber = {
      rowNumber: 0,

      subscriberId:
        generateId("SUB"),

      phone,

      name,

      createdAt:
        now.toISOString(),

      status:
        "ACTIVE",
    };

    await appendSheet(
      SHEETS.subscribers,
      [
        [
          subscriber.subscriberId,
          subscriber.phone,
          subscriber.name,
          subscriber.createdAt,
          subscriber.status,
        ],
      ]
    );

    subscriberCreated =
      true;

    console.log(
      "✅ SUBSCRIBER CREATED:",
      subscriber.subscriberId
    );
  }

  // ==========================================================
  // CHECK ACTIVE SUBSCRIPTION
  // ==========================================================

  const activeSubscription =
    await findActiveSubscription(
      subscriber.subscriberId
    );

  if (
    activeSubscription
  ) {
    console.log(
      "ℹ️ SUBSCRIPTION ALREADY ACTIVE"
    );

    return {
      ok: true,

      action:
        "ALREADY_ACTIVE",

      subscriber,

      subscription:
        activeSubscription,

      notification:
        null,
    };
  }

  // ==========================================================
  // CREATE SUBSCRIPTION
  // ==========================================================

  const startAt =
    now;

  const expiredAt =
    addOneMonth(
      startAt
    );

  const subscription = {
    subscriptionId:
      generateId(
        "SUBSCRIPTION"
      ),

    subscriberId:
      subscriber.subscriberId,

    startAt:
      startAt.toISOString(),

    expiredAt:
      expiredAt.toISOString(),

    status:
      "ACTIVE",
  };

  await appendSheet(
    SHEETS.subscriptions,
    [
      [
        subscription.subscriptionId,
        subscription.subscriberId,
        subscription.startAt,
        subscription.expiredAt,
        subscription.status,
      ],
    ]
  );

  console.log(
    "✅ SUBSCRIPTION CREATED:",
    subscription.subscriptionId
  );

  // ==========================================================
  // REALTIME WHATSAPP NOTIFICATION
  //
  // HANYA UNTUK SUBSCRIBER BARU
  // ATAU SUBSCRIBE BARU
  // ==========================================================

  let notification:
    | {
        ok: boolean;
        status: number;
        data: unknown;
      }
    | null = null;

  try {
    notification =
      await notifyAppsScript(
        subscriber.subscriberId
      );

    console.log(
      "🎉 REALTIME WA NOTIFICATION TRIGGERED"
    );

  } catch (error) {
    console.error(
      "❌ REALTIME WA NOTIFICATION FAILED:",
      error
    );

    /*
     * Subscription tetap dianggap berhasil.
     *
     * Jadi kalau WA gagal:
     * - data subscriber tetap ada
     * - subscription tetap ACTIVE
     * - API tidak rollback
     */

    notification = {
      ok: false,
      status: 500,
      data: {
        error:
          error instanceof Error
            ? error.message
            : "Notification failed",
      },
    };
  }

  return {
    ok: true,

    action:
      "SUBSCRIBED",

    subscriber,

    subscription,

    notification,

    subscriberCreated,
  };
}

// ============================================================
// RENEW
// ============================================================

async function renew(
  phone: string
) {
  const subscriber =
    await findSubscriber(
      phone
    );

  if (!subscriber) {
    return {
      ok: false,
      action:
        "SUBSCRIBER_NOT_FOUND",
    };
  }

  const rows =
    await readSheet(
      SHEETS.subscriptions
    );

  if (rows.length <= 1) {
    return {
      ok: false,
      action:
        "SUBSCRIPTION_NOT_FOUND",
    };
  }

  let latestSubscription:
    | {
        rowNumber: number;
        subscriptionId: string;
        subscriberId: string;
        startAt: string;
        expiredAt: string;
        status: string;
      }
    | null = null;

  for (
    let i = 1;
    i < rows.length;
    i++
  ) {
    const row =
      rows[i];

    const rowSubscriberId =
      row[1] || "";

    if (
      rowSubscriberId !==
      subscriber.subscriberId
    ) {
      continue;
    }

    latestSubscription = {
      rowNumber:
        i + 1,

      subscriptionId:
        row[0] || "",

      subscriberId:
        row[1] || "",

      startAt:
        row[2] || "",

      expiredAt:
        row[3] || "",

      status:
        row[4] || "",
    };
  }

  if (
    !latestSubscription
  ) {
    return {
      ok: false,
      action:
        "SUBSCRIPTION_NOT_FOUND",
    };
  }

  const now =
    new Date();

  const oldExpiredAt =
    new Date(
      latestSubscription.expiredAt
    );

  const baseDate =
    oldExpiredAt > now
      ? oldExpiredAt
      : now;

  const newExpiredAt =
    addOneMonth(
      baseDate
    );

  const sheets =
    getSheetsClient();

  // ==========================================================
  // UPDATE SUBSCRIPTION
  // ==========================================================

  await sheets.spreadsheets.values.update(
    {
      spreadsheetId:
        GOOGLE_SHEET_ID!,

      range:
        `${SHEETS.subscriptions}!D${latestSubscription.rowNumber}:E${latestSubscription.rowNumber}`,

      valueInputOption:
        "USER_ENTERED",

      requestBody: {
        values: [
          [
            newExpiredAt.toISOString(),
            "ACTIVE",
          ],
        ],
      },
    }
  );

  // ==========================================================
  // RENEWAL HISTORY
  // ==========================================================

  await appendSheet(
    SHEETS.renewalHistory,
    [
      [
        generateId(
          "RENEWAL"
        ),

        subscriber.subscriberId,

        latestSubscription.subscriptionId,

        latestSubscription.expiredAt,

        newExpiredAt.toISOString(),

        now.toISOString(),

        "SUCCESS",
      ],
    ]
  );

  return {
    ok: true,

    action:
      "RENEWED",

    subscriber,

    subscription: {
      ...latestSubscription,

      expiredAt:
        newExpiredAt.toISOString(),

      status:
        "ACTIVE",
    },

    notification:
      null,
  };
}

// ============================================================
// STATUS
// ============================================================

async function getStatus(
  phone: string
) {
  const subscriber =
    await findSubscriber(
      phone
    );

  if (!subscriber) {
    return {
      ok: true,

      action:
        "NOT_SUBSCRIBED",

      subscriber:
        null,

      subscription:
        null,
    };
  }

  const subscription =
    await findActiveSubscription(
      subscriber.subscriberId
    );

  if (!subscription) {
    return {
      ok: true,

      action:
        "EXPIRED",

      subscriber,

      subscription:
        null,
    };
  }

  return {
    ok: true,

    action:
      "ACTIVE",

    subscriber,

    subscription,
  };
}

// ============================================================
// POST /api/market
// ============================================================

export async function POST(
  req: NextRequest
) {
  console.log(
    "========== SUBSCRIPTION API =========="
  );

  try {
    const body =
      await req.json();

    const action =
      String(
        body?.action || ""
      )
        .trim()
        .toUpperCase();

    const phone =
      normalizePhone(
        String(
          body?.phone || ""
        )
      );

    const name =
      normalizeName(
        body?.name
      );

    console.log(
      "SUBSCRIPTION REQUEST:",
      {
        action,
        phone,
        name,
      }
    );

    // ========================================================
    // VALIDATE PHONE
    // ========================================================

    if (!phone) {
      return Response.json(
        {
          ok: false,
          error:
            "Phone is required",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // VALIDATE ACTION
    // ========================================================

    if (
      ![
        "SUBSCRIBE",
        "RENEW",
        "STATUS",
      ].includes(action)
    ) {
      return Response.json(
        {
          ok: false,

          error:
            "Invalid subscription action",

          allowedActions: [
            "SUBSCRIBE",
            "RENEW",
            "STATUS",
          ],
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // SUBSCRIBE
    // ========================================================

    if (
      action ===
      "SUBSCRIBE"
    ) {
      const result =
        await subscribe(
          phone,
          name
        );

      return Response.json(
        result,
        {
          status:
            result.ok
              ? 200
              : 400,
        }
      );
    }

    // ========================================================
    // RENEW
    // ========================================================

    if (
      action ===
      "RENEW"
    ) {
      const result =
        await renew(
          phone
        );

      return Response.json(
        result,
        {
          status:
            result.ok
              ? 200
              : 400,
        }
      );
    }

    // ========================================================
    // STATUS
    // ========================================================

    if (
      action ===
      "STATUS"
    ) {
      const result =
        await getStatus(
          phone
        );

      return Response.json(
        result
      );
    }

    return Response.json(
      {
        ok: false,

        error:
          "Unsupported action",
      },
      {
        status: 400,
      }
    );

  } catch (error) {

    console.error(
      "========== SUBSCRIPTION API ERROR =========="
    );

    console.error(
      error
    );

    return Response.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "Subscription API failed",
      },
      {
        status: 500,
      }
    );
  }
}