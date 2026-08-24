// lib/telegram/formatSignal.ts

type TimeframeAnalysis = {
  timeframe: string;
  direction: string;
  score: number;
};

export type Signal = {
  market: string;
  price: string | number;
  analysis?: {
    "15M"?: TimeframeAnalysis;
    "30M"?: TimeframeAnalysis;
    "1H"?: TimeframeAnalysis;
  };
  overall?: string | null;
  support?: string | number | null;
  resistance?: string | number | null;
  supports?: (string | number | null)[] | null;
  resistances?: (string | number | null)[] | null;
  confidence?: number | string | null;
  generatedAt?: string | null;
};

export function formatSignalMessage(signal: Signal): string {
  const dir = (value?: string | null) => value || "-";

  const emoji =
    signal.overall?.includes("STRONG BUY") ? "🚀" :
      signal.overall?.includes("BUY") ? "🟢" :
        signal.overall?.includes("STRONG SELL") ? "🔻" :
          signal.overall?.includes("SELL") ? "🔴" : "⚪";

  const analysis = signal.analysis || {};

  const supports = signal.supports?.length
    ? signal.supports
      .filter((s) => s != null)
      .map((s, i) => `S${i + 1}: ${s}`)
      .join("\n")
    : `S1: ${signal.support ?? "-"}`;

  const resistances = signal.resistances?.length
    ? signal.resistances
      .filter((r) => r != null)
      .map((r, i) => `R${i + 1}: ${r}`)
      .join("\n")
    : `R1: ${signal.resistance ?? "-"}`;

  const time = signal.generatedAt
    ? new Date(signal.generatedAt).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
    })
    : new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

  return `
${emoji} <b>${signal.market}</b>

<b>Price:</b> ${signal.price}
<b>Overall:</b> ${signal.overall || "-"}
<b>Confidence:</b> ${signal.confidence ?? 0}%

<b>Timeframes</b>
• 15M: ${dir(analysis["15M"]?.direction)}
• 30M: ${dir(analysis["30M"]?.direction)}
• 1H: ${dir(analysis["1H"]?.direction)}

<b>Support</b>
${supports}

<b>Resistance</b>
${resistances}

——————
🕐 ${time}
💻 WebBotPro · webbotpro.com
`.trim();
}