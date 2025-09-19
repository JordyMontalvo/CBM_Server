// Script de prueba para verificar CORS
const https = require('https');

const testCors = async () => {
  const options = {
    hostname: 'cbm-server-1-a84e84b849af.herokuapp.com',
    port: 443,
    path: '/api/admin/users?filter=all&page=1&limit=20',
    method: 'GET',
    headers: {
      'Origin': 'https://cbm-admin.vercel.app',
      'User-Agent': 'CORS-Test-Script'
    }
  };

  const req = https.request(options, (res) => {
    console.log('Status:', res.statusCode);
    console.log('Headers:', res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Response received');
      console.log('CORS Headers:');
      console.log('- Access-Control-Allow-Origin:', res.headers['access-control-allow-origin']);
      console.log('- Access-Control-Allow-Methods:', res.headers['access-control-allow-methods']);
      console.log('- Access-Control-Allow-Headers:', res.headers['access-control-allow-headers']);
      console.log('- Access-Control-Allow-Credentials:', res.headers['access-control-allow-credentials']);
    });
  });

  req.on('error', (e) => {
    console.error('Error:', e.message);
  });

  req.end();
};

console.log('Probando CORS para cbm-admin.vercel.app...');
testCors();
