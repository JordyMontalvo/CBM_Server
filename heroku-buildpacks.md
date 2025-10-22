# Configuración de Buildpacks para Heroku

## 🚨 **Problema identificado:**
Heroku no soporta `mongodump` por defecto. Necesitamos configurar buildpacks adicionales.

## 🔧 **Solución: Configurar buildpacks**

### Paso 1: Agregar buildpacks a Heroku
```bash
# Agregar buildpack de MongoDB
heroku buildpacks:add https://github.com/uhray/heroku-buildpack-mongo.git

# Agregar buildpack de apt para dependencias
heroku buildpacks:add --index 1 heroku-community/apt

# Verificar buildpacks
heroku buildpacks
```

### Paso 2: Configurar dependencias
El archivo `Aptfile` ya está creado con las dependencias necesarias:
- `libssl1.1`
- `libcrypto1.1`

### Paso 3: Desplegar
```bash
git add .
git commit -m "Add MongoDB tools support"
git push heroku main
```

## ⚠️ **Limitaciones de Heroku:**

1. **Sistema de archivos efímero**: Los archivos se pierden al reiniciar
2. **Memoria limitada**: 512MB en plan gratuito
3. **Timeout**: 30 segundos por request
4. **Sin herramientas nativas**: Necesita buildpacks

## 🎯 **Alternativa recomendada:**

En lugar de usar `mongodump` en Heroku, usar el endpoint JSON optimizado que ya funciona:

- ✅ **`/api/admin/backup-complete`** - Funciona en Heroku
- ✅ **Sin dependencias externas**
- ✅ **Optimizado para memoria**
- ✅ **Streaming de datos**

## 📋 **Comandos para configurar:**

```bash
# 1. Agregar buildpacks
heroku buildpacks:add https://github.com/uhray/heroku-buildpack-mongo.git
heroku buildpacks:add --index 1 heroku-community/apt

# 2. Verificar configuración
heroku buildpacks

# 3. Desplegar cambios
git add .
git commit -m "Add MongoDB support"
git push heroku main

# 4. Verificar logs
heroku logs --tail
```

## 🚀 **Recomendación:**

**Usar el endpoint JSON optimizado** (`backup-complete`) que ya funciona en Heroku sin necesidad de buildpacks adicionales.
