/**
 * pharmacyService.js
 * Finds nearby pharmacies using Google Places API
 */

const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject)
      .setTimeout(15000, function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

async function findNearbyPharmacies(lat, lon) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    console.error('GOOGLE_PLACES_API_KEY not set');
    return [];
  }

  // Step 1: Search for nearby pharmacies
  const searchUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
    `location=${lat},${lon}&radius=5000&type=pharmacy&key=${apiKey}`;

  const searchResult = await fetchJSON(searchUrl);

  if (!searchResult.results || searchResult.results.length === 0) {
    // Fallback: text search
    const textUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?` +
      `query=pharmacy&location=${lat},${lon}&radius=5000&key=${apiKey}`;
    const textResult = await fetchJSON(textUrl);
    if (!textResult.results || textResult.results.length === 0) return [];
    searchResult.results = textResult.results;
  }

  // Step 2: Get details for each pharmacy (to get full address, phone, hours)
  const pharmacies = [];
  const top5 = searchResult.results.slice(0, 5);

  for (const place of top5) {
    try {
      const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?` +
        `place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,opening_hours,rating,geometry&key=${apiKey}`;

      const detail = await fetchJSON(detailUrl);
      const p = detail.result || {};

      // Calculate distance
      const dist = getDistance(lat, lon,
        place.geometry?.location?.lat || p.geometry?.location?.lat,
        place.geometry?.location?.lng || p.geometry?.location?.lng
      );

      pharmacies.push({
        name: p.name || place.name || 'Unknown Pharmacy',
        address: p.formatted_address || place.vicinity || 'Address not available',
        phone: p.formatted_phone_number || null,
        rating: p.rating || place.rating || null,
        open_now: p.opening_hours?.open_now,
        distance: dist ? `${dist} km away` : null,
        place_id: place.place_id,
        osm_id: place.place_id,
      });
    } catch(e) {
      // If detail fetch fails, use basic info
      pharmacies.push({
        name: place.name || 'Unknown Pharmacy',
        address: place.vicinity || 'Address not available',
        phone: null,
        rating: place.rating || null,
        open_now: null,
        distance: null,
        place_id: place.place_id,
        osm_id: place.place_id,
      });
    }
  }

  return pharmacies;
}

function getDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return (R * c).toFixed(1);
}

function deg2rad(deg) { return deg * (Math.PI/180); }

module.exports = { findNearbyPharmacies };
