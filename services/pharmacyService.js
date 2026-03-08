/**
 * Pharmacy Service — Powered by OpenStreetMap (Overpass API)
 * 100% FREE — No API key, no card, no account needed
 * Works everywhere in Nigeria
 */

const https = require('https');

const RADIUS_METERS = 3000;

function fetchJSON(url, postData = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: postData ? 'POST' : 'GET',
      headers: {
        'User-Agent': 'DrugCheck-Nigeria-Bot/2.0',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON response')); }
      });
    });

    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Request timeout')); });

    if (postData) req.write(postData);
    req.end();
  });
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m away`;
  return `${(meters / 1000).toFixed(1)}km away`;
}

async function findNearbyPharmacies(lat, lng, limit = 5) {
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="pharmacy"](around:${RADIUS_METERS},${lat},${lng});
      node["shop"="chemist"](around:${RADIUS_METERS},${lat},${lng});
      node["healthcare"="pharmacy"](around:${RADIUS_METERS},${lat},${lng});
      way["amenity"="pharmacy"](around:${RADIUS_METERS},${lat},${lng});
    );
    out body center;
  `;

  const postData = `data=${encodeURIComponent(query)}`;
  const data = await fetchJSON('https://overpass-api.de/api/interpreter', postData);

  if (!data.elements || data.elements.length === 0) return [];

  return data.elements
    .map((el) => {
      const elLat = el.lat || el.center?.lat;
      const elLng = el.lon || el.center?.lon;
      const tags = el.tags || {};
      const name = tags.name || tags['name:en'] || tags.brand || 'Pharmacy / Chemist';
      const street = tags['addr:street'] || '';
      const city = tags['addr:city'] || tags['addr:suburb'] || '';
      const address = [street, city].filter(Boolean).join(', ') || 'Address not listed';
      const distanceM = getDistanceMeters(lat, lng, elLat, elLng);

      return {
        osm_id: `${el.type}/${el.id}`,
        name,
        address,
        phone: tags.phone || tags['contact:phone'] || null,
        opening_hours: tags.opening_hours || null,
        distance_meters: Math.round(distanceM),
        distance_text: formatDistance(distanceM),
        lat: elLat,
        lng: elLng,
        maps_url: `https://maps.google.com/?q=${elLat},${elLng}`,
      };
    })
    .sort((a, b) => a.distance_meters - b.distance_meters)
    .slice(0, limit)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

function formatPharmacyMessage(pharmacies, userRatings = []) {
  if (!pharmacies || pharmacies.length === 0) {
    return (
      `🏥 *No pharmacies found nearby*\n\n` +
      `Try searching on Google Maps: _"pharmacy near me"_\n\n` +
      `📍 _Tip: Share your location by tapping the 📎 icon → Location_`
    );
  }

  const ratingMap = {};
  for (const r of userRatings) {
    if (!ratingMap[r.osm_id]) ratingMap[r.osm_id] = [];
    ratingMap[r.osm_id].push(r.rating);
  }

  const lines = [`🏥 *${pharmacies.length} Pharmacies Near You*\n`];

  for (const p of pharmacies) {
    const communityRatings = ratingMap[p.osm_id] || [];
    const communityAvg = communityRatings.length
      ? (communityRatings.reduce((a, b) => a + b, 0) / communityRatings.length).toFixed(1)
      : null;
    const ratingLine = communityAvg
      ? `⭐ ${communityAvg}/5 (${communityRatings.length} ratings)`
      : `⭐ No ratings yet — be the first!`;

    lines.push(
      `*${p.rank}. ${p.name}*\n` +
      `📍 ${p.address} (${p.distance_text})\n` +
      `${ratingLine}\n` +
      (p.phone ? `📞 ${p.phone}\n` : '') +
      (p.opening_hours ? `🕐 ${p.opening_hours}\n` : '') +
      `🗺 ${p.maps_url}\n`
    );
  }

  lines.push(`\n💬 *Rate a pharmacy:*`);
  lines.push(`RATE PHARMACY [number] [1-5] [comment]`);
  lines.push(`_Example: RATE PHARMACY 1 5 Very helpful staff_`);
  lines.push(`\n_Powered by OpenStreetMap • DrugCheck Nigeria_ 💊`);

  return lines.join('\n');
}

module.exports = { findNearbyPharmacies, formatPharmacyMessage };
