// src/app/api/webhook/route.ts

import { NextRequest } from "next/server";

import {
  renew,
  getSubscriptionStatus,
} from "@/lib/subscription/service";

import {
  isValidAction,
  normalizeAction,
} from "@/lib/subscription/validator";

import {
  sendText,
  sendAlreadyActiveText,
  sendRenewedText,
  sendStatusText,
} from "@/lib/whatsapp/sender";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// ============================================================
// PAYMENT / SUBSCRIPTION MESSAGE
// ============================================================

const SUBSCRIPTION_PAYMENT_MESSAGE = [
  "Hello! 👋",
  "",
  "To receive *Gold (XAU/USD)* and *Cryptocurrency* market signals, please subscribe first.",
  "",
  "💳 *PLEASE COMPLETE PAYMENT*",
  "",
  "1. BCA – 7390748013 : Yusup Juniadi",
  "2. BRI – 205801004408532 : Yusup Juniadi",
  "3. SeaBank – 901356079886 : Yusup Juniadi",
  "4. E-Wallet: DANA/ShopeePay : 081289066999",
  "",
  "📸 After payment, send the *payment proof* to admin.",
  "📞 Payment confirmation:",
  "https://wa.me/6285975149508",
  "",
  "After payment is confirmed, your account will be activated and you will receive a private Telegram channel invite.",
].join("\n");

// ============================================================
// TYPES
// ============================================================

type WhatsAppMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;

  text?: {
    body?: string;
  };

  interactive?: {
    type?: string;

    button_reply?: {
      id?: string;
      title?: string;
    };

    list_reply?: {
      id?: string;
      title?: string;
      description?: string;
    };
  };

  button?: {
    text?: string;
    payload?: string;
  };
};

type WhatsAppStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  conversation?: unknown;
  pricing?: unknown;
  errors?: unknown[];
};

type NormalizedIncomingMessage = {
  phone: string;
  messageId: string | null;
  timestamp: string | null;
  type: string | null;

  text: string | null;

  buttonId: string | null;
  buttonTitle: string | null;

  listId: string | null;
  listTitle: string | null;
  listDescription: string | null;
};

type NormalizedStatus = {
  messageId: string | null;
  status: string | null;
  timestamp: string | null;
  recipientId: string | null;
  errors: unknown[];
};

// ============================================================
// META WEBHOOK VERIFICATION
// ============================================================

export async function GET(req: NextRequest) {
  console.log(
    "========== WHATSAPP WEBHOOK VERIFY =========="
  );

  const mode =
    req.nextUrl.searchParams.get("hub.mode");

  const token =
    req.nextUrl.searchParams.get(
      "hub.verify_token"
    );

  const challenge =
    req.nextUrl.searchParams.get(
      "hub.challenge"
    );

  console.log("WEBHOOK VERIFY:", {
    mode,
    tokenReceived: !!token,
    challengeReceived: !!challenge,
    verifyTokenConfigured: !!VERIFY_TOKEN,
  });

  if (!VERIFY_TOKEN) {
    console.error(
      "❌ VERIFY_TOKEN is not configured"
    );

    return new Response(
      "Server configuration error",
      {
        status: 500,
      }
    );
  }

  if (
    mode === "subscribe" &&
    token === VERIFY_TOKEN
  ) {
    console.log(
      "✅ WEBHOOK VERIFY SUCCESS"
    );

    return new Response(
      challenge ?? "",
      {
        status: 200,
        headers: {
          "Content-Type":
            "text/plain",
        },
      }
    );
  }

  console.error(
    "❌ WEBHOOK VERIFY FAILED"
  );

  return new Response(
    "Forbidden",
    {
      status: 403,
    }
  );
}

// ============================================================
// WHATSAPP WEBHOOK
// ============================================================

