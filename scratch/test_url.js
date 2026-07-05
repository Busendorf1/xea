const https = require('https');

const url = 'https://udgaognmnfsiwvvqvxdq.supabase.co/storage/v1/object/public/ad-media/uploads/1783187155054-43538.jpg';

https.get(url, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  
  let data = [];
  res.on('data', (chunk) => {
    data.push(chunk);
  });
  
  res.on('end', () => {
    const buffer = Buffer.concat(data);
    console.log('Total Bytes Received:', buffer.length);
  });
}).on('error', (err) => {
  console.error('Error:', err);
});
