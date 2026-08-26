// lib/telegram/format.ts

function formatIdr(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return "Rp " + Math.round(value).toLocaleString("id-ID");
}

function formatOz(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatSignalTelegram(signal: {
  market: string;
  price: string | number;
  overall: string;
  confidence: number;
  analysis: Record<string, { direction?: string }>;
  supports?: (string | number)[];
  resistances?: (string | number)[];
  generatedAt?: string;
  usdIdr?: number | null;
  priceIdrPerGram?: number | null;
}) {
  const a = signal.analysis || {};
  const r = (signal.resistances || []).slice(0, 3);
  const s = (signal.supports || []).slice(0, 3);

  const isGold = signal.market === "XAU/USD";

  const priceBlock: string[] = isGold
    ? [
        "<b>Price (oz)</b>",
        `${formatOz(signal.price)} USD/oz`,
        "",
        "<b>Price (gram)</b>",
        signal.priceIdrPerGram != null
          ? `≈ ${formatIdr(signal.priceIdrPerGram)} / gram`
          : "-",
        ...(signal.usdIdr
          ? [
              `(USD/IDR ${Math.round(signal.usdIdr).toLocaleString("id-ID")})`,
            ]
          : []),
      ]
    : ["<b>Price</b>", String(signal.price)];

  const lines = [
    `<b>${signal.market}</b>`,
    "",
    ...priceBlock,
    "",
    `Overall: <b>${signal.overall}</b>`,
    `Confidence: ${signal.confidence}%`,
    "",
    "<b>Timeframes</b>",
    `• 15M: ${a["15M"]?.direction || "-"}`,
    `• 30M: ${a["30M"]?.direction || "-"}`,
    `• 1H: ${a["1H"]?.direction || "-"}`,
    "",
    "<b>Support</b>",
    ...(s.length ? s.map((v, i) => `S${i + 1}: ${v}`) : ["-"]),
    "",
    "<b>Resistance</b>",
    ...(r.length ? r.map((v, i) => `R${i + 1}: ${v}`) : ["-"]),
  ];

  if (signal.generatedAt) {
    lines.push("", `🕐 ${signal.generatedAt}`);
  }

  lines.push("", "💻 WebBotPro · webbotpro.com");
  return lines.join("\n");
}

export function formatTfSummary(
  signals: any[],
  tf: "15M" | "30M" | "1H"
) {
  const lines = [`<b>${tf} signals</b>`, ""];
  for (const sig of signals) {
    const dir = sig.analysis?.[tf]?.direction || "-";
    lines.push(`• ${sig.market}: <b>${dir}</b>`);
  }
  lines.push("", "💻 WebBotPro · webbotpro.com");
  return lines.join("\n");
}