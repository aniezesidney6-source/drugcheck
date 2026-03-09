# 💊 DrugCheck Nigeria — WhatsApp Drug Verification Bot

A production-ready MVP that lets everyday Nigerians verify drug safety via WhatsApp by sending a NAFDAC registration number. Built with Node.js, Express, and Twilio.

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Bot Commands & Flow](#bot-commands--flow)
3. [Project Structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Local Setup](#local-setup)
6. [Twilio Sandbox Configuration](#twilio-sandbox-configuration)
7. [Expose Local Server with ngrok](#expose-local-server-with-ngrok)
8. [Running Tests](#running-tests)
9. [Sample Test Messages & Expected Replies](#sample-test-messages--expected-replies)
10. [API Flow Summary](#api-flow-summary)
11. [Deploying to Render](#deploying-to-render)
12. [Deploying to Railway](#deploying-to-railway)
13. [Upgrading to Supabase](#upgrading-to-supabase)
14. [Environment Variables Reference](#environment-variables-reference)

---

## What It Does

Users send a NAFDAC registration number (e.g. `A4-1234`) via WhatsApp. The bot checks the database and replies with one of three statuses:

| Status      | Meaning                                      |
|-------------|----------------------------------------------|
| VERIFIED ✅ | Drug is registered and safe to purchase      |
| NOT FOUND ⚠️ | Number not in database — do not use          |
| SUSPICIOUS ❌ | Drug is flagged as fake or unregistered     |

Users can also:
- Type `HELP` to see usage instructions
- Type `REPORT A4-1234` to flag a suspicious drug

---

## Bot Commands & Flow

```
User:  Hi
Bot:   👋 Welcome to DrugCheck Nigeria 💊
       Send your NAFDAC number to verify a drug.
       Example: A4-1234

User:  A4-1234
Bot:   ✅ DRUG VERIFIED
       💊 Drug: Amoxicillin 500mg Capsules
       🔖 NAFDAC No: A4-1234
       🏭 Manufacturer: Emzor Pharmaceutical Industries Ltd
       📊 Status: VERIFIED ✅
       ✔️ Always buy from a licensed pharmacy.

User:  HELP
Bot:   🆘 DrugCheck Nigeria — Help
       Here's what you can do: ...

User:  REPORT X0-1111
Bot:   📢 Report Received
       Your report has been saved for review.
```

---

## Project Structure

```
drugcheck-nigeria/
│
├── app.js                    # Express server entry point
├── package.json
├── .env.example              # Environment variable template
├── .gitignore
│
├── routes/
│   └── webhook.js            # POST /webhook — Twilio message handler
│
├── services/
│   ├── drugLookup.js         # NAFDAC number normalization + database query
│   ├── reportService.js      # Save and retrieve user reports
│   ├── messageBuilder.js     # All bot response strings
│   └── logger.js             # Structured console logging
│
├── data/
│   ├── drugs.json            # Mock drug database (18 drugs, mixed statuses)
│   └── reports.json          # Stores user-submitted suspicious drug reports
│
└── tests/
    └── test.js               # Unit tests (no Twilio/network needed)
```

---

## Prerequisites

- **Node.js** v16 or higher → https://nodejs.org
- **npm** v8 or higher (comes with Node)
- A free **Twilio account** → https://twilio.com
- **ngrok** (for local testing) → https://ngrok.com

---

## Local Setup

### Step 1 — Clone / Download

```bash
git clone https://github.com/yourname/drugcheck-nigeria.git
cd drugcheck-nigeria
```

### Step 2 — Install Dependencies

```bash
npm install
```

### Step 3 — Create Your .env File

```bash
cp .env.example .env
```

Open `.env` and fill in your Twilio credentials (see [Environment Variables Reference](#environment-variables-reference)).

### Step 4 — Start the Server

```bash
# Production start
npm start

# Development (auto-restarts on file changes — requires nodemon)
npm run dev
```

You should see:

```
════════════════════════════════════════════
  DrugCheck Nigeria — WhatsApp Bot Server
  Running on http://localhost:3000
  Webhook URL: http://localhost:3000/webhook
════════════════════════════════════════════
```

### Step 5 — Verify It's Running

Open your browser or run:

```bash
curl http://localhost:3000
```

Expected response:
```json
{
  "status": "ok",
  "app": "DrugCheck Nigeria",
  "version": "1.0.0"
}
```

---

## Twilio Sandbox Configuration

The **Twilio WhatsApp Sandbox** lets you test WhatsApp messaging without a dedicated business number.

### Step 1 — Log into Twilio Console

Go to: https://console.twilio.com

### Step 2 — Navigate to WhatsApp Sandbox

Go to: **Messaging → Try it out → Send a WhatsApp Message**

Or go directly to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn

### Step 3 — Connect Your Phone

You'll see a sandbox number (e.g. `+1 415 523 8886`) and a join code (e.g. `join bright-horse`).

Send that exact message from your WhatsApp to the sandbox number to activate it.

### Step 4 — Set the Webhook URL

In the sandbox settings, find the field:

> **When a message comes in**

Set it to your public webhook URL:

```
https://YOUR_DOMAIN/webhook
```

For local testing, this will be your ngrok URL (see next section).

Make sure the method is set to **HTTP POST**.

Click **Save**.

---

## Expose Local Server with ngrok

Twilio needs a **public URL** to reach your local server. ngrok creates a secure tunnel.

### Step 1 — Install ngrok

Download from https://ngrok.com/download or:

```bash
npm install -g ngrok
```

### Step 2 — Start ngrok

```bash
ngrok http 3000
```

You'll see output like:

```
Forwarding   https://a1b2c3d4.ngrok-free.app → http://localhost:3000
```

### Step 3 — Update Twilio Webhook

Copy the `https://` URL from ngrok and set it in Twilio:

```
https://a1b2c3d4.ngrok-free.app/webhook
```

> ⚠️ **Important:** Every time you restart ngrok, you get a new URL. Update Twilio each time.

---

## Running Tests

Tests run entirely locally — no Twilio or internet connection needed.

```bash
node tests/test.js
```

Expected output:
```
══════════════════════════════════════════════
   DrugCheck Nigeria — Test Suite
══════════════════════════════════════════════

1. NAFDAC Number Normalization
  ✅ PASS  Lowercase with space: 'a4 1234' → 'A4-1234'
  ✅ PASS  Underscore separator: 'B2_5678' → 'B2-5678'
  ...

  Results: 23 passed  0 failed
══════════════════════════════════════════════
```

---

## Sample Test Messages & Expected Replies

You can simulate webhook calls with curl:

```bash
# Simulate "Hi" greeting
curl -X POST http://localhost:3000/webhook \
  -d "From=whatsapp:+2348012345678" \
  -d "Body=Hi"

# Verify a known drug
curl -X POST http://localhost:3000/webhook \
  -d "From=whatsapp:+2348012345678" \
  -d "Body=A4-1234"

# Verify suspicious drug
curl -X POST http://localhost:3000/webhook \
  -d "From=whatsapp:+2348012345678" \
  -d "Body=X0-1111"

# Unknown NAFDAC number
curl -X POST http://localhost:3000/webhook \
  -d "From=whatsapp:+2348012345678" \
  -d "Body=Z1-9999"

# Invalid format
curl -X POST http://localhost:3000/webhook \
  -d "From=whatsapp:+2348012345678" \
  -d "Body=fakeinput"

# Help command
curl -X POST http://localhost:3000/webhook \
  -d "From=whatsapp:+2348012345678" \
  -d "Body=HELP"

# Report command
curl -X POST http://localhost:3000/webhook \
  -d "From=whatsapp:+2348012345678" \
  -d "Body=REPORT X0-1111"
```

### Expected Replies

| Input       | Expected Status       |
|-------------|-----------------------|
| `Hi`        | Welcome message       |
| `A4-1234`   | VERIFIED ✅           |
| `B2-5678`   | VERIFIED ✅           |
| `X0-1111`   | SUSPICIOUS ❌         |
| `Z9-9999`   | SUSPICIOUS ❌         |
| `Z1-9999`   | NOT FOUND ⚠️          |
| `HELP`      | Help menu             |
| `REPORT X0-1111` | Report confirmation |
| `blabla`    | Invalid format prompt |
| `hello`     | Welcome message       |

### Sample Drug Numbers in Mock Database

| NAFDAC No   | Drug                    | Status      |
|-------------|-------------------------|-------------|
| A4-1234     | Amoxicillin 500mg       | verified    |
| B2-5678     | Paracetamol 500mg       | verified    |
| C7-9012     | Metronidazole 400mg     | verified    |
| D3-3456     | Artemether/Lumefantrine | verified    |
| E1-7890     | Lisinopril 10mg         | verified    |
| F5-2345     | Ciprofloxacin 500mg     | verified    |
| G6-6789     | Omeprazole 20mg         | verified    |
| H9-0123     | Diclofenac 50mg         | verified    |
| A9-8888     | Metformin 500mg         | verified    |
| B1-3333     | Amlodipine 5mg          | verified    |
| C4-7777     | Azithromycin 250mg      | verified    |
| D8-2222     | Ibuprofen 400mg         | verified    |
| E3-5555     | Cotrimoxazole 480mg     | verified    |
| X0-1111     | SuperVit Multivitamin   | suspicious  |
| Z9-9999     | CleanFlu Capsules       | suspicious  |
| Y7-4567     | PowerBoost Tablets      | suspicious  |
| Q3-0000     | FakeHeal Herbal Mix     | suspicious  |
| W2-6666     | NaijaBoost Immunity     | suspicious  |

---

## API Flow Summary

```
User (WhatsApp)
      │
      │  Sends message: "A4-1234"
      ▼
Twilio WhatsApp API
      │
      │  POST /webhook
      │  Body=A4-1234&From=whatsapp:+234...
      ▼
Express Server (app.js)
      │
      │  routes/webhook.js
      │  ├─ Parse Body + From
      │  ├─ Detect intent (greeting / HELP / REPORT / NAFDAC)
      │  └─ Call lookupDrug("A4-1234")
      │
      ▼
services/drugLookup.js
      │
      │  normalizeNafdacNo("A4-1234") → "A4-1234"
      │  isValidNafdacFormat("A4-1234") → true
      │  Search drugs.json for nafdac_no === "A4-1234"
      │  Found → { status: "verified", drug: {...} }
      │
      ▼
services/messageBuilder.js
      │
      │  verifiedMessage(drug) → formatted reply string
      │
      ▼
services/logger.js
      │  logVerification(from, raw, normalized, "verified")
      │
      ▼
TwiML Response (XML)
      │
      │  <?xml version="1.0"?>
      │  <Response><Message>✅ DRUG VERIFIED...</Message></Response>
      │
      ▼
Twilio → Sends reply to User's WhatsApp
```

---

## Deploying to Render

Render is a simple, free-tier-friendly cloud platform.

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: DrugCheck Nigeria"
git remote add origin https://github.com/yourname/drugcheck-nigeria.git
git push -u origin main
```

### Step 2 — Create New Web Service on Render

1. Go to https://render.com → Log in
2. Click **New → Web Service**
3. Connect your GitHub repo
4. Fill in settings:
   - **Name:** `drugcheck-nigeria`
   - **Region:** Choose closest to Nigeria (e.g. Frankfurt)
   - **Branch:** `main`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

### Step 3 — Add Environment Variables

In the Render dashboard → **Environment** tab, add:

```
TWILIO_ACCOUNT_SID    = ACxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN     = your_token
TWILIO_WHATSAPP_FROM  = whatsapp:+14155238886
NODE_ENV              = production
```

### Step 4 — Deploy

Click **Create Web Service**. Render will build and deploy.

Your live URL will be:
```
https://drugcheck-nigeria.onrender.com
```

### Step 5 — Update Twilio Webhook

Set Twilio webhook to:
```
https://drugcheck-nigeria.onrender.com/webhook
```

> ⚠️ **Note:** Free Render services spin down after 15 minutes of inactivity. The first request after sleep takes ~30 seconds. Upgrade to a paid plan for production use.

---

## Deploying to Railway

Railway is fast and developer-friendly with a generous free tier.

### Step 1 — Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### Step 2 — Deploy

```bash
cd drugcheck-nigeria
railway init
railway up
```

### Step 3 — Add Environment Variables

```bash
railway variables set TWILIO_ACCOUNT_SID=ACxxxxxxxx
railway variables set TWILIO_AUTH_TOKEN=your_token
railway variables set TWILIO_WHATSAPP_FROM="whatsapp:+14155238886"
railway variables set NODE_ENV=production
```

### Step 4 — Get Your Live URL

```bash
railway domain
```

Update your Twilio webhook to:
```
https://your-project.up.railway.app/webhook
```

---

## Upgrading to Supabase

When you're ready to replace `drugs.json` with a real database:

### 1. Create a Supabase Project

Go to https://supabase.com → New Project

### 2. Create the `drugs` Table

```sql
CREATE TABLE drugs (
  id           SERIAL PRIMARY KEY,
  drug_name    TEXT NOT NULL,
  nafdac_no    TEXT UNIQUE NOT NULL,
  manufacturer TEXT,
  status       TEXT CHECK (status IN ('verified', 'suspicious')) NOT NULL,
  dosage_form  TEXT,
  strength     TEXT,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE reports (
  id           SERIAL PRIMARY KEY,
  phone_number TEXT,
  nafdac_no    TEXT,
  message      TEXT,
  timestamp    TIMESTAMP DEFAULT NOW()
);
```

### 3. Install Supabase Client

```bash
npm install @supabase/supabase-js
```

### 4. Update drugLookup.js

Replace the `fs.readFileSync` section with:

```javascript
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function lookupDrug(rawInput) {
  const normalizedNo = normalizeNafdacNo(rawInput);
  if (!isValidNafdacFormat(normalizedNo)) {
    return { status: "invalid_format", drug: null, normalizedNo };
  }

  const { data, error } = await supabase
    .from("drugs")
    .select("*")
    .ilike("nafdac_no", normalizedNo)
    .single();

  if (error || !data) return { status: "not_found", drug: null, normalizedNo };
  return { status: data.status, drug: data, normalizedNo };
}
```

Don't forget to make `webhook.js` `async` and `await` the `lookupDrug` call.

---

## Environment Variables Reference

| Variable               | Required | Description                                      |
|------------------------|----------|--------------------------------------------------|
| `PORT`                 | No       | Server port (default: 3000). Auto-set by hosting.|
| `TWILIO_ACCOUNT_SID`   | Yes      | Twilio Account SID from the Twilio Console       |
| `TWILIO_AUTH_TOKEN`    | Yes      | Twilio Auth Token from the Twilio Console        |
| `TWILIO_WHATSAPP_FROM` | Yes      | Your sandbox WhatsApp number with prefix         |
| `NODE_ENV`             | No       | `development` or `production`                    |
| `SUPABASE_URL`         | Optional | Supabase project URL (for future migration)      |
| `SUPABASE_ANON_KEY`    | Optional | Supabase anonymous key (for future migration)    |

---

## Disclaimer

DrugCheck Nigeria is a **verification aid only**. It does not provide medical diagnoses or prescriptions. Always consult a licensed pharmacist or doctor for medical decisions.

For official NAFDAC inquiries:
- 📞 Hotline: 0800-162-3322
- 🌐 Website: www.nafdac.gov.ng

---

*Built with ❤️ by Iced Pixels Studio*
