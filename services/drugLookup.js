/**
 * drugLookup.js
 * Service responsible for normalizing NAFDAC numbers and
 * querying the mock drug database (drugs.json).
 *
 * In production, replace the JSON lookup with a Supabase query.
 */

const fs = require("fs");
const path = require("path");

// Load the mock database once at startup
const DB_PATH = path.join(__dirname, "../data/drugs.json");
let drugsDatabase = [];

try {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  drugsDatabase = JSON.parse(raw);
  console.log(`[DrugLookup] Loaded ${drugsDatabase.length} drugs from database.`);
} catch (err) {
  console.error("[DrugLookup] ERROR: Could not load drugs.json →", err.message);
}

/**
 * Normalizes a NAFDAC number to a standard format.
 * Rules:
 *   - Trim whitespace
 *   - Convert to uppercase
 *   - Replace common separators (space, underscore, dot) with hyphen
 *   - Remove any characters that are not alphanumeric or hyphen
 *
 * Examples:
 *   "a4 1234"  → "A4-1234"
 *   "b2_5678"  → "B2-5678"
 *   " C7-9012 " → "C7-9012"
 *
 * @param {string} raw - The raw input from the user
 * @returns {string} - The normalized NAFDAC number
 */
function normalizeNafdacNo(raw) {
  if (!raw || typeof raw !== "string") return "";

  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s_\.]+/g, "-")   // Replace spaces, underscores, dots with hyphen
    .replace(/[^A-Z0-9\-]/g, "") // Remove any other special characters
    .replace(/-+/g, "-");        // Collapse multiple hyphens into one
}

/**
 * Validates that a normalized NAFDAC number matches the expected pattern.
 * Expected format: Letter(s) + digit(s) + hyphen + digit(s)
 * e.g. "A4-1234", "B12-5678"
 *
 * @param {string} normalized - Already normalized NAFDAC number
 * @returns {boolean}
 */
function isValidNafdacFormat(normalized) {
  // Pattern: 1-3 uppercase letters, 1-3 digits, hyphen, 3-6 digits
  const pattern = /^[A-Z]{1,3}[0-9]{1,3}-[0-9]{3,6}$/;
  return pattern.test(normalized);
}

/**
 * Main lookup function. Takes a raw NAFDAC number string, normalizes it,
 * and returns a result object with status and drug details.
 *
 * @param {string} rawInput - Raw NAFDAC number from user
 * @returns {{ status: string, drug: object|null, normalizedNo: string, isValidFormat: boolean }}
 */
function lookupDrug(rawInput) {
  const normalizedNo = normalizeNafdacNo(rawInput);
  const isValidFormat = isValidNafdacFormat(normalizedNo);

  // If the format is completely wrong, return early
  if (!isValidFormat) {
    return {
      status: "invalid_format",
      drug: null,
      normalizedNo,
      isValidFormat: false,
    };
  }

  // Search the database (case-insensitive match on nafdac_no)
  const found = drugsDatabase.find(
    (d) => d.nafdac_no.toUpperCase() === normalizedNo
  );

  if (!found) {
    return {
      status: "not_found",
      drug: null,
      normalizedNo,
      isValidFormat: true,
    };
  }

  return {
    status: found.status, // "verified" | "suspicious"
    drug: found,
    normalizedNo,
    isValidFormat: true,
  };
}

module.exports = { lookupDrug, normalizeNafdacNo, isValidNafdacFormat };
