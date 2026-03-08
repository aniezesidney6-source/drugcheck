/**
 * Rating Service
 * Stores and retrieves community ratings for drugs and pharmacies
 * Data is saved to data/ratings.json
 * 
 * Rating commands (WhatsApp):
 *   RATE DRUG A4-1234 5 Great quality, genuine product
 *   RATE PHARMACY 1 4 Good service, helpful staff
 *   RATINGS A4-1234
 *   RATINGS PHARMACY [place_id]
 */

const fs = require('fs');
const path = require('path');

const RATINGS_FILE = path.join(__dirname, '../data/ratings.json');

// ─── File I/O ────────────────────────────────────────────────────────────────

function loadRatings() {
  if (!fs.existsSync(RATINGS_FILE)) {
    return { drugs: [], pharmacies: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(RATINGS_FILE, 'utf8'));
  } catch {
    return { drugs: [], pharmacies: [] };
  }
}

function saveRatings(data) {
  fs.writeFileSync(RATINGS_FILE, JSON.stringify(data, null, 2));
}

// ─── Drug Ratings ─────────────────────────────────────────────────────────────

/**
 * Rate a drug by its NAFDAC number
 * @param {string} userPhone - WhatsApp number (anonymised as hash)
 * @param {string} nafdacNo
 * @param {number} stars - 1 to 5
 * @param {string} comment - optional
 */
function rateDrug(userPhone, nafdacNo, stars, comment = '') {
  if (stars < 1 || stars > 5) throw new Error('Rating must be between 1 and 5');

  const nrn = nafdacNo.toUpperCase().trim();
  const data = loadRatings();
  const userHash = hashPhone(userPhone);

  // One rating per user per drug — update if exists
  const existing = data.drugs.findIndex(r => r.nafdac_no === nrn && r.user_hash === userHash);

  const entry = {
    nafdac_no: nrn,
    user_hash: userHash,
    rating: stars,
    comment: comment.slice(0, 200), // max 200 chars
    created_at: new Date().toISOString(),
  };

  if (existing !== -1) {
    data.drugs[existing] = entry;
  } else {
    data.drugs.push(entry);
  }

  saveRatings(data);
  return getDrugRatingSummary(nrn);
}

/**
 * Get rating summary for a drug
 */
function getDrugRatingSummary(nafdacNo) {
  const nrn = nafdacNo.toUpperCase().trim();
  const data = loadRatings();
  const ratings = data.drugs.filter(r => r.nafdac_no === nrn);

  if (ratings.length === 0) return { nafdac_no: nrn, average: null, count: 0, comments: [] };

  const avg = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
  const recentComments = ratings
    .filter(r => r.comment)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)
    .map(r => ({ comment: r.comment, rating: r.rating, date: r.created_at.split('T')[0] }));

  return {
    nafdac_no: nrn,
    average: parseFloat(avg.toFixed(1)),
    count: ratings.length,
    comments: recentComments,
  };
}

// ─── Pharmacy Ratings ─────────────────────────────────────────────────────────

/**
 * Rate a pharmacy by Google Place ID
 */
function ratePharmacy(userPhone, osmId, pharmacyName, stars, comment = '') {
  if (stars < 1 || stars > 5) throw new Error('Rating must be between 1 and 5');

  const data = loadRatings();
  const userHash = hashPhone(userPhone);

  const existing = data.pharmacies.findIndex(r => r.osm_id === osmId && r.user_hash === userHash);

  const entry = {
    osm_id: osmId,
    pharmacy_name: pharmacyName,
    user_hash: userHash,
    rating: stars,
    comment: comment.slice(0, 200),
    created_at: new Date().toISOString(),
  };

  if (existing !== -1) {
    data.pharmacies[existing] = entry;
  } else {
    data.pharmacies.push(entry);
  }

  saveRatings(data);
  return getPharmacyRatingSummary(osmId);
}

/**
 * Get rating summary for a pharmacy
 */
function getPharmacyRatingSummary(osmId) {
  const data = loadRatings();
  const ratings = data.pharmacies.filter(r => r.osm_id === osmId);

  if (ratings.length === 0) return { place_id: placeId, average: null, count: 0, comments: [] };

  const avg = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
  const recentComments = ratings
    .filter(r => r.comment)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)
    .map(r => ({ comment: r.comment, rating: r.rating, date: r.created_at.split('T')[0] }));

  return {
    place_id: placeId,
    pharmacy_name: ratings[0]?.pharmacy_name || 'Unknown',
    average: parseFloat(avg.toFixed(1)),
    count: ratings.length,
    comments: recentComments,
  };
}

/**
 * Get all pharmacy ratings (for enriching pharmacy search results)
 */
function getAllPharmacyRatings() {
  const data = loadRatings();
  return data.pharmacies;
}

// ─── WhatsApp Message Formatters ──────────────────────────────────────────────

function formatDrugRatingMessage(summary, drugName) {
  if (summary.count === 0) {
    return (
      `💊 *${drugName || summary.nafdac_no}*\n` +
      `No community ratings yet.\n\n` +
      `Be the first! Send:\n` +
      `RATE DRUG ${summary.nafdac_no} [1-5] [optional comment]\n` +
      `_Example: RATE DRUG ${summary.nafdac_no} 5 Genuine product_`
    );
  }

  const stars = '⭐'.repeat(Math.round(summary.average));
  const lines = [
    `💊 *${drugName || summary.nafdac_no}* — Community Ratings`,
    `${stars} *${summary.average}/5* (${summary.count} ${summary.count === 1 ? 'rating' : 'ratings'})`,
    '',
  ];

  if (summary.comments.length > 0) {
    lines.push('*Recent Reviews:*');
    for (const c of summary.comments) {
      const ratingStars = '⭐'.repeat(c.rating);
      lines.push(`${ratingStars} "${c.comment}" — ${c.date}`);
    }
    lines.push('');
  }

  lines.push(`_Rate this drug:_\nRATE DRUG ${summary.nafdac_no} [1-5] [comment]`);
  return lines.join('\n');
}

function formatRatingConfirmation(type, name, stars, summary) {
  const starEmoji = '⭐'.repeat(stars);
  return (
    `✅ *Rating saved!*\n\n` +
    `${type}: *${name}*\n` +
    `Your rating: ${starEmoji} ${stars}/5\n\n` +
    `Community average: *${summary.average || stars}/5* (${summary.count} ${summary.count === 1 ? 'person' : 'people'})\n\n` +
    `Thank you for helping Nigerians stay safe! 🇳🇬`
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Simple one-way hash to anonymise phone numbers
 * We never store the actual number
 */
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

module.exports = {
  rateDrug,
  getDrugRatingSummary,
  ratePharmacy,
  getPharmacyRatingSummary,
  getAllPharmacyRatings,
  formatDrugRatingMessage,
  formatRatingConfirmation,
};
