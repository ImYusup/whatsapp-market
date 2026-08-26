// lib/telegram/commands-text.ts

export const MSG = {
  start: [
    "👋 <b>Welcome to MarketSignal by WebBotPro</b>",
    "",
    "Gold & Crypto signals:",
    "XAU/USD · BTC · ETH · BNB · SOL",
    "Timeframes: 15M · 30M · 1H",
    "",
    "Commands: /help",
    "Subscribe: /subscribe",
    "Status: /status",
    "",
    "🌐 webbotpro.com",
  ].join("\n"),

  help: [
    "<b>Available commands</b>",
    "",
    "/start – Start bot",
    "/help – This list",
    "/profile – Website",
    "/subscribe – Payment info",
    "/status – Subscription status",
    "",
    "/signal – All latest signals",
    "/gold or /xauusd – XAU/USD",
    "/btc /eth /bnb /sol",
    "/tf15 /tf30 /tf1h – By timeframe",
  ].join("\n"),

  profile: "🌐 Visit our website:\nhttps://webbotpro.com",

  subscribe: [
    "Hello! 👋",
    "",
    "To receive <b>Gold (XAU/USD)</b> and <b>Cryptocurrency</b> market signals, please subscribe first.",
    "",
    "💰 <b>Subscription: Rp 100.000/month</b>",
    "",
    "💳 <b>Payment</b>",
    "1. BCA – 7390748013 : Yusup Juniadi",
    "2. BRI – 205801004408532 : Yusup Juniadi",
    "3. SeaBank – 901356079886 : Yusup Juniadi",
    "4. E-Wallet DANA/ShopeePay : 081289066999",
    "5. Crypto – message admin for network details",
    "",
    "📸 Send payment proof to admin:",
    "https://wa.me/6285975149508",
    "",
    "After confirmation you get a private Telegram invite.",
    "",
    "💻 WebBotPro · webbotpro.com",
  ].join("\n"),

  needSub: [
    "🔒 This command requires an <b>active subscription</b>.",
    "",
    "Use /subscribe for payment info.",
    "After activation, use /status to check.",
  ].join("\n"),

  noSignal: "⏳ No signal data yet. Please try again later.",
};