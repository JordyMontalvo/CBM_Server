# Correcciones para el Despliegue en Heroku

## Problema Resuelto
Error de compilación en Heroku: `Module not found: Can't resolve '../../components/lib'`

## Causa del Error
El archivo `pages/api/auxi/imagekit.js` tenía una ruta de importación incorrecta:
- **Incorrecto**: `import lib from "../../components/lib"`
- **Correcto**: `import lib from "../../../components/lib"`

## Cambios Realizados

### 1. Corrección de Ruta de Importación
- **Archivo**: `pages/api/auxi/imagekit.js`
- **Cambio**: Corregida la ruta de importación de `../../components/lib` a `../../../components/lib`

### 2. Verificación de Compilación
- ✅ Compilación local exitosa
- ✅ Todas las rutas de API compiladas correctamente
- ✅ Middleware de CORS funcionando

## Estado Actual
- **CORS configurado** para:
  - `https://www.cbmundial.com`
  - `https://cbmundial.com`
  - `https://cbm-admin.vercel.app`
  - Dominios de desarrollo local

- **Compilación**: ✅ Exitosa
- **Rutas de API**: ✅ 47 rutas compiladas correctamente

## Instrucciones de Despliegue

### Para Heroku:
```bash
git add .
git commit -m "Fix import path and CORS configuration"
git push heroku main
```

### Verificación Post-Despliegue:
1. Verificar que el servidor inicie correctamente
2. Probar peticiones desde `https://www.cbmundial.com`
3. Probar peticiones desde `https://cbm-admin.vercel.app`
4. Verificar headers CORS en las respuestas

## Archivos Modificados
- `pages/api/auxi/imagekit.js` - Ruta de importación corregida
- `components/lib.js` - Configuración CORS actualizada
- `pages/api/reiniciar-heroku.js` - CORS para admin panel
- `middleware.js` - Middleware CORS personalizado
- `next.config.js` - Headers CORS globales

## Notas Técnicas
- La compilación local funciona con Node.js v24.4.1
- Heroku usará Node.js v20.x según `package.json`
- Todas las dependencias están actualizadas
- No hay errores de linting
