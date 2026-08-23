// app/api/subscription/route.ts

import { NextRequest } from "next/server";
import { google } from "googleapis";
import crypto from "crypto";

import {
  sendAlreadyActiveText,
  sendRenewedText,
  sendStatusText,
  sendSubscriptionActivatedInvite,
} from "@/lib/whatsapp/sender";
import { generateInviteLink } from "@/lib/telegram/invite";

// ============================================================
// ENV
// ============================================================

const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

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
  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
    throw new Error("Google Sheets environment variables are not configured");
  }

  const auth = new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

// ============================================================
// HELPERS
// ============================================================

function generateId(prefix: string) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function normalizePhone(phone: string) {
  let value = phone.replace(/\D/g, "");
  if (value.startsWith("08")) value = "62" + value.substring(1);
  if (value.startsWith("8")) value = "62" + value;
  return value;
}

function normalizeName(name?: string) {
  return name?.trim() || "";
}

function addOneMonth(date: Date) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  return result;
}

// ============================================================
// READ / APPEND SHEET
// ============================================================

async function readSheet(sheetName: string) {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${sheetName}!A:Z`,
  });
  return response.data.values || [];
}

async function appendSheet(sheetName: string, values: string[][]) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${sheetName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

// ============================================================
// FIND SUBSCRIBER
// ============================================================

async function findSubscriber(phone: string) {
  const rows = await readSheet(SHEETS.subscribers);
  if (rows.length <= 1) return null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowPhone = normalizePhone(row[1] || "");

    if (rowPhone === phone) {
      return {
        rowNumber: i + 1,
        subscriberId: row[0] || "",
        phone: rowPhone,
        name: row[2] || "",
        createdAt: row[3] || "",
        status: row[4] || "",
      };
    }
  }
  return null;
}

// ============================================================
// FIND ACTIVE SUBSCRIPTION
// ============================================================

async function findActiveSubscription(subscriberId: string) {
  const rows = await readSheet(SHEETS.subscriptions);
  if (rows.length <= 1) return null;

  const now = new Date();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowSubscriberId = row[1] || "";
    const expiredAt = row[3] || "";
    const status = row[4] || "";

    if (rowSubscriberId !== subscriberId || status !== "ACTIVE") continue;

    const expiration = new Date(expiredAt);
    if (Number.isNaN(expiration.getTime())) continue;
    if (expiration > now) {
      return {
        rowNumber: i + 1,
        subscriptionId: row[0] || "",
        subscriberId: rowSubscriberId,
        startAt: row[2] || "",
        expiredAt,
        status,
      };
    }
  }
  return null;
}

// ============================================================
// SUBSCRIBE (sheet only — WA dikirim di POST handler)
// ============================================================

async function subscribe(phone: string, name: string) {
  const now = new Date();
  let subscriber = await findSubscriber(phone);
  let subscriberCreated = false;

  if (!subscriber) {
    subscriber = {
      rowNumber: 0,
      subscriberId: generateId("SUB"),
      phone,
      name,
      createdAt: now.toISOString(),
      status: "ACTIVE",
    };

    await appendSheet(SHEETS.subscribers, [
      [
        subscriber.subscriberId,
        subscriber.phone,
        subscriber.name,
        subscriber.createdAt,
        subscriber.status,
      ],
    ]);

    subscriberCreated = true;
    console.log("✅ SUBSCRIBER CREATED:", subscriber.subscriberId);
  }

  const activeSubscription = await findActiveSubscription(subscriber.subscriberId);

  if (activeSubscription) {
    console.log("ℹ️ SUBSCRIPTION ALREADY ACTIVE");
    return {
      ok: true,
      action: "ALREADY_ACTIVE" as const,
      subscriber,
      subscription: activeSubscription,
      subscriberCreated,
    };
  }

  const startAt = now;
  const expiredAt = addOneMonth(startAt);

  const subscription = {
    subscriptionId: generateId("SUBSCRIPTION"),
    subscriberId: subscriber.subscriberId,
    startAt: startAt.toISOString(),
    expiredAt: expiredAt.toISOString(),
    status: "ACTIVE",
  };

  await appendSheet(SHEETS.subscriptions, [
    [
      subscription.subscriptionId,
      subscription.subscriberId,
      subscription.startAt,
      subscription.expiredAt,
      subscription.status,
    ],
  ]);

  console.log("✅ SUBSCRIPTION CREATED:", subscription.subscriptionId);

  return {
    ok: true,
    action: "SUBSCRIBED" as const,
    subscriber,
    subscription,
    subscriberCreated,
  };
}

// ============================================================
// RENEW
// ============================================================

async function renew(phone: string) {
  const subscriber = await findSubscriber(phone);

  if (!subscriber) {
    return { ok: false, action: "SUBSCRIBER_NOT_FOUND" as const };
  }

  const rows = await readSheet(SHEETS.subscriptions);
  if (rows.length <= 1) {
    return { ok: false, action: "SUBSCRIPTION_NOT_FOUND" as const };
  }

  let latestSubscription: {
    rowNumber: number;
    subscriptionId: string;
    subscriberId: string;
    startAt: string;
    expiredAt: string;
    status: string;
  } | null = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if ((row[1] || "") !== subscriber.subscriberId) continue;

    latestSubscription = {
      rowNumber: i + 1,
      subscriptionId: row[0] || "",
      subscriberId: row[1] || "",
      startAt: row[2] || "",
      expiredAt: row[3] || "",
      status: row[4] || "",
    };
  }

  if (!latestSubscription) {
    return { ok: false, action: "SUBSCRIPTION_NOT_FOUND" as const };
  }

  const now = new Date();
  const oldExpiredAt = new Date(latestSubscription.expiredAt);
  const baseDate = oldExpiredAt > now ? oldExpiredAt : now;
  const newExpiredAt = addOneMonth(baseDate);

  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${SHEETS.subscriptions}!D${latestSubscription.rowNumber}:E${latestSubscription.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[newExpiredAt.toISOString(), "ACTIVE"]],
    },
  });

  await appendSheet(SHEETS.renewalHistory, [
    [
      generateId("RENEWAL"),
      subscriber.subscriberId,
      latestSubscription.subscriptionId,
      latestSubscription.expiredAt,
      newExpiredAt.toISOString(),
      now.toISOString(),
      "SUCCESS",
    ],
  ]);

  return {
    ok: true,
    action: "RENEWED" as const,
    subscriber,
    subscription: {
      ...latestSubscription,
      expiredAt: newExpiredAt.toISOString(),
      status: "ACTIVE",
    },
  };
}

// ============================================================
// STATUS
// ============================================================

async function getStatus(phone: string) {
  const subscriber = await findSubscriber(phone);

  if (!subscriber) {
    return {
      ok: true,
      action: "NOT_SUBSCRIBED" as const,
      subscriber: null,
      subscription: null,
    };
  }

  const subscription = await findActiveSubscription(subscriber.subscriberId);

  if (!subscription) {
    return {
      ok: true,
      action: "EXPIRED" as const,
      subscriber,
      subscription: null,
    };
  }

  return {
    ok: true,
    action: "ACTIVE" as const,
    subscriber,
    subscription,
  };
}

// ============================================================
// HELPER: safe WA send
// ============================================================

async function safeNotify(
  fn: () => Promise<unknown>
): Promise<{ ok: boolean; type: string; error?: string }> {
  try {
    await fn();
    return { ok: true, type: "text" };
  } catch (err) {
    console.error("WA notify failed:", err);
    return {
      ok: false,
      type: "text",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================
// POST /api/subscription
// ============================================================

export async function POST(req: NextRequest) {
  console.log("========== SUBSCRIPTION API ==========");

  try {
    const body = await req.json();
    const action = String(body?.action || "").trim().toUpperCase();
    const phone = normalizePhone(String(body?.phone || ""));
    const name = normalizeName(body?.name);

    console.log("SUBSCRIPTION REQUEST:", { action, phone, name });

    if (!phone) {
      return Response.json({ ok: false, error: "Phone is required" }, { status: 400 });
    }

    if (!["SUBSCRIBE", "RENEW", "STATUS"].includes(action)) {
      return Response.json(
        {
          ok: false,
          error: "Invalid subscription action",
          allowedActions: ["SUBSCRIBE", "RENEW", "STATUS"],
        },
        { status: 400 }
      );
    }

    // ========================================================
    // SUBSCRIBE
    // ========================================================
    if (action === "SUBSCRIBE") {
      const result = await subscribe(phone, name);

      if (result.action === "ALREADY_ACTIVE") {
        const notification = await safeNotify(() =>
          sendAlreadyActiveText({
            phone: result.subscriber.phone,
            name: result.subscriber.name || name || "Customer",
            expiredAt: result.subscription.expiredAt,
          })
        );
        return Response.json({ ...result, notification });
      }

      // SUBSCRIBED → invite link + WA
      const notification = await safeNotify(async () => {
        const invite = await generateInviteLink({
          memberLimit: 1,
          expireHours: 48,
          name: `Sub-${result.subscriber.subscriberId}`,
        });

        await sendSubscriptionActivatedInvite({
          phone: result.subscriber.phone,
          name: result.subscriber.name || name || "Customer",
          inviteLink: invite.inviteLink,
        });
      });

      return Response.json({ ...result, notification });
    }

    // ========================================================
    // RENEW
    // ========================================================
    if (action === "RENEW") {
      const result = await renew(phone);

      if (
        result.action === "SUBSCRIBER_NOT_FOUND" ||
        result.action === "SUBSCRIPTION_NOT_FOUND"
      ) {
        const notification = await safeNotify(() =>
          sendStatusText({
            phone,
            name: name || "Customer",
            status: "NOT_SUBSCRIBED",
          })
        );
        return Response.json({ ...result, notification });
      }

      if (result.ok && result.action === "RENEWED") {
        const notification = await safeNotify(() =>
          sendRenewedText({
            phone: result.subscriber!.phone,
            name: result.subscriber!.name || name || "Customer",
            expiredAt: result.subscription!.expiredAt,
          })
        );
        return Response.json({ ...result, notification });
      }

      return Response.json(result, { status: result.ok ? 200 : 400 });
    }

    // ========================================================
    // STATUS
    // ========================================================
    if (action === "STATUS") {
      const result = await getStatus(phone);

      const notification = await safeNotify(async () => {
        if (result.action === "NOT_SUBSCRIBED") {
          await sendStatusText({
            phone,
            name: name || "Customer",
            status: "NOT_SUBSCRIBED",
          });
        } else if (result.action === "EXPIRED") {
          await sendStatusText({
            phone,
            name: result.subscriber?.name || name || "Customer",
            status: "EXPIRED",
          });
        } else {
          await sendStatusText({
            phone,
            name: result.subscriber?.name || name || "Customer",
            status: "ACTIVE",
            expiredAt: result.subscription?.expiredAt,
          });
        }
      });

      return Response.json({ ...result, notification });
    }

    return Response.json({ ok: false, error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("========== SUBSCRIPTION API ERROR ==========");
    console.error(error);

    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Subscription API failed",
      },
      { status: 500 }
    );
  }
}