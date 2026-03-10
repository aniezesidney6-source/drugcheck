/**
 * Drug Info Service
 * Uses Claude AI to return drug information by generic name
 */

const https = require('https');

async function getDrugInfo(drugName) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `You are a Nigerian pharmacist assistant. Give concise, accurate information about the drug: "${drugName}"

Reply in this EXACT format (no markdown, no asterisks in values):
NAME: [official drug name]
USE: [what it treats in 1 sentence]
DOSAGE: [standard adult dosage]
SIDE_EFFECTS: [2-3 common side effects]
WARNING: [most important warning]
PRESCRIPTION: [Yes or No]

If this is not a real drug or medication, reply with exactly: NOT_A_DRUG`
      }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = (json.content?.[0]?.text || '').trim();
          if (text === 'NOT_A_DRUG') return resolve(null);

          // Parse the structured response
          const lines = text.split('\n');
          const result = {};
          for (const line of lines) {
            const [key, ...rest] = line.split(':');
            if (key && rest.length) result[key.trim()] = rest.join(':').trim();
          }

          if (!result.NAME) return resolve(null);
          resolve(result);
        } catch(e) {
          resolve(null);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

module.exports = { getDrugInfo };
