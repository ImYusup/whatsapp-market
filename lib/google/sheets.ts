// src/lib/google/sheets.ts

import { google } from "googleapis";

const GOOGLE_CLIENT_EMAIL =
  process.env.GOOGLE_CLIENT_EMAIL;

const GOOGLE_PRIVATE_KEY =
  process.env.GOOGLE_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );

export const GOOGLE_SHEET_ID =
  process.env.GOOGLE_SHEET_ID;

function getAuth() {
  if (
    !GOOGLE_CLIENT_EMAIL ||
    !GOOGLE_PRIVATE_KEY
  ) {
    throw new Error(
      "Google Service Account credentials are not configured"
    );
  }

  return new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,

    key: GOOGLE_PRIVATE_KEY,

    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
}

export function getSheets() {
  if (!GOOGLE_SHEET_ID) {
    throw new Error(
      "GOOGLE_SHEET_ID is not configured"
    );
  }

  return google.sheets({
    version: "v4",
    auth: getAuth(),
  });
}

// ============================================================
// READ
// ============================================================

export async function readSheet(
  sheetName: string,
  range = "A:Z"
) {
  const sheets =
    getSheets();

  const response =
    await sheets.spreadsheets.values.get({
      spreadsheetId:
        GOOGLE_SHEET_ID,

      range: `${sheetName}!${range}`,
    });

  return response.data.values || [];
}

// ============================================================
// APPEND
// ============================================================

export async function appendRows(
  sheetName: string,
  rows: string[][]
) {
  const sheets =
    getSheets();

  await sheets.spreadsheets.values.append({
    spreadsheetId:
      GOOGLE_SHEET_ID,

    range: `${sheetName}!A:Z`,

    valueInputOption:
      "USER_ENTERED",

    insertDataOption:
      "INSERT_ROWS",

    requestBody: {
      values: rows,
    },
  });
}

// ============================================================
// UPDATE
// ============================================================

export async function updateRange(
  sheetName: string,
  range: string,
  values: string[][]
) {
  const sheets =
    getSheets();

  await sheets.spreadsheets.values.update({
    spreadsheetId:
      GOOGLE_SHEET_ID,

    range: `${sheetName}!${range}`,

    valueInputOption:
      "USER_ENTERED",

    requestBody: {
      values,
    },
  });
}