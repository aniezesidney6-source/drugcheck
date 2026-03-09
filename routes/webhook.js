const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const drugLookup = require('../services/drugLookup');
const reportService = require('../services/reportService');
const ratingService = require('../services/ratingService');
const pharmacyService = require('../services/pharmacyService');
const { extractNAFDACFromImage } = require('../services/visionService');
const {
  welcomeMessage,
  helpMessage,
  verifiedMessage,
  notFoundMessage,
  suspiciousMessage
} = require('../services/messageBuilder');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Store last pharmacy search per user (for rating)
const userLastPharmacies = {};

async function sendMessage(to, body) {
  return client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to,
    body
  });
}

router.post('/', async (req, res) => {
  res.sendStatus(200); // Always respond to Twilio immediately

  const from = req.body.From;
  const body = (req.body.Body || '').trim();
  const numMedia = parseInt(req.body.NumMedia || '0');

  try {

    // ─────────────────────────────────────────
    // 📸 IMAGE RECEIVED — AI Vision Verification
    // ─────────────────────────────────────────
    if (numMedia > 0) {
      const imageUrl = req.body.MediaUrl0;

      await sendMessage(from, '🔍 Scanning your medicine image, please wait...');

      try {
        const nafdacNo = await extractNAFDACFromImage(imageUrl);

        if (!nafdacNo) {
          await sendMessage(from,
            `❌ Couldn't read a NAFDAC number from that image.\n\n` +
            `*Tips for a better scan:*\n` +
            `• Make sure the NAFDAC number is clearly visible\n` +
            `• Use good lighting, no shadows\n` +
            `• Hold camera steady and close to the label\n\n` +
            `Or just type the number directly e.g. *A4-1234*`
          );
          return;
        }

        const drug = drugLookup.findByNafdac(nafdacNo);
        if (drug) {
          const ratings = ratingService.getRatings(nafdacNo);
          await sendMessage(from,
            `📸 *Detected NAFDAC No:* ${nafdacNo}\n\n` +
            verifiedMessage(drug, ratings)
          );
        } else {
          await sendMessage(from,
            `📸 *Detected NAFDAC No:* ${nafdacNo}\n\n` +
            notFoundMessage(nafdacNo)
          );
        }

      } catch (visionErr) {
        console.error('Vision error:', visionErr.message);
        await sendMessage(from,
          `⚠️ Image scan failed. Please try again or type the NAFDAC number directly.`
        );
      }

      return;
    }

    // ─────────────────────────────────────────
    // 📝 TEXT COMMANDS
    // ─────────────────────────────────────────

    const upper = body.toUpperCase();

    // GREETING
    if (/^(HI|HELLO|HEY|START|MENU)$/i.test(body)) {
      await sendMessage(from, welcomeMessage());
      return;
    }

    // HELP
    if (/^HELP$/i.test(body)) {
      await sendMessage(from, helpMessage());
      return;
    }

    // PHARMACY / NEARBY
    if (/^(PHARMACY|PHARMACIES|NEARBY|FIND PHARMACY)$/i.test(body)) {
      await sendMessage(from,
        `📍 *Find Nearby Pharmacies*\n\n` +
        `Please *share your location* using WhatsApp:\n\n` +
        `1. Tap the 📎 attachment icon\n` +
        `2. Select *Location*\n` +
        `3. Share your current location\n\n` +
        `I'll find the 5 closest pharmacies to you.`
      );
      return;
    }

    // LOCATION SHARED
    if (req.body.Latitude && req.body.Longitude) {
      const lat = parseFloat(req.body.Latitude);
      const lon = parseFloat(req.body.Longitude);

      await sendMessage(from, '📍 Finding pharmacies near you...');

      try {
        const pharmacies = await pharmacyService.findNearbyPharmacies(lat, lon);
        userLastPharmacies[from] = pharmacies;

        if (!pharmacies || pharmacies.length === 0) {
          await sendMessage(from,
            `😕 No pharmacies found within 5km.\n\nTry sharing your location again or check that location sharing is enabled.`
          );
          return;
        }

        let msg = `🏥 *Nearest Pharmacies to You*\n\n`;
        pharmacies.forEach((p, i) => {
          const stars = p.rating ? `⭐ ${p.rating}` : '';
          const dist = p.distance ? `📏 ${p.distance}` : '';
          msg += `*${i + 1}. ${p.name}*\n`;
          if (p.address) msg += `📍 ${p.address}\n`;
          if (dist) msg += `${dist}\n`;
          if (stars) msg += `${stars}\n`;
          msg += `\n`;
        });

        msg += `To rate a pharmacy, reply:\n*RATE PHARMACY [number] [1-5] [comment]*\nExample: RATE PHARMACY 1 5 Very professional`;
        await sendMessage(from, msg);

      } catch (pharmErr) {
        console.error('Pharmacy error:', pharmErr.message);
        await sendMessage(from, `⚠️ Couldn't fetch pharmacies right now. Please try again.`);
      }
      return;
    }

    // RATE DRUG — e.g. RATE DRUG A4-1234 4 Good product
    const rateDrugMatch = upper.match(/^RATE DRUG ([A-Z0-9]{1,4}-\d{2,7}[A-Z]?) ([1-5])\s*(.*)?$/);
    if (rateDrugMatch) {
      const nafdacNo = rateDrugMatch[1];
      const rating = parseInt(rateDrugMatch[2]);
      const comment = rateDrugMatch[3] || '';
      ratingService.addDrugRating(nafdacNo, rating, comment, from);
      await sendMessage(from,
        `✅ Thanks! Your ${rating}⭐ rating for *${nafdacNo}* has been saved.\n\n` +
        `This helps other Nigerians make safer drug choices. 🇳🇬`
      );
      return;
    }

    // RATE PHARMACY — e.g. RATE PHARMACY 1 5 Great service
    const ratePharmMatch = upper.match(/^RATE PHARMACY (\d+) ([1-5])\s*(.*)?$/);
    if (ratePharmMatch) {
      const idx = parseInt(ratePharmMatch[1]) - 1;
      const rating = parseInt(ratePharmMatch[2]);
      const comment = ratePharmMatch[3] || '';
      const pharmacies = userLastPharmacies[from];

      if (!pharmacies || !pharmacies[idx]) {
        await sendMessage(from,
          `⚠️ No recent pharmacy search found.\nSend *PHARMACY* first to find nearby pharmacies, then rate them.`
        );
        return;
      }

      const pharmacy = pharmacies[idx];
      ratingService.addPharmacyRating(pharmacy.osm_id || pharmacy.place_id || pharmacy.name, rating, comment, from);
      await sendMessage(from,
        `✅ Thanks! Your ${rating}⭐ rating for *${pharmacy.name}* has been saved.`
      );
      return;
    }

    // RATINGS — e.g. RATINGS A4-1234
    const ratingsMatch = upper.match(/^RATINGS ([A-Z0-9]{1,4}-\d{2,7}[A-Z]?)$/);
    if (ratingsMatch) {
      const nafdacNo = ratingsMatch[1];
      const ratings = ratingService.getRatings(nafdacNo);
      if (!ratings || ratings.count === 0) {
        await sendMessage(from,
          `📊 No community ratings yet for *${nafdacNo}*.\n\nBe the first! Reply:\n*RATE DRUG ${nafdacNo} [1-5] [comment]*`
        );
      } else {
        await sendMessage(from,
          `📊 *Community Ratings for ${nafdacNo}*\n\n` +
          `⭐ Average: ${ratings.average}/5\n` +
          `🗳️ Total votes: ${ratings.count}\n\n` +
          (ratings.comments?.length
            ? `💬 Recent comments:\n${ratings.comments.slice(-3).map(c => `• ${c}`).join('\n')}`
            : '')
        );
      }
      return;
    }

    // REPORT — e.g. REPORT A4-1234
    const reportMatch = upper.match(/^REPORT ([A-Z0-9]{1,4}-\d{2,7}[A-Z]?)/);
    if (reportMatch) {
      const nafdacNo = reportMatch[1];
      reportService.addReport(nafdacNo, from);
      await sendMessage(from,
        `🚨 *Report Received*\n\n` +
        `Thank you for reporting *${nafdacNo}* as suspicious.\n\n` +
        `Your report has been logged. If you believe this drug is dangerous, ` +
        `please also contact NAFDAC directly:\n📞 *0800-162-3322* (toll-free)\n\n` +
        `You're helping keep Nigeria safe. 🇳🇬`
      );
      return;
    }

    // NAFDAC NUMBER LOOKUP — e.g. A4-1234 or 04-3877
    const nafdacMatch = body.match(/([A-Z0-9]{1,4}-\d{2,7}[A-Z]?)/i);
    if (nafdacMatch) {
      const nafdacNo = nafdacMatch[1].toUpperCase();
      const drug = drugLookup.findByNafdac(nafdacNo);

      if (drug) {
        const ratings = ratingService.getRatings(nafdacNo);
        await sendMessage(from, verifiedMessage(drug, ratings));
      } else {
        await sendMessage(from, notFoundMessage(nafdacNo));
      }
      return;
    }

    // DEFAULT — unknown command
    await sendMessage(from,
      `🤔 I didn't understand that.\n\n` +
      `*What I can do:*\n` +
      `• Type a NAFDAC number e.g. *A4-1234*\n` +
      `• 📸 Send a *photo* of the medicine label\n` +
      `• Send *PHARMACY* to find nearby pharmacies\n` +
      `• Send *HELP* for full guide`
    );

  } catch (err) {
    console.error('Webhook error:', err);
  }
});

module.exports = router;
