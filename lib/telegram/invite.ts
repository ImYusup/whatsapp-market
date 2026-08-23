// lib/telegram/invite.ts

export async function generateInviteLink(options?: {
  memberLimit?: number;
  expireHours?: number;
  name?: string;
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;

  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID is missing");
  }

  const memberLimit = options?.memberLimit ?? 1; // single-use
  const expireHours = options?.expireHours ?? 24; // berlaku 24 jam
  const name = options?.name ?? `Invite-${Date.now()}`;

  const expireDate = Math.floor(Date.now() / 1000) + expireHours * 3600;

  const url = `https://api.telegram.org/bot${token}/createChatInviteLink`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      name,
      member_limit: memberLimit,
      expire_date: expireDate,
      creates_join_request: false, // langsung join, tidak perlu approve
    }),
  });

  const data = await res.json();

  if (!data.ok) {
    console.error("Telegram createChatInviteLink error:", data);
    throw new Error(data.description || "Failed to create invite link");
  }

  return {
    inviteLink: data.result.invite_link as string,
    name: data.result.name,
    expireDate: data.result.expire_date,
    memberLimit: data.result.member_limit,
  };
}