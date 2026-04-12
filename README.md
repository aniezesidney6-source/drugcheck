# DrugCheck NG

A WhatsApp bot that lets Nigerians verify drug authenticity using NAFDAC data and AI image recognition — built to fight fake drug circulation.

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white)
![Claude API](https://img.shields.io/badge/Claude_API-AI-blueviolet?style=flat)
![Twilio](https://img.shields.io/badge/Twilio-F22F46?style=flat&logo=twilio&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white)

---

## What it does

- Search 8,700+ NAFDAC-registered drugs by name
- Verify drugs by sending a photo — Claude AI reads the label
- Report suspected fake drugs via a multi-step flow
- Lookup drugs by generic name

## Stack

- **Runtime** — Node.js + Express (hosted on Render)
- **Messaging** — Twilio WhatsApp API
- **AI** — Claude API (vision)
- **Data** — Scraped NAFDAC drug database (8,746 entries)

## How to use

Send a WhatsApp message to the bot number and type a drug name or send a photo of the packaging.

---

Built by [Sidney Anieze](https://x.com/Aniezesidney) · Iced Pixels Studio
