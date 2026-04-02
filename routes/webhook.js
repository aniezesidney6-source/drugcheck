const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const drugLookup = require('../services/drugLookup');
const reportService = require('../services/reportService');
const ratingService = require('../services/ratingService');
const pharmacyService = require('../services/pharmacyService');
const { extractNAFDACFromImage } = require('../services/visionService');
const { getDrugInfo } = require('../services/drugInfoService');
const { getSession, setState, clearSession, STATES } = require('../services/sessionService');
const {
  welcomeMessage,
  helpMessage,
  verifiedMessage,
  notFoundMessage,
} = require('../services/messageBuilder');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const userLastPharmacies = {};

async function sendMessage(to, body) {
  return client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to,
    body
  });
}

function findDrug(nafdacNo) {
  const result = drugLookup.lookupDrug(nafdacNo);
  return result && result.drug ? result.drug : null;
}

router.post('/', async (req, res) => {
  res.status(200).end();

  const from = req.body.From;
  const body = (req.body.Body || '').trim();
  const numMedia = parseInt(req.body.NumMedia || '0');
  const session = getSession(from);

  try {

    // IMAGE — AI Vision Verification
    if (numMedia > 0) {
      const imageUrl = req.body.MediaUrl0;
      await sendMessage(from, '🔍 Scanning your medicine image, please wait...');
      try {
        const nafdacNo = await extractNAFDACFromImage(imageUrl);
        if (!nafdacNo) {
          await sendMessage(from,
            `❌ Couldn't read a NAFDAC number from that image.\n\n` +
            `*Tips:*\n• Good lighting, no shadows\n• Hold camera close to the label\n• Make sure NAFDAC number is visible\n\n` +
            `Or type the number directly e.g. *A4-1234*`
          );
        } else {
          const drug = findDrug(nafdacNo);
          const ratings = ratingService.getDrugRatingSummary(nafdacNo);
          await sendMessage(from,
            `📸 *Detected NAFDAC No:* ${nafdacNo}\n\n` +
            (drug ? verifiedMessage(drug, ratings) : notFoundMessage(nafdacNo))
          );
        }
      } catch (e) {
        console.error('Vision error:', e.message);
        await sendMessage(from, `⚠️ Image scan failed. Please try again or type the NAFDAC number directly.`);
      }
      return;
    }

    // MULTI-STEP: FAKE DRUG REPORT FLOW
    if (session.state === STATES.FAKE_REPORT_DRUG) {
      setState(from, STATES.FAKE_REPORT_PHARMACY, { drugName: body });
      await sendMessage(from, `💊 Drug: *${body}*\n\nWhich pharmacy or shop sold you this drug?\n_(Type the pharmacy name)_`);
      return;
    }

    if (session.state === STATES.FAKE_REPORT_PHARMACY) {
      setState(from, STATES.FAKE_REPORT_LOCATION, { ...session.data, pharmacyName: body });
      await sendMessage(from, `🏪 Pharmacy: *${body}*\n\nWhat is the location or address?\n_(E.g. Festac Town, Lagos)_`);
      return;
    }

    if (session.state === STATES.FAKE_REPORT_LOCATION) {
      const { drugName, pharmacyName } = session.data;
      reportService.addReport(`FAKE-${drugName.toUpperCase()}`, from, {
        type: 'fake_drug', drugName, pharmacyName, location: body,
        reportedAt: new Date().toISOString()
      });
      clearSession(from);
      await sendMessage(from,
        `🚨 *Fake Drug Report Submitted*\n\n` +
        `💊 Drug: ${drugName}\n🏪 Pharmacy: ${pharmacyName}\n📍 Location: ${body}\n\n` +
        `Your report has been logged. Also contact NAFDAC directly:\n` +
        `📞 *0800-162-3322* (toll-free)\n\n_Thank you for keeping Nigeria safe 🇳🇬_`
      );
      return;
    }

    // TEXT COMMANDS
    if (/^(CANCEL|STOP|EXIT)$/i.test(body)) {
      clearSession(from);
      await sendMessage(from, `✅ Cancelled. Send *HELP* to see what I can do.`);
      return;
    }

    if (/^(HI|HELLO|HEY|START|MENU)$/i.test(body)) {
      clearSession(from);
      await sendMessage(from, welcomeMessage());
      return;
    }

    if (/^HELP$/i.test(body)) {
      await sendMessage(from, helpMessage());
      return;
    }

    if (/^FAKE DRUG$/i.test(body) || /^REPORT FAKE$/i.test(body)) {
      setState(from, STATES.FAKE_REPORT_DRUG, {});
      await sendMessage(from,
        `🚨 *Report a Fake/Suspicious Drug*\n\n` +
        `What is the *name of the drug* you suspect is fake?\n_(Type the drug name e.g. Paracetamol)_\n\n` +
        `_Type CANCEL at any time to stop._`
      );
      return;
    }

    if (/^(PHARMACY|PHARMACIES|NEARBY|FIND PHARMACY)$/i.test(body)) {
      await sendMessage(from,
        `📍 *Find Nearby Pharmacies*\n\n` +
        `Please *share your location* using WhatsApp:\n\n` +
        `1. Tap the 📎 attachment icon\n2. Select *Location*\n3. Share your current location\n\n` +
        `I'll find the 5 closest pharmacies to you.`
      );
      return;
    }

    if (req.body.Latitude && req.body.Longitude) {
      const lat = parseFloat(req.body.Latitude);
      const lon = parseFloat(req.body.Longitude);
      await sendMessage(from, '📍 Finding pharmacies near you...');
      try {
        const pharmacies = await pharmacyService.findNearbyPharmacies(lat, lon);
        userLastPharmacies[from] = pharmacies;
        if (!pharmacies || pharmacies.length === 0) {
          await sendMessage(from, `😕 No pharmacies found within 5km. Try sharing your location again.`);
          return;
        }
        let msg = `🏥 *Nearest Pharmacies to You*\n\n`;
        pharmacies.forEach((p, i) => {
          msg += `*${i + 1}. ${p.name}*\n`;
          msg += `📍 ${p.address || 'Address not available'}\n`;
          if (p.distance) msg += `📏 ${p.distance}\n`;
          if (p.phone) msg += `📞 ${p.phone}\n`;
          if (p.rating) msg += `⭐ ${p.rating}/5\n`;
          if (p.open_now === true) msg += `🟢 Open now\n`;
          if (p.open_now === false) msg += `🔴 Closed now\n`;
          msg += `\n`;
        });
        msg += `To rate: *RATE PHARMACY [number] [1-5] [comment]*`;
        await sendMessage(from, msg);
      } catch (e) {
        await sendMessage(from, `⚠️ Couldn't fetch pharmacies. Please try again.`);
      }
      return;
    }

    // RATE DRUG — e.g. RATE DRUG A4-1234 5 Great product
    const rateDrugMatch = body.toUpperCase().match(/^RATE DRUG ([A-Z0-9]{1,4}-\d{2,7}[A-Z]?) ([1-5])\s*(.*)?$/);
    if (rateDrugMatch) {
      const nafdacNo = rateDrugMatch[1];
      const stars = parseInt(rateDrugMatch[2]);
      const comment = rateDrugMatch[3] || '';
      ratingService.rateDrug(from, nafdacNo, stars, comment);
      await sendMessage(from, `✅ Your ${stars}⭐ rating for *${nafdacNo}* has been saved. Thank you! 🇳🇬`);
      return;
    }

    // RATE PHARMACY — e.g. RATE PHARMACY 1 5 Great service
    const ratePharmMatch = body.toUpperCase().match(/^RATE PHARMACY (\d+) ([1-5])\s*(.*)?$/);
    if (ratePharmMatch) {
      const idx = parseInt(ratePharmMatch[1]) - 1;
      const stars = parseInt(ratePharmMatch[2]);
      const comment = ratePharmMatch[3] || '';
      const pharmacies = userLastPharmacies[from];
      if (!pharmacies || !pharmacies[idx]) {
        await sendMessage(from, `⚠️ No recent pharmacy search. Send *PHARMACY* first.`);
        return;
      }
      const pharmacy = pharmacies[idx];
      ratingService.ratePharmacy(from, pharmacy.osm_id || pharmacy.name, pharmacy.name, stars, comment);
      await sendMessage(from, `✅ Your ${stars}⭐ rating for *${pharmacy.name}* has been saved.`);
      return;
    }

    // RATINGS — e.g. RATINGS A4-1234
    const ratingsMatch = body.toUpperCase().match(/^RATINGS ([A-Z0-9]{1,4}-\d{2,7}[A-Z]?)$/);
    if (ratingsMatch) {
      const nafdacNo = ratingsMatch[1];
      const ratings = ratingService.getDrugRatingSummary(nafdacNo);
      if (!ratings || ratings.count === 0) {
        await sendMessage(from, `📊 No ratings yet for *${nafdacNo}*.\nBe first: *RATE DRUG ${nafdacNo} [1-5]*`);
      } else {
        await sendMessage(from,
          `📊 *Ratings: ${nafdacNo}*\n⭐ Average: ${ratings.average}/5\n🗳️ Votes: ${ratings.count}\n\n` +
          (ratings.comments?.length ? `💬 Comments:\n${ratings.comments.slice(-3).map(c => `• ${c.comment}`).join('\n')}` : '')
        );
      }
      return;
    }

    // REPORT by NAFDAC number
    const reportMatch = body.toUpperCase().match(/^REPORT ([A-Z0-9]{1,4}-\d{2,7}[A-Z]?)/);
    if (reportMatch) {
      reportService.addReport(reportMatch[1], from);
      await sendMessage(from, `🚨 Report logged for *${reportMatch[1]}*.\n📞 Also call NAFDAC: *0800-162-3322*\n\nThank you 🇳🇬`);
      return;
    }

    // NAFDAC NUMBER LOOKUP
    const nafdacMatch = body.match(/([A-Z0-9]{1,4}-\d{2,7}[A-Z]?)/i);
    if (nafdacMatch) {
      const nafdacNo = nafdacMatch[1].toUpperCase();
      const drug = findDrug(nafdacNo);
      const ratings = ratingService.getDrugRatingSummary(nafdacNo);
      await sendMessage(from, drug ? verifiedMessage(drug, ratings) : notFoundMessage(nafdacNo));
      return;
    }

    // DRUG INFO BY GENERIC NAME
    if (body.length >= 3 && body.length <= 30 && /^[a-zA-Z\s-]+$/.test(body)) {
      await sendMessage(from, `💊 Looking up *${body}*...`);
      try {
        const info = await getDrugInfo(body);
        if (info) {
          await sendMessage(from,
            `💊 *${info.NAME}*\n\n` +
            `📋 *Use:* ${info.USE}\n\n` +
            `💉 *Dosage:* ${info.DOSAGE}\n\n` +
            `⚠️ *Side Effects:* ${info.SIDE_EFFECTS}\n\n` +
            `🚫 *Warning:* ${info.WARNING}\n\n` +
            `📝 *Prescription needed:* ${info.PRESCRIPTION}\n\n` +
            `_Always consult a pharmacist or doctor before taking any medication._`
          );
        } else {
          await sendMessage(from,
            `🤔 I didn't recognise *"${body}"* as a drug name.\n\n` +
            `*Try:*\n• A NAFDAC number e.g. *A4-1234*\n• 📸 Send a photo of the medicine\n` +
            `• *FAKE DRUG* to report suspicious medicine\n• *HELP* for full guide`
          );
        }
      } catch (e) {
        await sendMessage(from, `⚠️ Couldn't fetch drug info right now. Try again shortly.`);
      }
      return;
    }

    // DEFAULT
    await sendMessage(from,
      `🤔 I didn't understand that.\n\n` +
      `*What I can do:*\n• Type a NAFDAC number e.g. *A4-1234*\n` +
      `• Type a drug name e.g. *Amoxicillin*\n• 📸 Send a photo of the medicine label\n` +
      `• *FAKE DRUG* — report suspicious medicine\n• *PHARMACY* — find nearby pharmacies\n• *HELP* — full guide`
    );

  } catch (err) {
    console.error('Webhook error:', err);
  }
});

module.exports = router;
