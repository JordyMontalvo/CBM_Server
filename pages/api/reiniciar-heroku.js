const axios = require('axios');

export default async function handler(req, res) {
  // Habilitar CORS para desarrollo local y producción
  const allowedOrigins = [
    'https://www.cbmundial.com',
    'https://cbmundial.com',
    'https://cbm-admin.vercel.app',
    'http://localhost:8081',
    'http://localhost:8080',
    'http://localhost:3000'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Manejar preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const HEROKU_APP_NAME = process.env.HEROKU_APP_NAME;
  const HEROKU_API_KEY = process.env.HEROKU_API_KEY;

  try {
    const response = await axios.delete(
      `https://api.heroku.com/apps/${HEROKU_APP_NAME}/dynos`,
      {
        headers: {
          'Accept': 'application/vnd.heroku+json; version=3',
          'Authorization': `Bearer ${HEROKU_API_KEY}`,
        }
      }
    );
    res.status(200).json({ success: true, data: response.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}