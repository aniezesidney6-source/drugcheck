/**
 * logger.js
 * Simple structured logger for all verification requests and bot events.
 * Logs to console (stdout) in a clean format.
 * In production, pipe stdout to a log aggregator (e.g., Logtail, Datadog).
 */

/**
 * Logs an incoming verification request.
 *
 * @param {string} from       - Sender's WhatsApp number
 * @param {string} rawInput   - The raw message text
 * @param {string} normalizedNo - The normalized NAFDAC number (if applicable)
 * @param {string} resultStatus - The outcome: "verified" | "not_found" | "suspicious" | "invalid_format" | "command"
 */
function logVerification(from, rawInput, normalizedNo, resultStatus) {
  const ts = new Date().toISOString();
  console.log(
    `[${ts}] VERIFICATION | from=${from} | raw="${rawInput}" | normalized="${normalizedNo}" | result=${resultStatus}`
  );
}

/**
 * Logs a report submission.
 *
 * @param {string} from     - Sender's WhatsApp number
 * @param {string} nafdacNo - Reported NAFDAC number
 */
function logReport(from, nafdacNo) {
  const ts = new Date().toISOString();
  console.log(
    `[${ts}] REPORT_SUBMITTED | from=${from} | nafdac_no="${nafdacNo}"`
  );
}

/**
 * Logs a general bot event (welcome, help, fallback, errors).
 *
 * @param {string} event - Name of the event
 * @param {string} from  - Sender's WhatsApp number
 * @param {string} [extra] - Any additional info
 */
function logEvent(event, from, extra = "") {
  const ts = new Date().toISOString();
  console.log(`[${ts}] EVENT=${event} | from=${from} ${extra ? "| " + extra : ""}`);
}

/**
 * Logs an error.
 *
 * @param {string} context - Where the error occurred
 * @param {Error|string} err - The error
 */
function logError(context, err) {
  const ts = new Date().toISOString();
  console.error(`[${ts}] ERROR | context=${context} | ${err?.message || err}`);
}

module.exports = { logVerification, logReport, logEvent, logError };
