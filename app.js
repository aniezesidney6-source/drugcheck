require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Routes
app.use('/webhook', require('./routes/webhook'));

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'DrugCheck Nigeria is running ✅',
    version: '2.0.0',
    features: ['Drug Verification', 'Pharmacy Finder', 'Community Ratings', 'NAFDAC Auto-Scraper'],
    timestamp: new Date().toISOString(),
  });
});

// Scrape status endpoint
app.get('/scrape-status', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const logFile = path.join(__dirname, 'data/scrape_log.json');
  if (fs.existsSync(logFile)) {
    res.json(JSON.parse(fs.readFileSync(logFile, 'utf8')));
  } else {
    res.json({ status: 'No scrape run yet' });
  }
});

// Manual scrape trigger (protect with a secret in production)
app.post('/scrape-now', async (req, res) => {
  const secret = req.headers['x-scrape-secret'];
  if (secret !== process.env.SCRAPE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { scrapeAllDrugs } = require('./scripts/scrapeNAFDAC');
    res.json({ status: 'Scrape started...' });
    scrapeAllDrugs().then(summary => {
      console.log('Manual scrape complete:', summary);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start scheduler (weekly NAFDAC auto-scrape)
require('./scheduler').init();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DrugCheck Nigeria running on port ${PORT}`);
});
