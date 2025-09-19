#!/usr/bin/env node

// Script para optimizar el rendimiento de la aplicación
const { createIndexes } = require('./database-indexes');
const { runPerformanceMonitor } = require('./performance-monitor');

async function optimizePerformance() {
  console.log('🚀 Iniciando optimización de rendimiento...\n');
  
  try {
    // 1. Crear índices de base de datos
    console.log('1. Creando índices de base de datos...');
    await createIndexes();
    console.log('✅ Índices creados exitosamente\n');
    
    // 2. Generar reporte de rendimiento
    console.log('2. Generando reporte de rendimiento...');
    await runPerformanceMonitor();
    console.log('✅ Reporte generado\n');
    
    console.log('🎉 Optimización completada!');
    console.log('\nMejoras implementadas:');
    console.log('- ✅ Consultas de base de datos optimizadas');
    console.log('- ✅ Índices creados para mejorar búsquedas');
    console.log('- ✅ Paginación mejorada');
    console.log('- ✅ Manejo de timeouts implementado');
    console.log('- ✅ Procesamiento de datos optimizado');
    
  } catch (error) {
    console.error('❌ Error durante la optimización:', error);
    process.exit(1);
  }
}

// Ejecutar optimización
if (require.main === module) {
  optimizePerformance();
}

module.exports = { optimizePerformance };
