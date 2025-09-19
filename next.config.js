/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Aplicar estos headers a todas las rutas de API
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: 'https://www.cbmundial.com, https://cbmundial.com, https://cbm-admin.vercel.app, http://localhost:8080, http://localhost:8081, http://localhost:3000',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, X-Requested-With',
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
        ],
      },
    ]
  },
  // Configuración adicional para producción
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  // Asegurar que las rutas de API funcionen correctamente
  trailingSlash: false,
  // Configuración para Heroku
  output: 'standalone',
}

module.exports = nextConfig
