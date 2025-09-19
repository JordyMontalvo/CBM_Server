// Monitor de rendimiento para identificar problemas en tiempo real
const { MongoClient } = require('mongodb');

const URL = process.env.DB_URL;
const name = process.env.DB_NAME;

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      slowQueries: [],
      timeouts: 0,
      errors: 0,
      avgResponseTime: 0
    };
  }

  // Monitorear consultas lentas
  async monitorSlowQueries() {
    const client = new MongoClient(URL);
    
    try {
      await client.connect();
      const db = client.db(name);
      
      // Habilitar profiling para consultas lentas (>1000ms)
      await db.setProfilingLevel(2, { slowms: 1000 });
      
      // Obtener consultas lentas
      const slowQueries = await db.collection('system.profile')
        .find({ ts: { $gte: new Date(Date.now() - 60000) } }) // Últimos 60 segundos
        .sort({ ts: -1 })
        .limit(10)
        .toArray();
      
      this.metrics.slowQueries = slowQueries;
      
      console.log(`Encontradas ${slowQueries.length} consultas lentas en los últimos 60 segundos`);
      
    } catch (error) {
      console.error('Error monitoreando consultas lentas:', error);
    } finally {
      await client.close();
    }
  }

  // Obtener estadísticas de la base de datos
  async getDatabaseStats() {
    const client = new MongoClient(URL);
    
    try {
      await client.connect();
      const db = client.db(name);
      
      const stats = await db.stats();
      
      console.log('Estadísticas de la base de datos:');
      console.log(`- Colecciones: ${stats.collections}`);
      console.log(`- Documentos: ${stats.objects}`);
      console.log(`- Tamaño de datos: ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Tamaño de índices: ${(stats.indexSize / 1024 / 1024).toFixed(2)} MB`);
      
      return stats;
      
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
    } finally {
      await client.close();
    }
  }

  // Verificar índices faltantes
  async checkMissingIndexes() {
    const client = new MongoClient(URL);
    
    try {
      await client.connect();
      const db = client.db(name);
      
      const collections = ['users', 'affiliations', 'transactions', 'tree', 'sessions'];
      
      for (const collectionName of collections) {
        const collection = db.collection(collectionName);
        const indexes = await collection.indexes();
        
        console.log(`\nÍndices para ${collectionName}:`);
        indexes.forEach(index => {
          console.log(`- ${index.name}: ${JSON.stringify(index.key)}`);
        });
      }
      
    } catch (error) {
      console.error('Error verificando índices:', error);
    } finally {
      await client.close();
    }
  }

  // Generar reporte de rendimiento
  async generateReport() {
    console.log('\n=== REPORTE DE RENDIMIENTO ===');
    
    await this.getDatabaseStats();
    await this.checkMissingIndexes();
    await this.monitorSlowQueries();
    
    console.log('\n=== MÉTRICAS ===');
    console.log(`- Timeouts: ${this.metrics.timeouts}`);
    console.log(`- Errores: ${this.metrics.errors}`);
    console.log(`- Tiempo promedio de respuesta: ${this.metrics.avgResponseTime}ms`);
  }
}

// Función para ejecutar el monitor
async function runPerformanceMonitor() {
  const monitor = new PerformanceMonitor();
  await monitor.generateReport();
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runPerformanceMonitor();
}

module.exports = { PerformanceMonitor, runPerformanceMonitor };
