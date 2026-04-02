/**
 * reportService.js
 * Handles drug and fake drug reports
 */

const fs = require('fs');
const path = require('path');

const REPORTS_FILE = path.join(__dirname, '../data/reports.json');

function loadReports() {
  if (!fs.existsSync(REPORTS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8')); }
  catch { return []; }
}

function saveReports(reports) {
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2));
}

function addReport(nafdacNo, from, extraData = {}) {
  const reports = loadReports();
  reports.push({
    nafdac_no: nafdacNo,
    reported_by: from,
    reported_at: new Date().toISOString(),
    ...extraData
  });
  saveReports(reports);
}

function getReports(nafdacNo) {
  return loadReports().filter(r => r.nafdac_no === nafdacNo);
}

module.exports = { addReport, getReports };
