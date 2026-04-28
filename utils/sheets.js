/**
 * Sheets utility
 *
 * Thin wrapper around the Google Sheets API v4.
 * Implements the four operations used by the agent pipeline:
 *   - findRow      → read a single row by key column value
 *   - setValue     → set a specific cell value
 *   - deltaUpdate  → read current numeric value, add delta, write back
 *   - getAllRows   → dump an entire tab (for debugging)
 *
 * Auth: uses a Service Account JSON key file.
 * Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH and SPREADSHEET_ID in your .env
 */

require("dotenv").config();
const { google } = require("googleapis");
const { log }    = require("./logger");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const KEY_PATH       = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

// ── Auth ──────────────────────────────────────────────────────────────────────
let _auth = null;

async function getAuth() {
  if (_auth) return _auth;
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes:  ["https://www.googleapis.com/auth/spreadsheets"],
  });
  _auth = await auth.getClient();
  return _auth;
}

async function getSheetsClient() {
  const auth = await getAuth();
  return google.sheets({ version: "v4", auth });
}

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Fetch all values from a tab and return as array of row objects.
 * Row 1 is assumed to be the header row.
 *
 * @param {string} tabName   – exact tab name in the spreadsheet
 * @returns {Promise<Array<object>>}
 */
async function getAllRows(tabName) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range:         `${tabName}`,
  });

  const [header, ...rows] = res.data.values || [];
  if (!header) return [];

  return rows.map((row) => {
    const obj = {};
    header.forEach((col, i) => { obj[col] = row[i] ?? ""; });
    return obj;
  });
}

/**
 * Find the first row where `keyCol` equals `keyVal`.
 *
 * @returns {Promise<object|null>}  – row object or null
 */
async function findRow(tabName, keyCol, keyVal) {
  const rows = await getAllRows(tabName);
  return rows.find((r) => String(r[keyCol]).trim() === String(keyVal).trim()) ?? null;
}

/**
 * Set a specific cell to `value`.
 * Finds the row by keyCol=keyVal, then writes to updateCol.
 */
async function setValue(tabName, keyCol, keyVal, updateCol, value) {
  const sheets  = await getSheetsClient();
  const allData = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range:         tabName,
  });

  const rows   = allData.data.values || [];
  const header = rows[0];
  if (!header) throw new Error(`Tab "${tabName}" has no header row`);

  const keyColIdx    = header.indexOf(keyCol);
  const updateColIdx = header.indexOf(updateCol);

  if (keyColIdx === -1)    throw new Error(`Column "${keyCol}" not found in tab "${tabName}"`);
  if (updateColIdx === -1) throw new Error(`Column "${updateCol}" not found in tab "${tabName}"`);

  // Find target row (1-indexed; row 1 is header → data starts at row 2)
  const rowIdx = rows.findIndex((row, i) => i > 0 && String(row[keyColIdx]).trim() === String(keyVal).trim());
  if (rowIdx === -1) throw new Error(`Row where ${keyCol}=${keyVal} not found in tab "${tabName}"`);

  const sheetRowNumber = rowIdx + 1;                          // 1-indexed
  const colLetter      = columnToLetter(updateColIdx + 1);    // 1-indexed col
  const cellRange      = `${tabName}!${colLetter}${sheetRowNumber}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId:     SPREADSHEET_ID,
    range:             cellRange,
    valueInputOption:  "USER_ENTERED",
    requestBody:       { values: [[value]] },
  });

  log("SHEETS", `setValue → ${cellRange} = "${value}"`);
}

/**
 * Read the current numeric value of `updateCol`, add `delta`, write back.
 */
async function deltaUpdate(tabName, keyCol, keyVal, updateCol, delta) {
  const row = await findRow(tabName, keyCol, keyVal);
  if (!row) throw new Error(`Row ${keyCol}=${keyVal} not found in "${tabName}"`);

  const current  = parseFloat(row[updateCol]) || 0;
  const newValue = Math.max(0, current + delta);   // prevent negative balances

  await setValue(tabName, keyCol, keyVal, updateCol, newValue.toFixed(2));
  log("SHEETS", `deltaUpdate → ${tabName}.${updateCol}[${keyCol}=${keyVal}]: ${current} + ${delta} = ${newValue}`);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Convert 1-indexed column number to letter(s). E.g. 1→A, 27→AA */
function columnToLetter(col) {
  let letter = "";
  while (col > 0) {
    const mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col    = Math.floor((col - 1) / 26);
  }
  return letter;
}

const Sheets = { getAllRows, findRow, setValue, deltaUpdate };
module.exports = { Sheets };
