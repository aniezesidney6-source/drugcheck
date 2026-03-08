/**
 * tests/test_standalone.js
 * Tests core logic only (no npm packages required).
 * Run with: node tests/test_standalone.js
 */

// ── Inline the normalize logic for standalone testing ──────────────────────────

function normalizeNafdacNo(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s_\.]+/g, "-")
    .replace(/[^A-Z0-9\-]/g, "")
    .replace(/-+/g, "-");
}

function isValidNafdacFormat(normalized) {
  const pattern = /^[A-Z]{1,3}[0-9]{1,3}-[0-9]{3,6}$/;
  return pattern.test(normalized);
}

// ── Test runner ────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log(`  ✅ PASS  ${desc}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL  ${desc}`);
    failed++;
  }
}

console.log("\n══════════════════════════════════════════════");
console.log("   DrugCheck Nigeria — Standalone Test Suite");
console.log("══════════════════════════════════════════════\n");

console.log("1. NAFDAC Number Normalization");
assert("'a4 1234' → 'A4-1234'",        normalizeNafdacNo("a4 1234") === "A4-1234");
assert("'B2_5678' → 'B2-5678'",        normalizeNafdacNo("B2_5678") === "B2-5678");
assert("'  c7-9012  ' → 'C7-9012'",    normalizeNafdacNo("  c7-9012  ") === "C7-9012");
assert("'D3-3456' → 'D3-3456'",        normalizeNafdacNo("D3-3456") === "D3-3456");
assert("'E1.7890' → 'E1-7890'",        normalizeNafdacNo("E1.7890") === "E1-7890");
assert("'hello' → 'HELLO'",            normalizeNafdacNo("hello") === "HELLO");
assert("'' → ''",                      normalizeNafdacNo("") === "");

console.log("\n2. NAFDAC Format Validation");
assert("'A4-1234' → valid",            isValidNafdacFormat("A4-1234") === true);
assert("'AB12-56789' → valid",         isValidNafdacFormat("AB12-56789") === true);
assert("'HELLO' → invalid",            isValidNafdacFormat("HELLO") === false);
assert("'1234' → invalid",             isValidNafdacFormat("1234") === false);
assert("'' → invalid",                 isValidNafdacFormat("") === false);
assert("'A-123' → invalid (needs digit before hyphen)", isValidNafdacFormat("A-123") === false);

console.log("\n3. Intent Detection (greeting keywords)");
const GREETINGS = ["hi", "hello", "hey", "start", "helo"];
const isGreeting = (t) => GREETINGS.includes(t.toLowerCase().trim());
assert("'Hi' is greeting",             isGreeting("Hi") === true);
assert("'hello' is greeting",          isGreeting("hello") === true);
assert("'A4-1234' is not greeting",    isGreeting("A4-1234") === false);
assert("'REPORT X' is not greeting",   isGreeting("REPORT X") === false);

console.log("\n4. Report Command Parsing");
function parseReport(text) {
  const upper = text.trim().toUpperCase();
  if (!upper.startsWith("REPORT")) return { isReport: false, nafdacNo: "" };
  const parts = text.trim().split(/\s+/);
  return { isReport: true, nafdacNo: parts.slice(1).join(" ") };
}
assert("'REPORT A4-1234' → isReport: true, nafdacNo: 'A4-1234'",
  parseReport("REPORT A4-1234").isReport === true &&
  parseReport("REPORT A4-1234").nafdacNo === "A4-1234");
assert("'REPORT' alone → isReport: true, nafdacNo: ''",
  parseReport("REPORT").isReport === true &&
  parseReport("REPORT").nafdacNo === "");
assert("'HELP' → isReport: false",
  parseReport("HELP").isReport === false);

console.log("\n5. Data Integrity (drugs.json)");
const fs = require("fs");
const path = require("path");
const drugs = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/drugs.json"), "utf-8"));
assert("drugs.json has 18 entries",            drugs.length === 18);
assert("All entries have nafdac_no field",      drugs.every(d => d.nafdac_no));
assert("All entries have drug_name field",      drugs.every(d => d.drug_name));
assert("All entries have valid status",         drugs.every(d => ["verified","suspicious"].includes(d.status)));
assert("At least 10 verified drugs",            drugs.filter(d => d.status === "verified").length >= 10);
assert("At least 4 suspicious drugs",           drugs.filter(d => d.status === "suspicious").length >= 4);
assert("A4-1234 exists and is verified",        drugs.find(d => d.nafdac_no === "A4-1234")?.status === "verified");
assert("X0-1111 exists and is suspicious",      drugs.find(d => d.nafdac_no === "X0-1111")?.status === "suspicious");

console.log("\n══════════════════════════════════════════════");
console.log(`  Results: ${passed} passed  ${failed} failed`);
console.log("══════════════════════════════════════════════\n");

if (failed > 0) process.exit(1);
