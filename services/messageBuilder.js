/**
 * messageBuilder.js
 * Builds WhatsApp messages for DrugCheck Nigeria
 */

function welcomeMessage() {
  return `👋 Welcome to *DrugCheck Nigeria* 💊🇳🇬

I help you verify if a drug is registered with NAFDAC.

*What I can do:*
📋 Type a NAFDAC number e.g. *A4-1234*
📸 Send a *photo* of the medicine label
💊 Type a drug name e.g. *Amoxicillin*
🚨 Type *FAKE DRUG* to report suspicious medicine
🏥 Type *PHARMACY* to find nearby pharmacies

⚠️ This service is for verification only. It is not medical advice.

Type *HELP* for full command guide.`;
}

function helpMessage() {
  return `📖 *DrugCheck Nigeria — Full Guide*

*VERIFY A DRUG:*
• Type NAFDAC number e.g. *C4-0984*
• Send a 📸 photo of the medicine label
• Type drug name e.g. *Paracetamol*

*REPORT FAKE DRUG:*
• Type *FAKE DRUG* — I'll guide you step by step

*FIND PHARMACY:*
• Type *PHARMACY* — then share your location

*COMMUNITY RATINGS:*
• *RATINGS A4-1234* — see ratings for a drug
• *RATE DRUG A4-1234 5 Works great* — rate a drug
• *RATE PHARMACY 1 4 Good service* — rate a pharmacy

*OTHER:*
• *REPORT A4-1234* — report suspicious NAFDAC number
• *HELP* — show this guide
• *CANCEL* — cancel current action

📞 NAFDAC Hotline: *0800-162-3322* (toll-free)
🌐 nafdac.gov.ng`;
}

function verifiedMessage(drug, ratings) {
  let msg = `✅ *VERIFIED DRUG*\n\n`;
  msg += `💊 *${drug.drug_name || 'Unknown'}*\n`;
  if (drug.active_ingredient) msg += `🔬 Ingredient: ${drug.active_ingredient}\n`;
  if (drug.form) msg += `💉 Form: ${drug.form}\n`;
  if (drug.strength) msg += `⚖️ Strength: ${drug.strength}\n`;
  if (drug.applicant) msg += `🏭 Manufacturer: ${drug.applicant}\n`;
  msg += `🔖 NAFDAC No: ${drug.nafdac_no}\n`;
  msg += `\n✅ *This drug is registered with NAFDAC*\n`;

  if (ratings && ratings.count > 0) {
    msg += `\n⭐ Community Rating: ${ratings.average}/5 (${ratings.count} votes)`;
  }

  msg += `\n\n_To rate this drug: RATE DRUG ${drug.nafdac_no} [1-5] [comment]_`;
  return msg;
}

function notFoundMessage(nafdacNo) {
  return `❌ *NOT FOUND IN DATABASE*\n\n` +
    `NAFDAC No: *${nafdacNo}* is not in our database.\n\n` +
    `*This could mean:*\n` +
    `• The drug is not registered with NAFDAC\n` +
    `• The number was entered incorrectly\n` +
    `• It may be a counterfeit drug\n\n` +
    `⚠️ *Do not use this drug until verified.*\n\n` +
    `📞 Contact NAFDAC: *0800-162-3322*\n` +
    `🚨 To report: type *FAKE DRUG*`;
}

function suspiciousMessage(drug) {
  return `⚠️ *SUSPICIOUS DRUG*\n\n` +
    `💊 *${drug.drug_name || 'Unknown'}*\n` +
    `🔖 NAFDAC No: ${drug.nafdac_no}\n\n` +
    `⚠️ This drug has been flagged as suspicious by the community.\n\n` +
    `📞 Contact NAFDAC: *0800-162-3322*\n` +
    `🚨 To report: type *FAKE DRUG*`;
}

module.exports = { welcomeMessage, helpMessage, verifiedMessage, notFoundMessage, suspiciousMessage };
