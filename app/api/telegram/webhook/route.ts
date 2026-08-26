// app/api/telegram/webhook/route.ts

import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram/bot";
import { MSG } from "@/lib/telegram/commands-text";
import { formatSignalTelegram, formatTfSummary } from "@/lib/telegram/format";
import { getLastSignal, getAllLastSignals } from "@/lib/telegram/signals-store";
import { isActiveTelegramUser } from "@/lib/telegram/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseCommand(text: string): { cmd: string; args: string } {
  const raw = (text || "").trim();
  const withoutSlash = raw.startsWith("/") ? raw.slice(1) : raw;
  // /gold@YourBotName → gold
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

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
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
        // TODO: real status from Sheet
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
        // ignore non-commands / unknown
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[TG] webhook error:", error);
    return NextResponse.json({ ok: true }); // always 200 biar Telegram tidak retry agresif
  }
}

// Optional: GET health
export async function GET() {
  return NextResponse.json({ ok: true, service: "telegram-webhook" });
}