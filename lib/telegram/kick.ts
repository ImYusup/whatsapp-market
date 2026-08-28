// lib/telegram/kick.ts

export async function kickTelegramUser(telegramUserId: string | number) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHANNEL_ID?.trim();

  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID is missing");
  }

  const url = `https://api.telegram.org/bot${token}/banChatMember`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      user_id: Number(telegramUserId),
      revoke_messages: false,
    }),
    cache: "no-store",
  });

  const data = await res.json();

  if (!data.ok) {
    console.error("[Telegram] banChatMember failed:", data);
    throw new Error(data.description || "Failed to kick user");
  }

  // Optional: langsung unban supaya user bisa join lagi kalau renew
  await fetch(`https://api.telegram.org/bot${token}/unbanChatMember`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      user_id: Number(telegramUserId),
      only_if_banned: true,
    }),
    cache: "no-store",
  });

  return data;
}