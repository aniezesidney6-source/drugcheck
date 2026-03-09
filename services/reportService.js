/**
 * reportService.js
 * Handles saving user-submitted suspicious drug reports.
 *
 * In production, replace the JSON file write with a Supabase insert.
 */

const fs = require("fs");
const path = require("path");

const REPORTS_PATH = path.join(__dirname, "../data/reports.json");

/**
 * Reads existing reports from the JSON file.
 * Returns an empty array if the file is missing or malformed.
 *
 * @returns {Array}
 */
function readReports() {
  try {
    const raw = fs.readFileSync(REPORTS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Saves a new suspicious drug report to the reports JSON file.
 *
 * Report format:
 *   {
 *     id:           auto-incremented integer
 *     phone_number: string (from WhatsApp "From" field)
 *     nafdac_no:    string (the NAFDAC number the user suspects)
 *     message:      string (any additional text the user sent)
 *     timestamp:    ISO string
 *   }
 *
 * @param {string} phoneNumber - Sender's phone number (e.g. "whatsapp:+2348012345678")
 * @param {string} nafdacNo    - The suspected NAFDAC number
 * @param {string} message     - Full message text for context
 * @returns {{ success: boolean, report: object }}
 */
function saveReport(phoneNumber, nafdacNo, message) {
  const reports = readReports();

  const newReport = {
    id: reports.length + 1,
    phone_number: phoneNumber || "unknown",
    nafdac_no: nafdacNo || "not provided",
    message: message || "",
    timestamp: new Date().toISOString(),
  };

  reports.push(newReport);

  try {
    fs.writeFileSync(REPORTS_PATH, JSON.stringify(reports, null, 2), "utf-8");
    console.log(`[ReportService] Saved report #${newReport.id} from ${phoneNumber}`);
    return { success: true, report: newReport };
  } catch (err) {
    console.error("[ReportService] ERROR: Could not save report →", err.message);
    return { success: false, report: null };
  }
}

/**
 * Returns all reports (useful for admin review later).
 *
 * @returns {Array}
 */
function getAllReports() {
  return readReports();
}

module.exports = { saveReport, getAllReports };
