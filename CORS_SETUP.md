# Configuración de CORS para CBM Server

## Problema Resuelto
Se ha solucionado el error de CORS que impedía que `https://www.cbmundial.com` accediera a la API en `https://cbm-server-1-a84e84b849af.herokuapp.com`.

## Cambios Realizados

### 1. Configuración Centralizada de CORS
- **Archivo**: `components/lib.js`
- **Cambio**: Actualizada la configuración de CORS para incluir los dominios permitidos:
  - `https://www.cbmundial.com` (aplicación principal)
  - `https://cbmundial.com` (dominio alternativo)
  - `https://cbm-admin.vercel.app` (panel de administración)
  - `http://localhost:8080` (desarrollo)
  - `http://localhost:8081` (desarrollo)
  - `http://localhost:3000` (desarrollo)

### 2. Archivos de API Actualizados
- **Archivos modificados**:
  - `pages/api/app/transactions.js`
  - `pages/api/app/directs.js`
  - `pages/api/auxi/imagekit.js`
- **Cambio**: Reemplazado `micro-cors` por el middleware centralizado de CORS

### 3. Configuración de Next.js
- **Archivo**: `next.config.js`
- **Cambio**: Agregados headers CORS globales para todas las rutas de API

### 4. Middleware Personalizado
- **Archivo**: `middleware.js`
- **Propósito**: Middleware adicional para manejar CORS en Next.js

### 5. Configuración de Heroku
- **Archivo**: `app.json`
- **Propósito**: Configuración específica para el despliegue en Heroku

## Headers CORS Configurados
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

## Instrucciones de Despliegue

### Para Heroku:
1. Asegúrate de que todos los archivos estén en el repositorio
2. Ejecuta `git add .`
3. Ejecuta `git commit -m "Fix CORS configuration"`
4. Ejecuta `git push heroku main`

### Para verificar que funciona:
1. Abre las herramientas de desarrollador en el navegador
2. Ve a la pestaña Network
3. Intenta hacer una petición a la API
4. Verifica que no aparezcan errores de CORS

## Notas Importantes
- El servidor debe reiniciarse después de estos cambios
- Si el problema persiste, verifica que el servidor esté ejecutándose con la nueva configuración
- Los cambios son compatibles tanto con desarrollo local como con producción
