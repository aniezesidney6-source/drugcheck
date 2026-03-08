/**
 * routes/webhook.js
 * Handles all incoming WhatsApp messages via Twilio
 * 
 * Supported commands:
 *   [NAFDAC number]           → Drug verification
 *   PHARMACY / NEARBY         → Find nearby pharmacies (requires location)
 *   RATE DRUG [nrn] [1-5] [comment]
 *   RATE PHARMACY [n] [1-5] [comment]
 *   RATINGS [nrn]             → View community ratings for a drug
 *   REPORT [nrn]              → Report a suspicious drug
 *   HELP                      → Usage guide
 *   Hi / Hello                → Welcome
 */

const express = require('express');
const router = express.Router();

const { lookupDrug } = require('../services/drugLookup');
const { buildVerifiedMessage, buildNotFoundMessage, buildSuspiciousMessage, buildHelpMessage, buildWelcomeMessage } = require('../services/messageBuilder');
const { saveReport } = require('../services/reportService');
const { findNearbyPharmacies, formatPharmacyMessage } = require('../services/pharmacyService');
const {
  rateDrug,
  ratePharmacy,
  getDrugRatingSummary,
  getAllPharmacyRatings,
  formatDrugRatingMessage,
  formatRatingConfirmation,
} = require('../services/ratingService');
const logger = require('../services/logger');

// Session store: remembers last pharmacy search per user (for rating by number)
// { phoneNumber: { pharmacies: [...], timestamp: Date } }
const pharmacySessionCache = {};
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getSession(phone) {
  const session = pharmacySessionCache[phone];
  if (!session) return null;
  if (Date.now() - session.timestamp > SESSION_TTL_MS) {
    delete pharmacySessionCache[phone];
    return null;
  }
  return session;
}

function setSession(phone, data) {
  pharmacySessionCache[phone] = { ...data, timestamp: Date.now() };
}