export async function POST(req: NextRequest) {
  console.log(
    "🔥🔥🔥 WEBHOOK POST HIT 🔥🔥🔥"
  );

  console.log(
    "WEBHOOK URL:",
    req.url
  );

  try {
    const body = await req.json();

    console.log(
      "🔥 META BODY:",
      JSON.stringify(
        body,
        null,
        2
      )
    );

    // ========================================================
    // VALIDATE OBJECT
    // ========================================================

    if (
      body?.object !==
      "whatsapp_business_account"
    ) {
      console.warn(
        "⚠️ Unknown webhook object:",
        body?.object
      );

      return Response.json(
        {
          ok: true,
          ignored: true,
          reason:
            "Unknown webhook object",
        },
        {
          status: 200,
        }
      );
    }

    // ========================================================
    // ENTRIES
    // ========================================================

    const entries =
      Array.isArray(body?.entry)
        ? body.entry
        : [];

    if (
      entries.length === 0
    ) {
      console.warn(
        "⚠️ Webhook contains no entries"
      );

      return Response.json(
        {
          ok: true,
          ignored: true,
          reason:
            "No entries",
        },
        {
          status: 200,
        }
      );
    }

    console.log(
      "📥 WEBHOOK ENTRIES:",
      entries.length
    );

    // ========================================================
    // PROCESS ENTRIES
    // ========================================================

    for (
      const entry of entries
    ) {
      const changes =
        Array.isArray(
          entry?.changes
        )
          ? entry.changes
          : [];

      console.log(
        "📥 WEBHOOK CHANGES:",
        changes.length
      );

      for (
        const change of changes
      ) {
        const value =
          change?.value;

        if (!value) {
          console.warn(
            "⚠️ Webhook change has no value"
          );

          continue;
        }

        console.log(
          "📦 WEBHOOK VALUE RECEIVED"
        );

        // ====================================================
        // CONTACT NAME
        // ====================================================

        const contact =
          Array.isArray(
            value.contacts
          )
            ? value.contacts[0]
            : null;

        const contactName =
          contact?.profile?.name ||
          "";

        console.log(
          "👤 CONTACT NAME:",
          contactName
        );

        // ====================================================
        // INCOMING MESSAGES
        // ====================================================

        if (
          Array.isArray(
            value.messages
          )
        ) {
          console.log(
            "📩 INCOMING MESSAGE COUNT:",
            value.messages.length
          );

          for (
            const message of
            value.messages as WhatsAppMessage[]
          ) {
            const normalized =
              normalizeIncomingMessage(
                message
              );

            console.log(
              "📩 NORMALIZED MESSAGE:",
              JSON.stringify(
                normalized,
                null,
                2
              )
            );

            // ==================================================
            // TEXT COMMAND
            // ==================================================

            if (
              normalized.phone &&
              normalized.text
            ) {
              console.log(
                "🚀 PROCESSING COMMAND:",
                normalized.text
              );

              try {
                const result =
                  await handleSubscriptionCommand(
                    normalized.phone,
                    normalized.text,
                    contactName
                  );

                console.log(
                  "✅ COMMAND COMPLETED:",
                  JSON.stringify(
                    result,
                    null,
                    2
                  )
                );
              } catch (error) {
                console.error(
                  "❌ SUBSCRIPTION COMMAND ERROR:",
                  error
                );

                try {
                  await sendText(
                    normalized.phone,
                    [
                      "❌ Sorry, something went wrong.",
                      "",
                      "Please try again in a moment.",
                    ].join("\n")
                  );

                  console.log(
                    "✅ ERROR MESSAGE SENT"
                  );
                } catch (
                replyError
                ) {
                  console.error(
                    "❌ ERROR SENDING ERROR MESSAGE:",
                    replyError
                  );
                }
              }
            } else {
              console.warn(
                "⚠️ Message has no usable phone/text"
              );
            }
          }
        } else {
          console.log(
            "ℹ️ NO INCOMING MESSAGES"
          );
        }

        // ====================================================
        // MESSAGE STATUS
        // ====================================================

        if (
          Array.isArray(
            value.statuses
          )
        ) {
          console.log(
            "📊 STATUS COUNT:",
            value.statuses.length
          );

          for (
            const status of
            value.statuses as WhatsAppStatus[]
          ) {
            const normalized =
              normalizeStatus(
                status
              );

            console.log(
              "📊 WHATSAPP MESSAGE STATUS:",
              JSON.stringify(
                normalized,
                null,
                2
              )
            );
          }
        }

        // ====================================================
        // CONTACTS
        // ====================================================

        if (
          Array.isArray(
            value.contacts
          )
        ) {
          console.log(
            "👤 WHATSAPP CONTACTS:",
            JSON.stringify(
              value.contacts,
              null,
              2
            )
          );
        }

        // ====================================================
        // METADATA
        // ====================================================

        if (value.metadata) {
          console.log(
            "📱 WHATSAPP METADATA:",
            JSON.stringify(
              value.metadata,
              null,
              2
            )
          );
        }
      }
    }

    // ========================================================
    // ALWAYS ACKNOWLEDGE META
    // ========================================================

    console.log(
      "✅ WHATSAPP WEBHOOK PROCESSED SUCCESSFULLY"
    );

    return Response.json(
      {
        ok: true,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "========== WHATSAPP WEBHOOK ERROR =========="
    );

    console.error(error);

    return Response.json(
      {
        ok: false,
        error:
          "Invalid webhook payload",
      },
      {
        status: 400,
      }
    );
  }
}

// ============================================================
// HANDLE SUBSCRIPTION COMMAND
// ============================================================

async function handleSubscriptionCommand(
  phone: string,
  command: string,
  name = ""
) {
  const action = normalizeAction(command);

  console.log("📌 SUBSCRIPTION COMMAND:", { phone, name, action });

  let subscriptionStatus;

  try {
    subscriptionStatus = await getSubscriptionStatus(phone);
    console.log(
      "📊 CURRENT SUBSCRIPTION STATUS:",
      JSON.stringify(subscriptionStatus, null, 2)
    );
  } catch (error) {
    console.error("❌ FAILED TO CHECK SUBSCRIPTION:", error);
    throw error;
  }

  const displayName =
    subscriptionStatus.subscriber?.name || name || "Customer";

  // ==========================================================
  // INVALID / UNKNOWN COMMAND
  // ==========================================================
  if (!isValidAction(action)) {
    if (subscriptionStatus.action === "NOT_SUBSCRIBED") {
      return sendText(phone, SUBSCRIPTION_PAYMENT_MESSAGE);
    }

    if (subscriptionStatus.action === "EXPIRED") {
      return sendText(
        phone,
        [
          "⚠️ Your subscription has expired.",
          "",
          "Send *RENEW* to extend your subscription.",
        ].join("\n")
      );
    }

    return sendText(
      phone,
      [
        "❌ Unknown command.",
        "",
        "Available commands:",
        "• STATUS",
        "• RENEW",
        "• SUBSCRIBE",
      ].join("\n")
    );
  }

  // ==========================================================
  // SUBSCRIBE
  // ==========================================================
  if (action === "SUBSCRIBE") {
    // Already active
    if (subscriptionStatus.action === "ACTIVE") {
      return sendAlreadyActiveText({
        phone,
        name: displayName,
        expiredAt: subscriptionStatus.subscription?.expiredAt || "",
      });
    }

    // Expired → ask to renew
    if (subscriptionStatus.action === "EXPIRED") {
      return sendText(
        phone,
        [
          "⚠️ Your subscription has expired.",
          "",
          "Please send *RENEW* to extend your subscription.",
        ].join("\n")
      );
    }

    // New user → payment instructions (activation is manual after payment)
    return sendText(phone, SUBSCRIPTION_PAYMENT_MESSAGE);
  }

  // ==========================================================
  // STATUS
  // ==========================================================
  if (action === "STATUS") {
    if (subscriptionStatus.action === "NOT_SUBSCRIBED") {
      return sendStatusText({
        phone,
        name: displayName,
        status: "NOT_SUBSCRIBED",
      });
    }

    if (subscriptionStatus.action === "EXPIRED") {
      return sendStatusText({
        phone,
        name: displayName,
        status: "EXPIRED",
      });
    }

    // ACTIVE
    return sendStatusText({
      phone,
      name: displayName,
      status: "ACTIVE",
      expiredAt: subscriptionStatus.subscription?.expiredAt,
    });
  }

  // ==========================================================
  // RENEW
  // ==========================================================
  if (action === "RENEW") {
    if (subscriptionStatus.action === "NOT_SUBSCRIBED") {
      return sendText(phone, SUBSCRIPTION_PAYMENT_MESSAGE);
    }

    const result = await renew(phone);

    console.log("RENEW RESULT:", JSON.stringify(result, null, 2));

    if (
      result.action === "SUBSCRIBER_NOT_FOUND" ||
      result.action === "SUBSCRIPTION_NOT_FOUND"
    ) {
      return sendText(phone, SUBSCRIPTION_PAYMENT_MESSAGE);
    }

    if (result.action === "RENEWED" && result.subscription) {
      // Text only (no template)
      return sendRenewedText({
        phone,
        name: result.subscriber?.name || displayName,
        expiredAt: result.subscription.expiredAt,
      });
    }

    return sendText(
      phone,
      [
        "❌ Failed to renew subscription.",
        "",
        "Please try again later.",
      ].join("\n")
    );
  }

  // ==========================================================
  // FALLBACK
  // ==========================================================
  return sendText(phone, SUBSCRIPTION_PAYMENT_MESSAGE);
}

// ============================================================
// NORMALIZE INCOMING MESSAGE
// ============================================================

function normalizeIncomingMessage(
  message: WhatsAppMessage
): NormalizedIncomingMessage {
  const text =
    message.type === "text"
      ? message.text?.body?.trim() ||
      null
      : null;

  const buttonId =
    message.type ===
      "interactive"
      ? message.interactive
        ?.button_reply
        ?.id || null
      : null;

  const buttonTitle =
    message.type ===
      "interactive"
      ? message.interactive
        ?.button_reply
        ?.title || null
      : null;

  const listId =
    message.type ===
      "interactive"
      ? message.interactive
        ?.list_reply
        ?.id || null
      : null;

  const listTitle =
    message.type ===
      "interactive"
      ? message.interactive
        ?.list_reply
        ?.title || null
      : null;

  const listDescription =
    message.type ===
      "interactive"
      ? message.interactive
        ?.list_reply
        ?.description || null
      : null;

  return {
    phone:
      normalizePhone(
        message.from
      ),

    messageId:
      message.id || null,

    timestamp:
      message.timestamp ||
      null,

    type:
      message.type || null,

    text,

    buttonId,
    buttonTitle,

    listId,
    listTitle,
    listDescription,
  };
}

// ============================================================
// NORMALIZE STATUS
// ============================================================

function normalizeStatus(
  status: WhatsAppStatus
): NormalizedStatus {
  return {
    messageId:
      status.id || null,

    status:
      status.status || null,

    timestamp:
      status.timestamp || null,

    recipientId:
      normalizePhone(
        status.recipient_id
      ),

    errors:
      Array.isArray(
        status.errors
      )
        ? status.errors
        : [],
  };
}

// ============================================================
// NORMALIZE PHONE
// ============================================================

function normalizePhone(
  phone?: string
): string {
  if (!phone) {
    return "";
  }

  return phone.replace(
    /\D/g,
    ""
  );
}

// ============================================================
// FORMAT DATE
// ============================================================

function formatDate(
  value?: string
): string {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleString(
    "en-GB",
    {
      timeZone:
        "Asia/Jakarta",

      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}