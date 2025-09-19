# Optimización de Rendimiento - CBM Server

## Problemas Identificados

### 1. Timeouts en API Endpoints
- **`/api/admin/affiliations`**: 3417ms (timeout)
- **`/api/app/affiliation`**: 30s timeout (H12 error)
- **`/api/admin/closeds`**: Procesamiento masivo sin optimización

### 2. Problemas de Base de Datos
- Consultas secuenciales innecesarias
- Falta de índices en campos de búsqueda
- Carga completa de colecciones en memoria
- Procesamiento recursivo costoso

## Soluciones Implementadas

### 1. Optimización de Consultas
- **Agregación MongoDB**: Uso de `$lookup` para joins eficientes
- **Paginación optimizada**: Límites de skip y consultas paginadas
- **Proyección de campos**: Solo obtener campos necesarios
- **Consultas paralelas**: Uso de `Promise.all()` para operaciones concurrentes

### 2. Índices de Base de Datos
```javascript
// Índices creados automáticamente
users: { id, name+lastName+dni+phone (text), parentId, tree, activated, affiliated }
affiliations: { id, userId, status, date, office, userId+status }
transactions: { id, user_id, user_id+virtual, user_id+type, date }
tree: { id, parent }
sessions: { value, id }
closeds: { id, date }
```

### 3. Manejo de Timeouts
- Middleware de timeout (25s por defecto)
- Respuestas de error informativas
- Limpieza automática de recursos

### 4. Optimización de Memoria
- Carga selectiva de datos
- Procesamiento por lotes
- Limpieza de variables temporales

## Cómo Aplicar las Optimizaciones

### 1. Ejecutar Script de Optimización
```bash
cd Server
node optimize-performance.js
```

### 2. Verificar Mejoras
```bash
# Monitorear rendimiento
node performance-monitor.js

# Ver logs de la aplicación
heroku logs --tail --app cbm-server-1-a84e84b849af
```

### 3. Configuración de Variables de Entorno
Asegúrate de que estas variables estén configuradas:
```bash
DB_URL=mongodb://...
DB_NAME=cbm
```

## Archivos Modificados

### Optimizados
- `pages/api/admin/affiliations.js` - Consultas optimizadas con agregación
- `pages/api/app/affiliation.js` - Carga selectiva de datos
- `components/timeout.js` - Middleware de timeout (nuevo)
- `database-indexes.js` - Script de creación de índices (nuevo)
- `performance-monitor.js` - Monitor de rendimiento (nuevo)

### Respaldos
- `pages/api/admin/affiliations.js.backup`
- `pages/api/app/affiliation.js.backup`

## Métricas de Mejora Esperadas

### Antes
- `/api/admin/affiliations`: 3417ms → timeout
- `/api/app/affiliation`: 30s timeout
- Consultas de base de datos: lentas, sin índices

### Después
- `/api/admin/affiliations`: <500ms
- `/api/app/affiliation`: <2000ms
- Consultas de base de datos: optimizadas con índices

## Monitoreo Continuo

### 1. Heroku Logs
```bash
heroku logs --tail --app cbm-server-1-a84e84b849af
```

### 2. Métricas de Base de Datos
- Monitorear consultas lentas
- Verificar uso de índices
- Revisar estadísticas de colecciones

### 3. Alertas
- Configurar alertas para timeouts >5s
- Monitorear errores H12
- Revisar métricas de memoria

## Próximos Pasos

1. **Desplegar cambios** a producción
2. **Monitorear métricas** durante 24-48 horas
3. **Ajustar timeouts** si es necesario
4. **Implementar caché** para consultas frecuentes
5. **Considerar CDN** para assets estáticos

## Contacto

Para problemas o preguntas sobre las optimizaciones, revisar:
- Logs de la aplicación
- Métricas de Heroku
- Reportes de rendimiento generados
