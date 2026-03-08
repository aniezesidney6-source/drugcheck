/**
 * NAFDAC Greenbook Scraper
 * Automatically pulls drug data from greenbook.nafdac.gov.ng
 * Run: node scripts/scrapeNAFDAC.js
 * Schedule (cron): 0 2 * * 0  (every Sunday at 2am)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../data/drugs.json');
const LOG_FILE = path.join(__dirname, '../data/scrape_log.json');
const BASE_URL = 'http://greenbook.nafdac.gov.ng';
const DELAY_MS = 1500; // Be polite — wait 1.5s between requests

// ─── Helpers ────────────────────────────────────────────────────────────────

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'DrugCheck-Nigeria-Bot/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout: ' + url)); });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

/**
 * Parse the drugs list page — extracts product cards
 * Each card looks like:
 *   ##### Drug Name## Tablet
 *   ActiveIngredient
 *   80 mg
 *   NRN: A4-1234
 */
function parseDrugListPage(html) {
  const drugs = [];

  // Match each product block: name + NRN pattern
  // Pattern: ##### ProductName## Form ... NRN: XX-XXXXX
  const blockRegex = /#{3,5}\s+(.*?)##\s*(.*?)\n([\s\S]*?)NRN:\s*([A-Z0-9]+-[\d]+)/g;
  let match;

  while ((match = blockRegex.exec(html)) !== null) {
    const rawName = match[1].trim().replace(/[_*]/g, '').trim();
    const dosageForm = match[2].trim().replace(/\(.*?\)/g, '').trim();
    const body = match[3];
    const nrn = match[4].trim();

    // Extract active ingredient (first non-empty line in body)
    const bodyLines = body.split('\n').map(l => l.trim()).filter(Boolean);
    const activeIngredient = bodyLines[0] || 'Unknown';

    // Extract strength (lines with mg, mL, %, IU, mcg)
    const strengthLine = bodyLines.find(l => /\d+\s*(mg|mL|%|IU|mcg|g\/|MU)/i.test(l));
    const strength = strengthLine ? strengthLine.trim() : 'See packaging';

    if (rawName && nrn) {
      drugs.push({
        drug_name: rawName,
        nafdac_no: nrn,
        active_ingredient: activeIngredient,
        dosage_form: dosageForm || 'Unknown',
        strength: strength,
        status: 'verified',
        source: 'NAFDAC Greenbook',
      });
    }
  }

  return drugs;
}

/**
 * Detect total pages from pagination HTML
 * Looks for the last page number link
 */
function detectTotalPages(html) {
  // Pattern: [44](url?page=44) — last page number in pagination
  const pageLinks = [...html.matchAll(/\[(\d+)\]\(.*?page=(\d+)\)/g)];
  if (pageLinks.length === 0) return 1;
  const numbers = pageLinks.map(m => parseInt(m[2]));
  return Math.max(...numbers);
}

// ─── Main Scraper ─────────────────────────────────────────────────────────────

async function scrapeAllDrugs() {
  log('Starting NAFDAC Greenbook scrape...');
  const startTime = Date.now();

  // Load existing data so we can merge (don't lose manual entries)
  let existingDrugs = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      existingDrugs = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      log(`Loaded ${existingDrugs.length} existing drugs from database`);
    } catch (e) {
      log('Could not parse existing drugs.json, starting fresh');
    }
  }

  // Build a map of existing NRNs so we don't duplicate
  const existingNRNs = new Set(existingDrugs.map(d => d.nafdac_no));

  // Step 1: Detect total pages
  log('Fetching page 1 to detect total pages...');
  const firstPageHtml = await fetchPage(`${BASE_URL}/productCategory/products/1`);
  const totalPages = detectTotalPages(firstPageHtml);
  log(`Detected ${totalPages} pages of drugs`);

  // Step 2: Scrape page 1 results
  const scrapedDrugs = parseDrugListPage(firstPageHtml);
  log(`Page 1: found ${scrapedDrugs.length} drugs`);

  // Step 3: Scrape remaining pages
  for (let page = 2; page <= totalPages; page++) {
    await sleep(DELAY_MS);
    try {
      const url = `${BASE_URL}/productCategory/products/1?page=${page}`;
      const html = await fetchPage(url);
      const pageDrugs = parseDrugListPage(html);
      scrapedDrugs.push(...pageDrugs);
      log(`Page ${page}/${totalPages}: found ${pageDrugs.length} drugs (total: ${scrapedDrugs.length})`);
    } catch (err) {
      log(`ERROR on page ${page}: ${err.message} — skipping`);
    }
  }

  // Step 4: Merge new drugs into existing database
  let newCount = 0;
  let updatedCount = 0;

  for (const drug of scrapedDrugs) {
    if (!existingNRNs.has(drug.nafdac_no)) {
      existingDrugs.push(drug);
      existingNRNs.add(drug.nafdac_no);
      newCount++;
    } else {
      // Update existing entry with fresh data (but keep manual fields like ratings)
      const idx = existingDrugs.findIndex(d => d.nafdac_no === drug.nafdac_no);
      if (idx !== -1) {
        existingDrugs[idx] = { ...existingDrugs[idx], ...drug };
        updatedCount++;
      }
    }
  }

  // Step 5: Assign sequential IDs to any entries missing one
  existingDrugs = existingDrugs.map((drug, i) => ({
    id: drug.id || i + 1,
    ...drug,
    created_at: drug.created_at || new Date().toISOString().split('T')[0],
  }));

  // Step 6: Save to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existingDrugs, null, 2));

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = {
    last_run: new Date().toISOString(),
    duration_seconds: parseFloat(duration),
    pages_scraped: totalPages,
    total_scraped: scrapedDrugs.length,
    new_drugs_added: newCount,
    drugs_updated: updatedCount,
    total_in_database: existingDrugs.length,
  };

  // Save scrape log
  fs.writeFileSync(LOG_FILE, JSON.stringify(summary, null, 2));

  log('─────────────────────────────────────');
  log(`✅ Scrape complete in ${duration}s`);
  log(`   Pages scraped: ${totalPages}`);
  log(`   Total found on site: ${scrapedDrugs.length}`);
  log(`   New drugs added: ${newCount}`);
  log(`   Existing drugs updated: ${updatedCount}`);
  log(`   Total in database: ${existingDrugs.length}`);
  log(`   Saved to: ${OUTPUT_FILE}`);
  log('─────────────────────────────────────');

  return summary;
}

// Run if called directly
if (require.main === module) {
  scrapeAllDrugs().catch(err => {
    console.error('Fatal scrape error:', err);
    process.exit(1);
  });
}

module.exports = { scrapeAllDrugs };
