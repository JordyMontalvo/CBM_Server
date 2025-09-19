// Script de prueba simple para verificar CORS
const https = require('https');

const testCors = () => {
  console.log('Probando CORS para diferentes dominios...\n');

  const testCases = [
    {
      name: 'Aplicación Principal',
      origin: 'https://www.cbmundial.com',
      path: '/api/app/dashboard?session=test'
    },
    {
      name: 'Panel de Admin',
      origin: 'https://cbm-admin.vercel.app',
      path: '/api/admin/users?filter=all&page=1&limit=20'
    },
    {
      name: 'Desarrollo Local',
      origin: 'http://localhost:8080',
      path: '/api/app/dashboard?session=test'
    }
  ];

  testCases.forEach((testCase, index) => {
    setTimeout(() => {
      console.log(`\n--- Prueba ${index + 1}: ${testCase.name} ---`);
      
      const options = {
        hostname: 'cbm-server-1-a84e84b849af.herokuapp.com',
        port: 443,
        path: testCase.path,
        method: 'GET',
        headers: {
          'Origin': testCase.origin,
          'User-Agent': 'CORS-Test-Script'
        }
      };

      const req = https.request(options, (res) => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`CORS Headers:`);
        console.log(`- Access-Control-Allow-Origin: ${res.headers['access-control-allow-origin'] || 'No definido'}`);
        console.log(`- Access-Control-Allow-Methods: ${res.headers['access-control-allow-methods'] || 'No definido'}`);
        console.log(`- Access-Control-Allow-Headers: ${res.headers['access-control-allow-headers'] || 'No definido'}`);
        console.log(`- Access-Control-Allow-Credentials: ${res.headers['access-control-allow-credentials'] || 'No definido'}`);
        
        if (res.statusCode === 200) {
          console.log('✅ Petición exitosa');
        } else {
          console.log('❌ Petición falló');
        }
      });

      req.on('error', (e) => {
        console.error(`❌ Error: ${e.message}`);
      });

      req.end();
    }, index * 2000); // Esperar 2 segundos entre pruebas
  });
};

testCors();
