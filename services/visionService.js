const https = require('https');

async function fetchImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');

    const req = https.get(url, {
      headers: { Authorization: `Basic ${auth}` }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchImageAsBase64(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Image fetch timeout')); });
  });
}

async function extractNAFDACFromImage(imageUrl) {
  const base64Image = await fetchImageAsBase64(imageUrl);

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64Image
            }
          },
          {
            type: 'text',
            text: `This is a Nigerian medicine/drug packaging. Find the NAFDAC Registration Number.

It is usually labeled as one of these:
- "NAFDAC Reg. No."
- "NAFDAC REG. NO."
- "NAFDAC No."
- "Reg. No."

The number format is always: LETTERS/NUMBERS, a DASH, then MORE NUMBERS
Examples of valid NAFDAC numbers:
- C4-0984
- A4-1234
- B1-0023
- 04-3877
- A4-1234L

Look carefully at ALL text in the image, especially small print at the bottom or sides of the packaging.

Reply with ONLY the NAFDAC number (e.g. C4-0984), nothing else.
If you truly cannot find any NAFDAC number, reply with: NOT_FOUND`
          }
        ]
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
          const text = (json.content?.[0]?.text || '').trim().toUpperCase();
          console.log('Vision raw response:', text);

          if (!text || text === 'NOT_FOUND') return resolve(null);

          // Try to extract NAFDAC number pattern — very permissive
          const match = text.match(/([A-Z0-9]{1,4}[-–]\d{2,7}[A-Z]?)/);
          resolve(match ? match[1].replace('–', '-') : null);
        } catch(e) {
          resolve(null);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Claude API timeout')); });
    req.write(body);
    req.end();
  });
}

module.exports = { extractNAFDACFromImage };
