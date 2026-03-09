/**
 * NAFDAC Greenbook Scraper v4
 * Uses the DataTables JSON API discovered from network inspection
 * API returns 9059 drugs with pagination (100 per page)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DRUGS_FILE = path.join(__dirname, '../data/drugs.json');
const SCRAPE_LOG = path.join(__dirname, '../data/scrape_log.json');
const PAGE_SIZE = 100;
const DELAY_MS = 1500;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchPage(start) {
  return new Promise((resolve, reject) => {
    // Build the DataTables query URL
    const params = new URLSearchParams({
      draw: Math.floor(start / PAGE_SIZE) + 2,
      'columns[0][data]': 'product_name',
      'columns[0][name]': 'product_name',
      'columns[0][searchable]': 'true',
      'columns[0][orderable]': 'true',
      'columns[0][search][value]': '',
      'columns[0][search][regex]': 'false',
      'columns[1][data]': 'ingredient.ingredient_name',
      'columns[1][name]': 'ingredient_name',
      'columns[1][searchable]': 'true',
      'columns[1][orderable]': 'true',
      'columns[1][search][value]': '',
      'columns[1][search][regex]': 'false',
      'columns[2][data]': 'product_category.name',
      'columns[2][name]': 'product_category.name',
      'columns[2][searchable]': 'true',
      'columns[2][orderable]': 'false',
      'columns[2][search][value]': '',
      'columns[2][search][regex]': 'false',
      'columns[3][data]': 'product_category_id',
      'columns[3][name]': 'product_category_id',
      'columns[3][searchable]': 'true',
      'columns[3][orderable]': 'true',
      'columns[3][search][value]': '',
      'columns[3][search][regex]': 'false',
      'columns[4][data]': 'ingredient.synonym',
      'columns[4][name]': 'ingredient.synonym',
      'columns[4][searchable]': 'true',
      'columns[4][orderable]': 'true',
      'columns[4][search][value]': '',
      'columns[4][search][regex]': 'false',
      'columns[5][data]': 'NAFDAC',
      'columns[5][name]': 'NAFDAC',
      'columns[5][searchable]': 'true',
      'columns[5][orderable]': 'true',
      'columns[5][search][value]': '',
      'columns[5][search][regex]': 'false',
      'columns[6][data]': 'form.name',
      'columns[6][name]': 'form.name',
      'columns[6][searchable]': 'true',
      'columns[6][orderable]': 'true',
      'columns[6][search][value]': '',
      'columns[6][search][regex]': 'false',
      'columns[7][data]': 'route.name',
      'columns[7][name]': 'route.name',
      'columns[7][searchable]': 'true',
      'columns[7][orderable]': 'true',
      'columns[7][search][value]': '',
      'columns[7][search][regex]': 'false',
      'columns[8][data]': 'strength',
      'columns[8][name]': 'strength',
      'columns[8][searchable]': 'true',
      'columns[8][orderable]': 'true',
      'columns[8][search][value]': '',
      'columns[8][search][regex]': 'false',
      'columns[9][data]': 'applicant.name',
      'columns[9][name]': 'applicant.name',
      'columns[9][searchable]': 'true',
      'columns[9][orderable]': 'true',
      'columns[9][search][value]': '',
      'columns[9][search][regex]': 'false',
      'order[0][column]': '0',
      'order[0][dir]': 'asc',
      start: start,
      length: PAGE_SIZE,
      'search[value]': '',
      'search[regex]': 'false',
      product_category_id: '1', // Drugs only
    });

    const url = `https://greenbook.nafdac.gov.ng/?${params.toString()}`;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://greenbook.nafdac.gov.ng/',
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch(e) {
          reject(new Error(`JSON parse error at start=${start}: ${data.slice(0, 200)}`));
        }
      });
    }).on('error', reject)
      .setTimeout(30000, function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

function loadExisting() {
  if (!fs.existsSync(DRUGS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DRUGS_FILE, 'utf8')); }
  catch { return []; }
}

function merge(existing, newDrugs) {
  const map = {};
  for (const d of existing) map[d.nafdac_no] = d;
  let added = 0;
  for (const d of newDrugs) {
    if (!map[d.nafdac_no]) { map[d.nafdac_no] = d; added++; }
    else map[d.nafdac_no] = { ...map[d.nafdac_no], ...d };
  }
  return { drugs: Object.values(map), added };
}

async function scrape() {
  console.log('='.repeat(50));
  console.log('NAFDAC Scraper v4 -', new Date().toISOString());
  console.log('='.repeat(50));

  const existing = loadExisting();
  console.log(`Existing: ${existing.length} drugs`);

  // First request to get total count
  console.log('Fetching page 1 to detect total...');
  let firstPage;
  try {
    firstPage = await fetchPage(0);
  } catch(e) {
    console.error('Failed to fetch first page:', e.message);
    return { error: e.message };
  }

  const total = firstPage.recordsTotal || 0;
  console.log(`Total drugs on NAFDAC: ${total}`);

  if (total === 0 || !firstPage.data) {
    console.log('No data returned. API may have changed.');
    return { error: 'No data' };
  }

  const allNew = [];

  // Process first page
  for (const item of firstPage.data) {
    const nrn = (item.NAFDAC || '').trim().toUpperCase();
    if (!nrn || !/^[A-Z0-9]{1,4}-\d{2,7}$/i.test(nrn)) continue;
    allNew.push({
      nafdac_no: nrn,
      drug_name: item.product_name || '',
      active_ingredient: item['ingredient.ingredient_name'] || 
                         (item.ingredient && item.ingredient.ingredient_name) || '',
      form: item['form.name'] || (item.form && item.form.name) || '',
      strength: item.strength || '',
      applicant: item['applicant.name'] || (item.applicant && item.applicant.name) || '',
      status: 'verified',
      source: 'nafdac_greenbook',
    });
  }

  console.log(`Page 1: ${allNew.length} drugs`);

  // Fetch remaining pages
  const totalPages = Math.ceil(total / PAGE_SIZE);
  console.log(`Total pages: ${totalPages}`);

  for (let page = 1; page < totalPages && page < 100; page++) {
    const start = page * PAGE_SIZE;
    try {
      await sleep(DELAY_MS);
      const result = await fetchPage(start);

      if (!result.data || result.data.length === 0) {
        console.log(`Page ${page + 1}: empty, stopping`);
        break;
      }

      let pageCount = 0;
      for (const item of result.data) {
        const nrn = (item.NAFDAC || '').trim().toUpperCase();
        if (!nrn || !/^[A-Z0-9]{1,4}-\d{2,7}$/i.test(nrn)) continue;
        allNew.push({
          nafdac_no: nrn,
          drug_name: item.product_name || '',
          active_ingredient: item['ingredient.ingredient_name'] ||
                             (item.ingredient && item.ingredient.ingredient_name) || '',
          form: item['form.name'] || (item.form && item.form.name) || '',
          strength: item.strength || '',
          applicant: item['applicant.name'] || (item.applicant && item.applicant.name) || '',
          status: 'verified',
          source: 'nafdac_greenbook',
        });
        pageCount++;
      }

      console.log(`Page ${page + 1}/${totalPages}: ${pageCount} drugs (total so far: ${allNew.length})`);

    } catch(e) {
      console.error(`Page ${page + 1} error: ${e.message}`);
      await sleep(DELAY_MS * 2);
    }
  }

  console.log(`\nTotal scraped: ${allNew.length}`);
  const { drugs, added } = merge(existing, allNew);

  fs.writeFileSync(DRUGS_FILE, JSON.stringify(drugs, null, 2));

  const log = {
    last_scrape: new Date().toISOString(),
    last_run: new Date().toISOString(),
    new_drugs_added: added,
    total_in_database: drugs.length,
  };
  fs.writeFileSync(SCRAPE_LOG, JSON.stringify(log, null, 2));

  console.log(`Added: ${added} | Total: ${drugs.length}`);
  console.log('='.repeat(50));
  return log;
}

if (require.main === module) {
  scrape().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { scrape };
