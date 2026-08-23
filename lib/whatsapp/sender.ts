//src/lib/whatsapp/sender.ts

import {
  sendWhatsAppTemplate,
  sendWhatsAppText,
} from "./client";

import {
  WHATSAPP_LANGUAGE,
  WHATSAPP_TEMPLATES,
} from "./templates";

import {
  SignalResult,
} from "@/lib/market/signal";

// ============================================================
// TYPES
// ============================================================

export type SubscriptionMessage = {
  phone: string;
  name: string;
  expiredAt: string;
};

// ============================================================
// SIGNAL STATUS
// ============================================================

function getConfidenceStatus(
  confidence: number
): string {

  if (confidence < 50) {
    return "👀 WAIT & SEE";
  }

  if (confidence < 70) {
    return "⚠️ CAUTIOUS";
  }

  return "✅ CONFIRMED";
}

// ============================================================
// MARKET ICON
// ============================================================

function getMarketIcon(
  market: string
): string {

  switch (market) {
    case "XAU/USD":
      return "🟡";

    case "BTC/USD":
      return "🟠";

    default:
      return "📊";
  }
}

// ============================================================
// PRICE FORMAT
// ============================================================

function formatNumber(
  value: string | null
): string {

  if (!value) {
    return "-";
  }

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return value;
  }

  return number.toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );
}

// ============================================================
// SIGNAL FORMAT
// ============================================================

export function formatMarketSignal(
  signal: SignalResult
): string {

  const icon =
    getMarketIcon(
      signal.market
    );

  const status =
    getConfidenceStatus(
      signal.confidence
    );

  const resistanceLines =
    signal.resistances
      .slice(0, 3)
      .map(
        (level, index) =>
          `R${index + 1} ${formatNumber(level)}`
      );

  const supportLines =
    signal.supports
      .slice(0, 3)
      .map(
        (level, index) =>
          `S${index + 1} ${formatNumber(level)}`
      );

  return [
    `${icon} ${signal.market}`,
    "",

    `15M  ${signal.analysis["15M"].direction}`,
    `30M  ${signal.analysis["30M"].direction}`,
    `1H   ${signal.analysis["1H"].direction}`,

    "",

    "OVERALL",
    `${getOverallIcon(signal.overall)} ${signal.overall}`,

    "",

    "PRICE",
    formatNumber(signal.price),

    "",

    "RESISTANCE",
    ...(resistanceLines.length > 0
      ? resistanceLines
      : ["-"]),

    "",

    "SUPPORT",
    ...(supportLines.length > 0
      ? supportLines
      : ["-"]),

    "",

    "CONFIDENCE",
    `${signal.confidence}%`,

    "",

    "STATUS",
    status,
  ].join("\n");
}

// ============================================================
// OVERALL ICON
// ============================================================

function getOverallIcon(
  direction: SignalResult["overall"]
): string {

  switch (direction) {
    case "STRONG BUY":
      return "🔥";

    case "BUY":
      return "🟢";

    case "STRONG SELL":
      return "🔥";

    case "SELL":
      return "🔴";

    default:
      return "⏸️";
  }
}

// ============================================================
// MARKET SIGNAL - TEXT
// ============================================================

export async function sendMarketSignal(
  phone: string,
  signal: SignalResult
) {

  const message =
    formatMarketSignal(
      signal
    );

  return sendWhatsAppText({
    to: phone,
    text: message,
  });
}

// ============================================================
// MARKET SIGNAL - TEMPLATE
// ============================================================

export async function sendMarketSignalTemplate(
  phone: string,
  signal: SignalResult
) {

  return sendWhatsAppTemplate({
    to: phone,

    templateName:
      WHATSAPP_TEMPLATES.SIGNAL,

    languageCode:
      WHATSAPP_LANGUAGE,

    parameters: [
      signal.market,

      signal.analysis["15M"].direction,

      signal.analysis["30M"].direction,

      signal.analysis["1H"].direction,

      signal.overall,

      formatNumber(signal.price),

      signal.resistances[0]
        ? formatNumber(signal.resistances[0])
        : "-",

      signal.resistances[1]
        ? formatNumber(signal.resistances[1])
        : "-",

      signal.resistances[2]
        ? formatNumber(signal.resistances[2])
        : "-",

      signal.supports[0]
        ? formatNumber(signal.supports[0])
        : "-",

      signal.supports[1]
        ? formatNumber(signal.supports[1])
        : "-",

      signal.supports[2]
        ? formatNumber(signal.supports[2])
        : "-",

      `${signal.confidence}%`,

      getConfidenceStatus(
        signal.confidence
      ),
    ],
  });
}

// ============================================================
// SUBSCRIPTION WELCOME
// ============================================================

