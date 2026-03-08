/**
 * messageBuilder.js
 * Centralizes all bot response messages for easy editing.
 * Keeps the WhatsApp replies short and clear for everyday Nigerians.
 */

/**
 * Welcome / onboarding message shown when a new user says "Hi", "Hello", etc.
 * @returns {string}
 */
function welcomeMessage() {
  return (
    "👋 Welcome to *DrugCheck Nigeria* 💊\n\n" +
    "I help you verify if a drug is registered with NAFDAC.\n\n" +
    "📌 *How to use:*\n" +
    "Send your NAFDAC registration number.\n" +
    "Example: *A4-1234*\n\n" +
    "⚠️ This service is for verification only.\n" +
    "It is not medical advice.\n\n" +
    "Type *HELP* for more commands."
  );
}

/**
 * Help message explaining all supported commands.
 * @returns {string}
 */
function helpMessage() {
  return (
    "🆘 *DrugCheck Nigeria — Help*\n\n" +
    "Here's what you can do:\n\n" +
    "1️⃣ *Send a NAFDAC number* to verify a drug.\n" +
    "   Example: A4-1234\n\n" +
    "2️⃣ Type *HELP* to see this menu.\n\n" +
    "3️⃣ Type *REPORT [NAFDAC No]* to report a suspicious drug.\n" +
    "   Example: REPORT X0-9999\n\n" +
    "📞 For emergencies, call NAFDAC: 0800-162-3322\n\n" +
    "⚠️ Always buy drugs from licensed pharmacies."
  );
}

/**
 * Response for a VERIFIED drug.
 * @param {object} drug - The drug object from the database
 * @returns {string}
 */
function verifiedMessage(drug) {
  return (
    "✅ *DRUG VERIFIED*\n\n" +
    `💊 Drug: ${drug.drug_name}\n` +
    `🔖 NAFDAC No: ${drug.nafdac_no}\n` +
    `🏭 Manufacturer: ${drug.manufacturer}\n` +
    `💉 Form: ${drug.dosage_form} — ${drug.strength}\n` +
    `📊 Status: *VERIFIED ✅*\n\n` +
    "✔️ This drug is registered with NAFDAC.\n" +
    "Always buy from a licensed pharmacy."
  );
}

/**
 * Response for a drug NOT FOUND in the database.
 * @param {string} nafdacNo - The normalized NAFDAC number the user sent
 * @returns {string}
 */
function notFoundMessage(nafdacNo) {
  return (
    "⚠️ *DRUG NOT FOUND*\n\n" +
    `🔖 NAFDAC No: ${nafdacNo}\n` +
    `📊 Status: *NOT FOUND ⚠️*\n\n` +
    "This number is not in our database.\n\n" +
    "❗ *Do not use this drug* until you confirm it.\n\n" +
    "📞 Contact NAFDAC: 0800-162-3322\n" +
    "Or visit: www.nafdac.gov.ng"
  );
}

/**
 * Response for a SUSPICIOUS drug.
 * @param {object} drug - The suspicious drug object from the database
 * @returns {string}
 */
function suspiciousMessage(drug) {
  return (
    "❌ *SUSPICIOUS DRUG DETECTED*\n\n" +
    `🔖 NAFDAC No: ${drug.nafdac_no}\n` +
    `📊 Status: *SUSPICIOUS ❌*\n\n` +
    "⛔ This drug may be fake or unregistered.\n\n" +
    "*Do NOT use it.*\n\n" +
    "📢 Report it by sending:\n" +
    `REPORT ${drug.nafdac_no}\n\n` +
    "📞 Call NAFDAC: 0800-162-3322"
  );
}

/**
 * Response for an invalid NAFDAC format.
 * @param {string} rawInput - What the user originally sent
 * @returns {string}
 */
function invalidFormatMessage(rawInput) {
  return (
    "❓ *Invalid Format*\n\n" +
    `You sent: "${rawInput}"\n\n` +
    "A NAFDAC number looks like: *A4-1234*\n" +
    "(One or two letters, a number, a dash, then digits)\n\n" +
    "Please check the number on your drug pack and try again.\n\n" +
    "Type *HELP* if you need assistance."
  );
}

/**
 * Confirmation message after a user submits a report.
 * @param {string} nafdacNo - The reported NAFDAC number
 * @returns {string}
 */
function reportReceivedMessage(nafdacNo) {
  return (
    "📢 *Report Received*\n\n" +
    `NAFDAC No: ${nafdacNo || "not provided"}\n\n` +
    "Thank you for helping keep Nigeria safe! 🇳🇬\n" +
    "Your report has been saved for review.\n\n" +
    "📞 You can also call NAFDAC: 0800-162-3322"
  );
}

/**
 * Fallback message for unrecognized input that isn't a NAFDAC number.
 * @returns {string}
 */
function fallbackMessage() {
  return (
    "🤔 I didn't understand that.\n\n" +
    "To check a drug, send its *NAFDAC number*.\n" +
    "Example: *A4-1234*\n\n" +
    "Type *HELP* to see all commands."
  );
}

module.exports = {
  welcomeMessage,
  helpMessage,
  verifiedMessage,
  notFoundMessage,
  suspiciousMessage,
  invalidFormatMessage,
  reportReceivedMessage,
  fallbackMessage,
};
