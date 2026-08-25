// lib/telegram/invite.ts

export type GenerateInviteOptions = {
  memberLimit?: number;
  expireHours?: number;
  name?: string;
};

export type InviteLinkResult = {
  inviteLink: string;
  name: string | null;
  expireDate: number | null;
  memberLimit: number | null;
  expireAtIso: string | null;
};

/**
 * Buat 1 invite link unik untuk 1 user.
 * Default: member_limit = 1, expire = 48 jam.
 */
export async function generateInviteLink(
  options?: GenerateInviteOptions
): Promise<InviteLinkResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHANNEL_ID?.trim();

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN belum diset.");
  }

  if (!chatId) {
    throw new Error("TELEGRAM_CHANNEL_ID belum diset.");
  }

  const memberLimit = options?.memberLimit ?? 1;
  const expireHours = options?.expireHours ?? 48;
  const name =
    options?.name?.trim() ||
    `Invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
      creates_join_request: false,
    }),
    cache: "no-store",
  });

  const data = await res.json();

  if (!data.ok) {
    console.error("[Telegram] createChatInviteLink failed:", data);
    throw new Error(
      data.description || "Failed to create Telegram invite link"
    );
  }

  const result = data.result;

  return {
    inviteLink: String(result.invite_link),
    name: result.name ?? name,
    expireDate: result.expire_date ?? expireDate,
    memberLimit: result.member_limit ?? memberLimit,
    expireAtIso: result.expire_date
      ? new Date(result.expire_date * 1000).toISOString()
      : new Date(expireDate * 1000).toISOString(),
  };
}