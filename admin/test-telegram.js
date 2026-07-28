const https = require('https');
const TELEGRAM_BOT_TOKEN = '8086423271:AAHnppYI0Os1KGWOD0JpynQliY7hdVxM3HI';
const TELEGRAM_CHAT_ID = '8262870180';

const postData = JSON.stringify({
  chat_id: TELEGRAM_CHAT_ID,
  text: 'Test message from server',
});

const options = {
  hostname: 'api.telegram.org',
  path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (err) => {
  console.error('Error:', err.message);
});

req.write(postData);
req.end();
