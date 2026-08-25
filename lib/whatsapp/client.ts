// src/lib/whatsapp/client.ts

const WHATSAPP_ACCESS_TOKEN =
  process.env.WHATSAPP_ACCESS_TOKEN;

const PHONE_NUMBER_ID =
  process.env.PHONE_NUMBER_ID;

const GRAPH_API_VERSION = "v23.0";

const GRAPH_URL =
  `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

// ============================================================
// TYPES
// ============================================================

export type WhatsAppTextMessage = {
  to: string;
  text: string;
};

export type WhatsAppTemplateMessage = {
  to: string;
  templateName: string;
  languageCode?: string;
  parameters?: string[];
};

// ============================================================
// VALIDATE CONFIG
// ============================================================

function validateConfig() {
  if (!WHATSAPP_ACCESS_TOKEN) {
    throw new Error(
      "WHATSAPP_ACCESS_TOKEN is not configured"
    );
  }

  if (!PHONE_NUMBER_ID) {
    throw new Error(
      "PHONE_NUMBER_ID is not configured"
    );
  }
}

// ============================================================
// SEND TEXT
// ============================================================

export async function sendWhatsAppText(
  message: WhatsAppTextMessage
) {
  validateConfig();

  const response = await fetch(GRAPH_URL, {
    method: "POST",

    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: message.to,
      type: "text",
      text: {
        preview_url: false,
        body: message.text,
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(
      "❌ WHATSAPP TEXT ERROR:",
      JSON.stringify(data, null, 2)
    );

    throw new Error(
      data?.error?.message ||
        "WhatsApp text message failed"
    );
  }

  return data;
}

// ============================================================
// SEND TEMPLATE
// ============================================================

export async function sendWhatsAppTemplate(
  message: WhatsAppTemplateMessage
) {
  validateConfig();

  const parameters =
    message.parameters || [];

  const components =
    parameters.length > 0
      ? [
          {
            type: "body",
            parameters: parameters.map(
              (value) => ({
                type: "text",
                text: value,
              })
            ),
          },
        ]
      : undefined;

  const response = await fetch(GRAPH_URL, {
    method: "POST",

    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: message.to,
      type: "template",

      template: {
        name: message.templateName,

        language: {
          code:
            message.languageCode ||
            "en",
        },

        ...(components
          ? { components }
          : {}),
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(
      "❌ WHATSAPP TEMPLATE ERROR:",
      JSON.stringify(data, null, 2)
    );

    throw new Error(
      data?.error?.message ||
        "WhatsApp template message failed"
    );
  }

  return data;
}