export async function sendSubscriptionWelcome(
  data: SubscriptionMessage
) {
  return sendWhatsAppTemplate({
    to: data.phone,

    templateName:
      WHATSAPP_TEMPLATES
        .SUBSCRIPTION_WELCOME,

    languageCode:
      WHATSAPP_LANGUAGE,

    parameters: [
      data.name,
      data.expiredAt,
    ],
  });
}

// ============================================================
// SUBSCRIPTION RENEWED
// ============================================================

export async function sendSubscriptionRenewed(
  data: SubscriptionMessage
) {
  return sendWhatsAppTemplate({
    to: data.phone,

    templateName:
      WHATSAPP_TEMPLATES
        .SUBSCRIPTION_RENEWED,

    languageCode:
      WHATSAPP_LANGUAGE,

    parameters: [
      data.name,
      data.expiredAt,
    ],
  });
}

// ============================================================
// SUBSCRIPTION EXPIRING
// ============================================================

export async function sendSubscriptionExpiring(
  data: SubscriptionMessage
) {
  return sendWhatsAppTemplate({
    to: data.phone,

    templateName:
      WHATSAPP_TEMPLATES
        .SUBSCRIPTION_EXPIRING,

    languageCode:
      WHATSAPP_LANGUAGE,

    parameters: [
      data.name,
      data.expiredAt,
    ],
  });
}

// ============================================================
// SIMPLE TEXT
// ============================================================

export async function sendText(
  phone: string,
  message: string
) {
  return sendWhatsAppText({
    to: phone,
    text: message,
  });
}

// ============================================================
// SUBSCRIPTION — TEXT (no template)
// ============================================================

export type InviteMessage = {
  phone: string;
  name: string;
  inviteLink: string;
};

function formatDateEN(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/** New subscribe — temporary text (switch to template after Meta approves) */
export async function sendSubscriptionActivatedInvite(data: InviteMessage) {
  // After Meta approves, switch to template:
  // return sendWhatsAppTemplate({
  //   to: data.phone,
  //   templateName: WHATSAPP_TEMPLATES.SUBSCRIPTION_ACTIVATED_INVITE,
  //   languageCode: WHATSAPP_LANGUAGE,
  //   parameters: [data.name || "Customer", data.inviteLink],
  // });

  const text = `
Hello ${data.name || "Customer"},

Your Market Signal subscription is now active ✅

Please join the private Telegram channel using this invitation link (single-use, valid for 48 hours):

${data.inviteLink}

After joining, you will receive market signal updates.

💻 At WebBotPro, we provide digital solutions to help your business grow.
🌐 webbotpro.com
📲 WhatsApp: wa.me/628597519508
`.trim();

  return sendWhatsAppText({ to: data.phone, text });
}

/** Already active */
export async function sendAlreadyActiveText(data: SubscriptionMessage) {
  const expired = formatDateEN(data.expiredAt);

  const text = `
Hello ${data.name || "Customer"},

Your subscription is still active until *${expired}*.

You do not need to subscribe again.

💻 At WebBotPro, we provide digital solutions to help your business grow.
🌐 webbotpro.com
📲 WhatsApp: wa.me/628597519508
`.trim();

  return sendWhatsAppText({ to: data.phone, text });
}

/** Renew success */
export async function sendRenewedText(data: SubscriptionMessage) {
  const expired = formatDateEN(data.expiredAt);

  const text = `
Hello ${data.name || "Customer"},

Renewal successful ✅
Your subscription is now active until *${expired}*.

💻 At WebBotPro, we provide digital solutions to help your business grow.
🌐 webbotpro.com
📲 WhatsApp: wa.me/628597519508
`.trim();

  return sendWhatsAppText({ to: data.phone, text });
}

/** Status / not found / expired */
export async function sendStatusText(data: {
  phone: string;
  name: string;
  status: "ACTIVE" | "EXPIRED" | "NOT_SUBSCRIBED";
  expiredAt?: string | null;
}) {
  let text = "";

  if (data.status === "NOT_SUBSCRIBED") {
    text = `
Hello ${data.name || "Customer"},

You are not registered yet.
Type *SUBSCRIBE* to start your Market Signal subscription.

💻 At WebBotPro, we provide digital solutions to help your business grow.
🌐 webbotpro.com
📲 WhatsApp: wa.me/628597519508
`.trim();
  } else if (data.status === "EXPIRED") {
    text = `
Hello ${data.name || "Customer"},

Your subscription has *EXPIRED*.
Type *RENEW* to extend it.

💻 At WebBotPro, we provide digital solutions to help your business grow.
🌐 webbotpro.com
📲 WhatsApp: wa.me/628597519508
`.trim();
  } else {
    const expired = formatDateEN(data.expiredAt || "");
    text = `
Hello ${data.name || "Customer"},

Status: *ACTIVE*
Valid until: *${expired}*

💻 At WebBotPro, we provide digital solutions to help your business grow.
🌐 webbotpro.com
📲 WhatsApp: wa.me/628597519508
`.trim();
  }

  return sendWhatsAppText({ to: data.phone, text });
}