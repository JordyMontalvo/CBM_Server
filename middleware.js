// Middleware de CORS personalizado para Next.js
export function middleware(req, res) {
  // Configurar headers CORS
  const allowedOrigins = [
    'https://www.cbmundial.com',
    'https://cbmundial.com',
    'https://cbm-admin.vercel.app',
    'http://localhost:8080',
    'http://localhost:8081',
    'http://localhost:3000'
  ];

  const origin = req.headers.origin || req.headers.host;
  
  if (allowedOrigins.some(allowedOrigin => 
    origin === allowedOrigin || 
    origin?.includes(allowedOrigin.replace('https://', '').replace('http://', ''))
  )) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 horas

  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
}

export const config = {
  matcher: '/api/:path*',
}
