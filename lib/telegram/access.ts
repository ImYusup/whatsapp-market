// lib/telegram/access.ts

/** Map telegram user → ACTIVE subscription. Implement via Sheet. */
export async function isActiveTelegramUser(_telegramUserId: number) {
  // TODO: read Sheet column telegram_user_id + subscription ACTIVE
  // Sementara true supaya command signal bisa dites:
  return true;
}