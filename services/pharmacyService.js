/**
 * Pharmacy Service — Google Places API
 * Falls back to OpenStreetMap if no API key
 */

const https = require('https');

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const RADIUS = 5000; // 5km

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'DrugCheck-Nigeria/2.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

function fetchOSM(lat, lng, limit) {
  return new Promise((resolve, reject) => {
    const query = `[out:json][timeout:30];(node["amenity"="pharmacy"](around:10000,${lat},${lng});node["shop"="chemist"](around:10000,${lat},${lng});node["healthcare"="pharmacy"](around:10000,${lat},${lng});way["amenity"="pharmacy"](around:10000,${lat},${lng}););out body center;`;
    const postData = `data=${encodeURIComponent(query)}`;
    const req = https.request({
      hostname: 'overpass-api.de',
      path: '/api/interpreter',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'DrugCheck-Nigeria/2.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const R = 6371000;
          const results = (json.elements || []).map(el => {
            const elLat = el.lat || el.center?.lat;
            const elLng = el.lon || el.center?.lon;
            const tags = el.tags || {};
            const dLat = (elLat - lat) * Math.PI / 180;
            const dLon = (elLng - lng) * Math.PI / 180;
            const a = Math.sin(dLat/2)**2 + Math.cos(lat*Math.PI/180)*Math.cos(elLat*Math.PI/180)*Math.sin(dLon/2)**2;
            const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return {
              osm_id: `${el.type}/${el.id}`,
              name: tags.name || tags.brand || 'Pharmacy',
              address: [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', ') || 'Address not listed',
              phone: tags.phone || tags['contact:phone'] || null,
              distance_meters: Math.round(dist),
              distance_text: dist < 1000 ? `${Math.round(dist)}m away` : `${(dist/1000).toFixed(1)}km away`,
              lat: elLat, lng: elLng,
              maps_url: `https://maps.google.com/?q=${elLat},${elLng}`,
              source: 'osm'
            };
          }).sort((a,b) => a.distance_meters - b.distance_meters).slice(0, limit).map((p,i) => ({...p, rank: i+1}));
          resolve(results);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('OSM timeout')); });
    req.write(postData);
    req.end();
  });
}

async function findNearbyPharmacies(lat, lng, limit = 5) {
  if (GOOGLE_API_KEY) {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${RADIUS}&type=pharmacy&key=${GOOGLE_API_KEY}`;
    const data = await fetchJSON(url);
    if (data.status === 'OK' && data.results?.length > 0) {
      return data.results.slice(0, limit).map((p, i) => ({
        rank: i + 1,
        osm_id: p.place_id,
        name: p.name,
        address: p.vicinity || 'Address not available',
        rating: p.rating || null,
        total_ratings: p.user_ratings_total || 0,
        open_now: p.opening_hours?.open_now ?? null,
        distance_text: `Within ${RADIUS/1000}km`,
        lat: p.geometry.location.lat,
        lng: p.geometry.location.lng,
        maps_url: `https://maps.google.com/maps/place/?q=place_id:${p.place_id}`,
        source: 'google'
      }));
    }
  }
  // Fallback to OSM
  return fetchOSM(lat, lng, limit);
}

function formatPharmacyMessage(pharmacies, userRatings = []) {
  if (!pharmacies || pharmacies.length === 0) {
    return (
      `🏥 *No pharmacies found nearby*\n\n` +
      `Try searching on Google Maps: _"pharmacy near me"_\n\n` +
      `📍 _Tip: Share your location by tapping the + icon → Location_`
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
      ? (communityRatings.reduce((a,b) => a+b, 0) / communityRatings.length).toFixed(1)
      : null;

    const googleRating = p.rating ? `⭐ Google: ${p.rating}/5 (${p.total_ratings} reviews)\n` : '';
    const communityLine = communityAvg
      ? `👥 Community: ${communityAvg}/5 (${communityRatings.length} ratings)\n`
      : `👥 No community ratings yet\n`;
    const status = p.open_now === true ? '🟢 Open now\n' : p.open_now === false ? '🔴 Closed\n' : '';

    lines.push(
      `*${p.rank}. ${p.name}*\n` +
      `📍 ${p.address} (${p.distance_text})\n` +
      googleRating +
      communityLine +
      status +
      (p.phone ? `📞 ${p.phone}\n` : '') +
      `🗺 ${p.maps_url}\n`
    );
  }

  lines.push(`\n💬 *Rate a pharmacy:*`);
  lines.push(`RATE PHARMACY [number] [1-5] [comment]`);
  lines.push(`_Example: RATE PHARMACY 1 5 Very helpful staff_`);
  lines.push(`\n_DrugCheck Nigeria_ 💊`);

  return lines.join('\n');
}

module.exports = { findNearbyPharmacies, formatPharmacyMessage };
