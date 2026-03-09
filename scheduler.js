/**
 * scheduler.js
 * Auto-runs the NAFDAC scraper every Sunday at 2:00 AM
 * This file is loaded by app.js on server start
 * 
 * Uses node-cron (install: npm install node-cron)
 * Cron syntax: minute hour day-of-month month day-of-week
 *   0 2 * * 0  = Every Sunday at 2:00 AM
 */

let cron;
try {
  cron = require('node-cron');
} catch {
  console.warn('[Scheduler] node-cron not installed. Run: npm install node-cron');
  module.exports = { init: () => {} };
  return;
}

const { scrape: scrapeAllDrugs } = require('./scripts/scrapeNAFDAC');

function init() {
  // Weekly scrape — Sunday 2am
  cron.schedule('0 2 * * 0', async () => {
    console.log('[Scheduler] Starting weekly NAFDAC scrape...');
    try {
      const summary = await scrapeAllDrugs();
      console.log(`[Scheduler] Scrape complete: ${summary.new_drugs_added} new drugs added`);
    } catch (err) {
      console.error('[Scheduler] Scrape failed:', err.message);
    }
  }, {
    timezone: 'Africa/Lagos'
  });

  // Also run once 60 seconds after server start (to catch up if missed)
  setTimeout(async () => {
    const fs = require('fs');
    const path = require('path');
    const logFile = path.join(__dirname, 'data/scrape_log.json');

    // Only auto-run if last scrape was more than 7 days ago
    let shouldRun = true;
    if (fs.existsSync(logFile)) {
      try {
        const log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        const lastRun = new Date(log.last_run);
        const daysSince = (Date.now() - lastRun) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
          console.log(`[Scheduler] Last scrape was ${daysSince.toFixed(1)} days ago — skipping startup scrape`);
          shouldRun = false;
        }
      } catch {}
    }

    if (shouldRun) {
      console.log('[Scheduler] Running startup scrape (no recent scrape found)...');
      try {
        await scrapeAllDrugs();
      } catch (err) {
        console.error('[Scheduler] Startup scrape failed:', err.message);
      }
    }
  }, 60 * 1000);

  console.log('[Scheduler] NAFDAC scraper scheduled — every Sunday at 2:00 AM (Lagos time)');
}

module.exports = { init };
