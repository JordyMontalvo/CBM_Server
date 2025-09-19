// Script para crear índices de base de datos que mejoran el rendimiento
const { MongoClient } = require('mongodb');

const URL = process.env.DB_URL;
const name = process.env.DB_NAME;

async function createIndexes() {
  const client = new MongoClient(URL);
  
  try {
    await client.connect();
    const db = client.db(name);
    
    console.log('Creando índices para mejorar el rendimiento...');
    
    // Índices para la colección users
    await db.collection('users').createIndex({ id: 1 }, { unique: true });
    await db.collection('users').createIndex({ name: 'text', lastName: 'text', dni: 'text', phone: 'text' });
    await db.collection('users').createIndex({ parentId: 1 });
    await db.collection('users').createIndex({ tree: 1 });
    await db.collection('users').createIndex({ activated: 1 });
    await db.collection('users').createIndex({ affiliated: 1 });
    
    // Índices para la colección affiliations
    await db.collection('affiliations').createIndex({ id: 1 }, { unique: true });
    await db.collection('affiliations').createIndex({ userId: 1 });
    await db.collection('affiliations').createIndex({ status: 1 });
    await db.collection('affiliations').createIndex({ date: -1 });
    await db.collection('affiliations').createIndex({ office: 1 });
    await db.collection('affiliations').createIndex({ userId: 1, status: 1 });
    
    // Índices para la colección transactions
    await db.collection('transactions').createIndex({ id: 1 }, { unique: true });
    await db.collection('transactions').createIndex({ user_id: 1 });
    await db.collection('transactions').createIndex({ user_id: 1, virtual: 1 });
    await db.collection('transactions').createIndex({ user_id: 1, type: 1 });
    await db.collection('transactions').createIndex({ date: -1 });
    
    // Índices para la colección tree
    await db.collection('tree').createIndex({ id: 1 }, { unique: true });
    await db.collection('tree').createIndex({ parent: 1 });
    
    // Índices para la colección sessions
    await db.collection('sessions').createIndex({ value: 1 }, { unique: true });
    await db.collection('sessions').createIndex({ id: 1 });
    
    // Índices para la colección closeds
    await db.collection('closeds').createIndex({ id: 1 }, { unique: true });
    await db.collection('closeds').createIndex({ date: -1 });
    
    console.log('Índices creados exitosamente!');
    
  } catch (error) {
    console.error('Error creando índices:', error);
  } finally {
    await client.close();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  createIndexes();
}

module.exports = { createIndexes };
