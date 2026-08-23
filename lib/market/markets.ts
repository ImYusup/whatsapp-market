// src/lib/market/markets.ts

// ============================================================
// SUPPORTED MARKETS
// ============================================================
// Semua market yang bisa diproses oleh market engine.
// Jangan dihapus meskipun belum dikirim ke subscriber.
// ============================================================

export const MARKETS = [
  "XAU/USD",
  "XAG/USD",
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "BNB/USD",
] as const;

// ============================================================
// NOTIFICATION MARKETS
// ============================================================
// Market yang saat ini dikirim ke subscriber via WhatsApp.
//
// MVP:
// - XAU/USD
// - BTC/USD
//
// Market lain tetap tersedia untuk future expansion.
// ============================================================

export const NOTIFICATION_MARKETS = [
  "XAU/USD",
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "BNB/USD",
] as const;

// ============================================================
// MARKET PROVIDER
// ============================================================

export const MARKET_PROVIDER = {
  "XAU/USD": "gold",
  "XAG/USD": "twelveData",
  "BTC/USD": "twelveData",
  "ETH/USD": "twelveData",
  "SOL/USD": "twelveData",
  "BNB/USD": "twelveData",
} as const;

// ============================================================
// TYPES
// ============================================================

export type Market =
  (typeof MARKETS)[number];

export type NotificationMarket =
  (typeof NOTIFICATION_MARKETS)[number];

// ============================================================
// MARKET VALIDATION
// ============================================================

export function isMarket(
  value: string
): value is Market {
  return MARKETS.includes(
    value as Market
  );
}

// ============================================================
// NOTIFICATION MARKET VALIDATION
// ============================================================

export function isNotificationMarket(
  value: string
): value is NotificationMarket {
  return NOTIFICATION_MARKETS.includes(
    value as NotificationMarket
  );
}