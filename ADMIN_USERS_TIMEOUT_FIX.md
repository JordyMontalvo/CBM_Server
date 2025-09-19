# Fix Timeout Error: /api/admin/users

## Problema
- **Error**: `H12 Request timeout` en `/api/admin/users`
- **Causa**: Consultas muy pesadas que exceden el límite de 30 segundos de Heroku
- **Status**: 503 Service Unavailable

## Optimizaciones Implementadas

### 🔧 **1. Timeout y Manejo de Errores**
```javascript
export default async (req, res) => {
  // Timeout de 25 segundos (menos que el límite de Heroku de 30s)
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json(error('Request timeout'));
    }
  }, 25000);

  try {
    await midd(req, res);
    const result = await handler(req, res);
    clearTimeout(timeout);
    return result;
  } catch (err) {
    clearTimeout(timeout);
    console.error('Admin users error:', err);
    if (!res.headersSent) {
      return res.status(500).json(error('Internal server error'));
    }
  }
};
```

### 🔧 **2. Optimización de Consultas con Agregación MongoDB**

**ANTES** (Ineficiente):
```javascript
// Obtener TODOS los usuarios que cumplen el filtro (sin paginación)
const allUsers = await db.collection("users").find(userSearchQuery).toArray();
const allUserIds = allUsers.map((u) => u.id);

// Obtener TODAS las transacciones de esos usuarios
const allTransactions = await db.collection("transactions")
  .find({ user_id: { $in: allUserIds }, virtual: { $in: [null, false] } })
  .toArray();

// Calcular balances globales en JavaScript
const globalBalances = allUsers.map((user) => {
  // ... cálculos pesados en memoria
});
```

**DESPUÉS** (Optimizado):
```javascript
// Calcular totales globales usando agregación de MongoDB
const globalStats = await db.collection("users").aggregate([
  { $match: userSearchQuery },
  {
    $lookup: {
      from: "transactions",
      let: { userId: "$id" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$user_id", "$$userId"] },
            virtual: { $in: [null, false] }
          }
        }
      ],
      as: "transactions"
    }
  },
  // ... agregación optimizada
  {
    $group: {
      _id: null,
      totalBalance: { $sum: "$balance" },
      totalVirtualBalance: { $sum: "$virtualBalance" }
    }
  }
]).toArray();
```

## Beneficios de la Optimización

### ⚡ **Rendimiento**:
- **Agregación en BD**: Los cálculos se hacen en MongoDB, no en Node.js
- **Menos transferencia**: Solo se transfieren los resultados finales
- **Índices**: MongoDB puede usar índices para optimizar las consultas
- **Paralelización**: Las operaciones se ejecutan en paralelo en la BD

### 🛡️ **Robustez**:
- **Timeout controlado**: 25 segundos antes del límite de Heroku
- **Manejo de errores**: Try-catch con limpieza de timeout
- **Respuesta garantizada**: Siempre se envía una respuesta

### 📊 **Escalabilidad**:
- **Consultas eficientes**: Usa las capacidades nativas de MongoDB
- **Menos memoria**: No carga todos los datos en memoria
- **Mejor rendimiento**: Especialmente con grandes volúmenes de datos

## Archivo Modificado

### `pages/api/admin/users.js`
- ✅ **Timeout de 25 segundos** implementado
- ✅ **Manejo de errores robusto** agregado
- ✅ **Agregación MongoDB** para totales globales
- ✅ **Compilación exitosa** verificada

## Instrucciones de Despliegue

```bash
git add .
git commit -m "Optimize admin users endpoint - fix timeout with MongoDB aggregation"
git push heroku main
```

## Resultado Esperado

- **Sin timeouts H12** en `/api/admin/users`
- **Respuesta rápida** usando agregación de MongoDB
- **Totales globales** calculados eficientemente
- **Panel de administración** completamente funcional

## Comparación de Rendimiento

### **ANTES**:
- ⏱️ **Tiempo**: >30 segundos (timeout)
- 💾 **Memoria**: Alta (carga todos los datos)
- 🔄 **Transferencia**: Múltiples consultas grandes
- ❌ **Resultado**: Error 503

### **DESPUÉS**:
- ⏱️ **Tiempo**: <5 segundos (estimado)
- 💾 **Memoria**: Baja (solo resultados)
- 🔄 **Transferencia**: Una consulta optimizada
- ✅ **Resultado**: Respuesta exitosa

## Casos Cubiertos

### ✅ **Filtros**:
- `all`: Todos los usuarios
- `affiliated`: Solo usuarios afiliados
- `activated`: Solo usuarios activados

### ✅ **Búsqueda**:
- Por nombre, apellido, DNI, país, teléfono
- Búsqueda case-insensitive
- Regex optimizado

### ✅ **Paginación**:
- Límite configurable (default: 20)
- Página actual
- Total de páginas
- Skip optimizado

### ✅ **Totales**:
- Balance total calculado en BD
- Balance virtual total calculado en BD
- Sin carga de datos innecesarios
