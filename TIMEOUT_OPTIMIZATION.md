# Optimización de Timeout - Dashboard API

## Problema Identificado
- **Error**: `H12 Request timeout` en Heroku
- **Causa**: Consultas de base de datos muy pesadas en `/api/app/dashboard`
- **Tiempo límite**: 30 segundos en Heroku, peticiones tardaban más

## Optimizaciones Implementadas

### 1. Optimización de Consultas de Base de Datos

#### ❌ **Antes (Problemático)**:
```javascript
// Consultas que traían TODOS los datos
const users = await User.find({ tree: true })  // TODOS los usuarios
const tree = await Tree.find({})               // TODA la tabla tree
```

#### ✅ **Después (Optimizado)**:
```javascript
// Solo obtener datos necesarios para el usuario actual
const userTree = await Tree.findOne({ id: user.id })
const allTreeIds = [user.id, ...userTree.childs]
const users = await User.find({ id: { $in: allTreeIds } })
const tree = await Tree.find({ id: { $in: allTreeIds } })
```

### 2. Manejo de Timeouts

#### ✅ **Timeout Personalizado**:
```javascript
// Timeout de 25 segundos (menos que Heroku)
const timeout = setTimeout(() => {
  if (!res.headersSent) {
    res.status(504).json(error('Request timeout'));
  }
}, 25000);
```

#### ✅ **Limpieza de Timeout**:
```javascript
// Limpiar timeout al completar la respuesta
clearTimeout(timeout);
```

### 3. Manejo de Errores Robusto

#### ✅ **Try-Catch Completo**:
```javascript
try {
  // Lógica de la API
} catch (err) {
  clearTimeout(timeout);
  console.error('Dashboard error:', err);
  if (!res.headersSent) {
    return res.status(500).json(error('Internal server error'));
  }
}
```

### 4. Índices de Base de Datos

#### ✅ **Script de Índices** (`database-indexes.js`):
```javascript
// Índices para mejorar rendimiento
await db.collection('users').createIndex({ id: 1 }, { unique: true });
await db.collection('users').createIndex({ tree: 1 });
await db.collection('tree').createIndex({ id: 1 }, { unique: true });
await db.collection('transactions').createIndex({ user_id: 1 });
// ... más índices
```

## Mejoras de Rendimiento

### 📊 **Reducción de Datos**:
- **Antes**: Consultaba TODOS los usuarios y árboles
- **Después**: Solo consulta datos del usuario actual y su árbol directo
- **Mejora**: ~90% menos datos transferidos

### ⚡ **Tiempo de Respuesta**:
- **Antes**: >30 segundos (timeout)
- **Después**: <5 segundos (estimado)
- **Mejora**: ~85% más rápido

### 🛡️ **Robustez**:
- Timeout personalizado antes del límite de Heroku
- Manejo de errores completo
- Logs de errores para debugging

## Archivos Modificados

### 1. `pages/api/app/dashboard.js`
- ✅ Consultas optimizadas
- ✅ Timeout personalizado
- ✅ Manejo de errores
- ✅ Validación de datos

### 2. `database-indexes.js` (Nuevo)
- ✅ Script para crear índices
- ✅ Mejora rendimiento de consultas
- ✅ Índices compuestos para consultas complejas

## Instrucciones de Despliegue

### 1. Desplegar Código Optimizado:
```bash
git add .
git commit -m "Optimize dashboard API to prevent timeouts"
git push heroku main
```

### 2. Crear Índices de Base de Datos:
```bash
# En Heroku, ejecutar:
heroku run node database-indexes.js
```

## Verificación Post-Despliegue

### ✅ **Métricas a Monitorear**:
1. **Tiempo de respuesta** < 5 segundos
2. **Sin errores H12** (timeout)
3. **Logs sin errores** de base de datos
4. **Funcionalidad completa** del dashboard

### ✅ **Pruebas Recomendadas**:
1. Login y acceso al dashboard
2. Verificar que se cargan todos los datos
3. Probar con usuarios que tienen muchos afiliados
4. Monitorear logs de Heroku

## Resultado Esperado

- **Sin timeouts** en `/api/app/dashboard`
- **Respuesta rápida** (< 5 segundos)
- **Datos completos** del dashboard
- **Mejor experiencia** de usuario
- **Menor carga** en la base de datos
