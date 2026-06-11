const { MongoClient } = require('mongodb');

const URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME;

if (!URL) {
  console.warn('⚠️ Please define the DB_URL environment variable');
}

let cachedClient = global.mongoClient || null;
let cachedDb = global.mongoDb || null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(URL, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  
  cachedClient = client;
  cachedDb = client.db(DB_NAME);

  if (process.env.NODE_ENV !== 'production') {
    global.mongoClient = cachedClient;
    global.mongoDb = cachedDb;
  }

  return { client: cachedClient, db: cachedDb };
}

module.exports = { connectToDatabase };
