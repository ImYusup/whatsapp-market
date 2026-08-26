// lib/telegram/bot.ts

const TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API = `https://api.telegram.org/bot${TOKEN}`;

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  extra?: Record<string, unknown>
) {
  const res = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...extra,
    }),
    cache: "no-store",
  });

  const data = await res.json();
  if (!data.ok) {
    console.error("[TG] sendMessage failed:", data);
  }
  return data;
}