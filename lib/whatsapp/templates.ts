// lib/whatsapp/templates.ts
export const WHATSAPP_TEMPLATES = {
  SIGNAL: "market_signal",

  SUBSCRIPTION_WELCOME: "subscription_welcome",

  SUBSCRIPTION_RENEWED: "subscription_renewed",

  SUBSCRIPTION_EXPIRING: "subscription_expiring",

  // GANTI string di bawah supaya PERSIS sama nama di Meta Business
  SUBSCRIPTION_ACTIVATED_INVITE: "subscription_activated_invite",
} as const;

export type WhatsAppTemplate =
  (typeof WHATSAPP_TEMPLATES)[keyof typeof WHATSAPP_TEMPLATES];

// Harus sama dengan language template di Meta (en / en_US / id)
export const WHATSAPP_LANGUAGE = "en_US";