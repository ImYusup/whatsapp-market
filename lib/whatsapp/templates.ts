export const WHATSAPP_TEMPLATES = {
  SIGNAL: "market_signal",

  SUBSCRIPTION_WELCOME:
    "subscription_welcome",

  SUBSCRIPTION_RENEWED:
    "subscription_renewed",

  SUBSCRIPTION_EXPIRING:
    "subscription_expiring",
} as const;

export type WhatsAppTemplate =
  (typeof WHATSAPP_TEMPLATES)[keyof typeof WHATSAPP_TEMPLATES];

export const WHATSAPP_LANGUAGE =
  "en_US";