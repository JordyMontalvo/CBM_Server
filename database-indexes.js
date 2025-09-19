// Script para crear índices de base de datos que mejoren el rendimiento
const { MongoClient } = require('mongodb');

const createIndexes = async () => {
  const client = new MongoClient(process.env.DB_URL);
  
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME);
    
    console.log('Creando índices para mejorar el rendimiento...');
    
    // Índices para la colección users
    await db.collection('users').createIndex({ id: 1 }, { unique: true });
    await db.collection('users').createIndex({ tree: 1 });
    await db.collection('users').createIndex({ parentId: 1 });
    await db.collection('users').createIndex({ activated: 1 });
    await db.collection('users').createIndex({ affiliated: 1 });
    
    // Índices para la colección tree
    await db.collection('tree').createIndex({ id: 1 }, { unique: true });
    await db.collection('tree').createIndex({ childs: 1 });
    
    // Índices para la colección transactions
    await db.collection('transactions').createIndex({ user_id: 1 });
    await db.collection('transactions').createIndex({ user_id: 1, virtual: 1 });
    await db.collection('transactions').createIndex({ user_id: 1, type: 1 });
    await db.collection('transactions').createIndex({ date: -1 });
    
    // Índices para la colección sessions
    await db.collection('sessions').createIndex({ value: 1 }, { unique: true });
    await db.collection('sessions').createIndex({ id: 1 });
    
    console.log('✅ Índices creados exitosamente');
    
  } catch (error) {
    console.error('❌ Error creando índices:', error);
  } finally {
    await client.close();
  }
};

// Ejecutar solo si se llama directamente
if (require.main === module) {
  createIndexes();
}

module.exports = createIndexes;
