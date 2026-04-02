const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse failed')); }
      });
    }).on('error', reject)
      .setTimeout(10000, function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

function getDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1);
}

async function findNearbyPharmacies(lat, lon) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('[Pharmacy] No API key');
    return [];
  }

  console.log(`[Pharmacy] Searching near ${lat},${lon}`);

  const searchUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
    `location=${lat},${lon}&radius=5000&type=pharmacy&key=${apiKey}`;

  let searchResult;
  try {
    searchResult = await fetchJSON(searchUrl);
    console.log(`[Pharmacy] Status: ${searchResult.status}, Found: ${searchResult.results?.length || 0}`);
  } catch(e) {
    console.error('[Pharmacy] Search failed:', e.message);
    return [];
  }

  if (searchResult.status !== 'OK' || !searchResult.results?.length) {
    console.log('[Pharmacy] No results, trying text search...');
    try {
      const textUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?` +
        `query=pharmacy+near+me&location=${lat},${lon}&radius=5000&key=${apiKey}`;
      searchResult = await fetchJSON(textUrl);
      console.log(`[Pharmacy] Text search: ${searchResult.status}, ${searchResult.results?.length || 0} results`);
    } catch(e) {
      console.error('[Pharmacy] Text search failed:', e.message);
      return [];
    }
  }

  if (!searchResult.results?.length) return [];

  const top5 = searchResult.results.slice(0, 5);

  // Fetch all details in PARALLEL (faster)
  const detailPromises = top5.map(async (place) => {
    try {
      const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?` +
        `place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,opening_hours,rating,geometry&key=${apiKey}`;
      const detail = await fetchJSON(detailUrl);
      const p = detail.result || {};

      const pLat = p.geometry?.location?.lat || place.geometry?.location?.lat;
      const pLon = p.geometry?.location?.lng || place.geometry?.location?.lng;
      const dist = getDistance(lat, lon, pLat, pLon);

      return {
        name: p.name || place.name,
        address: p.formatted_address || place.vicinity || 'See Google Maps',
        phone: p.formatted_phone_number || null,
        rating: p.rating || place.rating || null,
        open_now: p.opening_hours?.open_now ?? null,
        distance: dist ? `${dist} km away` : null,
        place_id: place.place_id,
        osm_id: place.place_id,
      };
    } catch(e) {
      // Fallback to basic info if details fail
      return {
        name: place.name,
        address: place.vicinity || 'See Google Maps',
        phone: null,
        rating: place.rating || null,
        open_now: null,
        distance: null,
        place_id: place.place_id,
        osm_id: place.place_id,
      };
    }
  });

  const pharmacies = await Promise.all(detailPromises);
  console.log(`[Pharmacy] Returning ${pharmacies.length} pharmacies`);
  return pharmacies;
}

module.exports = { findNearbyPharmacies };
