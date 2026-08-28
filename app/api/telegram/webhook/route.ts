// app/api/telegram/webhook/route.ts

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { sendTelegramMessage } from "@/lib/telegram/bot";
import { MSG } from "@/lib/telegram/commands-text";
import { formatSignalTelegram, formatTfSummary } from "@/lib/telegram/format";
import { getLastSignal, getAllLastSignals } from "@/lib/telegram/signals-store";
import { isActiveTelegramUser } from "@/lib/telegram/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ============================================================
// SHEET: save telegram_user_id saat user join channel
// ============================================================

async function saveTelegramUserId(
  subscriberId: string,
  telegramUserId: string,
  inviteLinkName: string
) {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!email || !key || !sheetId) {
    console.error("[TG] Google Sheets env missing");
    return;
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Subscribers!A:H",
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return;

  for (let i = 1; i < rows.length; i++) {
    const rowSubscriberId = rows[i][0] || "";

    if (rowSubscriberId === subscriberId) {
      const rowNumber = i + 1;

      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `Subscribers!F${rowNumber}:H${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            [
              telegramUserId,           // F: telegram_user_id
              inviteLinkName,           // G: invite_link_name
              new Date().toISOString(), // H: joined_at
            ],
          ],
        },
      });

      console.log("✅ telegram_user_id saved:", {
        subscriberId,
        telegramUserId,
        rowNumber,
      });
      return;
    }
  }

  console.warn("[TG] subscriberId not found in sheet:", subscriberId);
}

// ============================================================
// COMMAND HELPERS
// ============================================================

function parseCommand(text: string): { cmd: string; args: string } {
  const raw = (text || "").trim();
  const withoutSlash = raw.startsWith("/") ? raw.slice(1) : raw;
  const [head, ...rest] = withoutSlash.split(/\s+/);
  const cmd = (head || "").split("@")[0].toLowerCase();
  return { cmd, args: rest.join(" ") };
}

async function requireActive(chatId: number, userId: number) {
  const ok = await isActiveTelegramUser(userId);
  if (!ok) {
    await sendTelegramMessage(chatId, MSG.needSub);
    return false;
  }
  return true;
}

async function sendMarket(chatId: number, market: string) {
  const signal = await getLastSignal(market);
  if (!signal) {
    await sendTelegramMessage(chatId, MSG.noSignal);
    return;
  }
  await sendTelegramMessage(chatId, formatSignalTelegram(signal));
}

// ============================================================
// POST webhook
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    // ========================================================
    // 1) CHANNEL JOIN EVENT (chat_member)
    // ========================================================
    const chatMember = update.chat_member;

    if (chatMember) {
      const newMember = chatMember.new_chat_member;
      const oldMember = chatMember.old_chat_member;

      const newStatus = newMember?.status;
      const oldStatus = oldMember?.status;
      const userId = newMember?.user?.id;
      const inviteName = chatMember.invite_link?.name || "";

      console.log("[TG] chat_member update:", {
        userId,
        oldStatus,
        newStatus,
        inviteName,
      });

      // User baru join
      if (
        userId &&
        (newStatus === "member" || newStatus === "administrator") &&
        oldStatus !== "member" &&
        oldStatus !== "administrator"
      ) {
        // Format invite name dari subscription API: SUB-{subscriberId}
        if (inviteName.startsWith("SUB-")) {
          const subscriberId = inviteName.replace(/^SUB-/, "");
          await saveTelegramUserId(
            subscriberId,
            String(userId),
            inviteName
          );
        } else {
          console.warn(
            "[TG] join without matching invite name:",
            inviteName
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    // ========================================================
    // 2) PRIVATE MESSAGE / COMMANDS
    // ========================================================
    const message = update.message || update.edited_message;

    if (!message?.chat?.id || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const userId = message.from?.id as number;
    const { cmd } = parseCommand(message.text);

    console.log("[TG]", { chatId, userId, cmd });

    switch (cmd) {
      case "start":
        await sendTelegramMessage(chatId, MSG.start);
        break;

      case "help":
        await sendTelegramMessage(chatId, MSG.help);
        break;

      case "profile":
        await sendTelegramMessage(chatId, MSG.profile);
        break;

      case "subscribe":
        await sendTelegramMessage(chatId, MSG.subscribe);
        break;

      case "status": {
        const active = await isActiveTelegramUser(userId);
        await sendTelegramMessage(
          chatId,
          active
            ? "✅ Status: <b>ACTIVE</b>\nUse /signal for latest data."
            : "❌ Status: <b>NOT ACTIVE</b>\nUse /subscribe."
        );
        break;
      }

      case "signal": {
        if (!(await requireActive(chatId, userId))) break;
        const all = await getAllLastSignals();
        if (!all.length) {
          await sendTelegramMessage(chatId, MSG.noSignal);
          break;
        }
        for (const sig of all) {
          await sendTelegramMessage(chatId, formatSignalTelegram(sig));
        }
        break;
      }

      case "gold":
      case "xauusd":
        if (!(await requireActive(chatId, userId))) break;
        await sendMarket(chatId, "XAU/USD");
        break;

      case "btc":
        if (!(await requireActive(chatId, userId))) break;
        await sendMarket(chatId, "BTC/USD");
        break;

      case "eth":
        if (!(await requireActive(chatId, userId))) break;
        await sendMarket(chatId, "ETH/USD");
        break;

      case "bnb":
        if (!(await requireActive(chatId, userId))) break;
        await sendMarket(chatId, "BNB/USD");
        break;

      case "sol":
        if (!(await requireActive(chatId, userId))) break;
        await sendMarket(chatId, "SOL/USD");
        break;

      case "tf15":
      case "tf30":
      case "tf1h": {
        if (!(await requireActive(chatId, userId))) break;
        const tf =
          cmd === "tf15" ? "15M" : cmd === "tf30" ? "30M" : "1H";
        const all = await getAllLastSignals();
        if (!all.length) {
          await sendTelegramMessage(chatId, MSG.noSignal);
          break;
        }
        await sendTelegramMessage(chatId, formatTfSummary(all, tf));
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[TG] webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "telegram-webhook" });
}