// ─── Main Webhook Handler ─────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  // Twilio sends form-encoded body
  const body = req.body;
  const from = body.From || '';         // e.g. whatsapp:+2348012345678
  const msgBody = (body.Body || '').trim();
  const phone = from.replace('whatsapp:', '');

  // WhatsApp location message
  const latitude = body.Latitude ? parseFloat(body.Latitude) : null;
  const longitude = body.Longitude ? parseFloat(body.Longitude) : null;
  const hasLocation = latitude !== null && longitude !== null;

  logger.info(`Incoming from ${phone}: "${msgBody}" ${hasLocation ? `[LAT:${latitude} LNG:${longitude}]` : ''}`);

  let reply = '';

  try {
    // ── Location shared ─────────────────────────────────────────────────────
    if (hasLocation) {
      reply = await handlePharmacySearch(phone, latitude, longitude);
    }

    // ── Text commands ────────────────────────────────────────────────────────
    else {
      const upper = msgBody.toUpperCase();

      // Greeting
      if (/^(HI|HELLO|HEY|START|MENU|👋)$/i.test(upper)) {
        reply = buildWelcomeMessage();
      }

      // Help
      else if (/^HELP$/i.test(upper)) {
        reply = buildHelpMessage();
      }

      // Pharmacy search by text trigger
      else if (/^(PHARMACY|NEARBY|FIND PHARMACY|PHARMACIES)$/i.test(upper)) {
        reply = buildLocationRequestMessage();
      }

      // RATE DRUG [nrn] [stars] [optional comment]
      else if (/^RATE DRUG /i.test(upper)) {
        reply = await handleRateDrug(phone, msgBody);
      }

      // RATE PHARMACY [number] [stars] [optional comment]
      else if (/^RATE PHARMACY /i.test(upper)) {
        reply = await handleRatePharmacy(phone, msgBody);
      }

      // RATINGS [nrn] — view drug community ratings
      else if (/^RATINGS? /i.test(upper)) {
        reply = handleViewDrugRatings(msgBody);
      }

      // REPORT [nrn]
      else if (/^REPORT /i.test(upper)) {
        reply = await handleReport(phone, msgBody);
      }

      // NAFDAC number lookup (e.g. A4-1234, B2-5678, 04-3877)
      else if (/^[A-Z0-9]{1,3}-\d{3,6}$/i.test(upper.trim())) {
        reply = handleDrugLookup(upper.trim(), phone);
      }

      // Fallback
      else {
        reply = buildUnknownMessage(msgBody);
      }
    }

  } catch (err) {
    logger.error(`Handler error for "${msgBody}": ${err.message}`);
    reply = `⚠️ Something went wrong. Please try again or send HELP for instructions.`;
  }

  // Respond with TwiML
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(reply)}</Message>
</Response>`);
});

// ─── Handlers ────────────────────────────────────────────────────────────────

function handleDrugLookup(nrn, phone) {
  const result = lookupDrug(nrn);
  const { getDrugRatingSummary } = require('../services/ratingService');
  const ratingSummary = getDrugRatingSummary(nrn);

  let msg;
  if (result.status === 'verified') {
    msg = buildVerifiedMessage(result);
  } else if (result.status === 'suspicious') {
    msg = buildSuspiciousMessage(result);
  } else {
    msg = buildNotFoundMessage(nrn);
  }

  // Append community rating if any
  if (ratingSummary.count > 0) {
    const stars = '⭐'.repeat(Math.round(ratingSummary.average));
    msg += `\n\n👥 *Community Rating:* ${stars} ${ratingSummary.average}/5 (${ratingSummary.count} users)`;
  } else {
    msg += `\n\n💬 Rate this drug: RATE DRUG ${nrn} [1-5]`;
  }

  return msg;
}

async function handlePharmacySearch(phone, lat, lng) {
  try {
    logger.info(`Pharmacy search for ${phone} at ${lat},${lng}`);
    const pharmacies = await findNearbyPharmacies(lat, lng, 5);
    const communityRatings = getAllPharmacyRatings();

    // Save to session so user can rate by number (1, 2, 3...)
    setSession(phone, { pharmacies });

    return formatPharmacyMessage(pharmacies, communityRatings);
  } catch (err) {
    logger.error(`Pharmacy search error: ${err.message}`);
    if (err.message.includes('GOOGLE_PLACES_API_KEY')) {
      return `⚠️ Pharmacy search is not configured yet. Contact support.`;
    }
    return `⚠️ Could not find pharmacies right now. Please try again shortly.`;
  }
}

async function handleRateDrug(phone, msgBody) {
  // Format: RATE DRUG A4-1234 5 optional comment here
  const parts = msgBody.trim().split(/\s+/);
  // parts: ['RATE', 'DRUG', 'A4-1234', '5', ...rest]
  if (parts.length < 4) {
    return (
      `⚠️ *Invalid format*\n\n` +
      `Send: RATE DRUG [NAFDAC No] [1-5] [optional comment]\n` +
      `Example: _RATE DRUG A4-1234 5 Genuine product, good quality_`
    );
  }

  const nrn = parts[2].toUpperCase();
  const stars = parseInt(parts[3]);
  const comment = parts.slice(4).join(' ');

  if (isNaN(stars) || stars < 1 || stars > 5) {
    return `⚠️ Rating must be a number from 1 to 5.\nExample: _RATE DRUG ${nrn} 4_`;
  }

  // Verify drug exists
  const drugResult = lookupDrug(nrn);
  const drugName = drugResult.drug_name || nrn;

  const summary = rateDrug(phone, nrn, stars, comment);
  return formatRatingConfirmation('💊 Drug', drugName, stars, summary);
}

async function handleRatePharmacy(phone, msgBody) {
  // Format: RATE PHARMACY 2 4 optional comment
  const parts = msgBody.trim().split(/\s+/);
  // parts: ['RATE', 'PHARMACY', '2', '4', ...rest]

  if (parts.length < 4) {
    return (
      `⚠️ *Invalid format*\n\n` +
      `First search for pharmacies by sharing your 📍 location.\n` +
      `Then send: RATE PHARMACY [number] [1-5] [optional comment]\n` +
      `Example: _RATE PHARMACY 1 4 Great service, stocked meds_`
    );
  }

  const session = getSession(phone);
  if (!session || !session.pharmacies || session.pharmacies.length === 0) {
    return (
      `⚠️ *No recent pharmacy search found*\n\n` +
      `Please share your 📍 *location* first to find nearby pharmacies,\n` +
      `then use RATE PHARMACY [number] [1-5].`
    );
  }

  const pharmacyIndex = parseInt(parts[2]) - 1; // Convert 1-based to 0-based
  const stars = parseInt(parts[3]);
  const comment = parts.slice(4).join(' ');

  if (isNaN(pharmacyIndex) || pharmacyIndex < 0 || pharmacyIndex >= session.pharmacies.length) {
    return `⚠️ Invalid pharmacy number. You searched for ${session.pharmacies.length} pharmacies. Use 1 to ${session.pharmacies.length}.`;
  }

  if (isNaN(stars) || stars < 1 || stars > 5) {
    return `⚠️ Rating must be a number from 1 to 5.\nExample: _RATE PHARMACY ${pharmacyIndex + 1} 4_`;
  }

  const pharmacy = session.pharmacies[pharmacyIndex];
  const summary = ratePharmacy(phone, pharmacy.osm_id, pharmacy.name, stars, comment);
  return formatRatingConfirmation('🏥 Pharmacy', pharmacy.name, stars, summary);
}

function handleViewDrugRatings(msgBody) {
  const parts = msgBody.trim().split(/\s+/);
  const nrn = (parts[1] || '').toUpperCase().trim();

  if (!nrn || !/^[A-Z0-9]{1,3}-\d{3,6}$/i.test(nrn)) {
    return `⚠️ Please provide a NAFDAC number.\nExample: _RATINGS A4-1234_`;
  }

  const drugResult = lookupDrug(nrn);
  const summary = getDrugRatingSummary(nrn);
  return formatDrugRatingMessage(summary, drugResult.drug_name);
}

async function handleReport(phone, msgBody) {
  const parts = msgBody.trim().split(/\s+/);
  const nrn = (parts[1] || '').toUpperCase().trim();

  if (!nrn) {
    return `⚠️ Please include the NAFDAC number.\nExample: _REPORT A4-1234_`;
  }

  await saveReport({ phone: hashPhone(phone), nafdac_no: nrn, timestamp: new Date().toISOString() });

  return (
    `🚨 *Report Received*\n\n` +
    `NAFDAC No: *${nrn}*\n` +
    `Status: Logged for review ✅\n\n` +
    `Thank you for helping keep Nigerians safe.\n` +
    `If this is an emergency, contact NAFDAC:\n` +
    `📞 0800-162-3322 (toll-free)`
  );
}

// ─── Message Builders ─────────────────────────────────────────────────────────

function buildLocationRequestMessage() {
  return (
    `🏥 *Find Nearby Pharmacies*\n\n` +
    `To show pharmacies near you, please share your location:\n\n` +
    `1️⃣ Tap the 📎 attachment icon\n` +
    `2️⃣ Select *Location*\n` +
    `3️⃣ Tap *Send Your Current Location*\n\n` +
    `I'll find the nearest pharmacies with ratings! 📍`
  );
}

function buildUnknownMessage(input) {
  const looksLikeNRN = /[A-Z0-9]+-\d+/i.test(input);
  if (looksLikeNRN) {
    return (
      `⚠️ *Unrecognised format*\n\n` +
      `NAFDAC numbers look like: *A4-1234* or *04-5678*\n` +
      `Please check and try again.\n\n` +
      `Send HELP for all commands.`
    );
  }
  return (
    `🤔 I didn't understand that.\n\n` +
    `*What I can do:*\n` +
    `• Send a NAFDAC number to verify a drug\n` +
    `• Send *PHARMACY* to find nearby pharmacies\n` +
    `• Send *HELP* for full guide\n\n` +
    `_DrugCheck Nigeria_ 💊`
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hashPhone(phone) {
  let hash = 0;
  const str = phone.replace(/\D/g, '');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

module.exports = router;
