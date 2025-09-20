// Script para debuggear la búsqueda en el árbol
const { MongoClient } = require('mongodb');

const URL = process.env.DB_URL;
const name = process.env.DB_NAME;

async function debugTreeSearch() {
  const client = new MongoClient(URL);
  
  try {
    await client.connect();
    const db = client.db(name);
    
    console.log('🔍 Buscando DNI: 2200082131');
    
    // Buscar en la colección users
    const user = await db.collection('users').findOne({ 
      $or: [
        { dni: '2200082131' },
        { dni: 2200082131 },
        { name: '2200082131' }
      ]
    });
    
    if (user) {
      console.log('✅ Usuario encontrado en users:');
      console.log({
        id: user.id,
        name: user.name,
        lastName: user.lastName,
        dni: user.dni,
        tree: user.tree,
        activated: user.activated,
        affiliated: user.affiliated
      });
    } else {
      console.log('❌ Usuario NO encontrado en users');
    }
    
    // Buscar en la colección tree
    const treeNode = await db.collection('tree').findOne({ 
      $or: [
        { id: '2200082131' },
        { dni: '2200082131' },
        { dni: 2200082131 }
      ]
    });
    
    if (treeNode) {
      console.log('✅ Nodo encontrado en tree:');
      console.log({
        id: treeNode.id,
        parent: treeNode.parent,
        childs: treeNode.childs,
        dni: treeNode.dni
      });
    } else {
      console.log('❌ Nodo NO encontrado en tree');
    }
    
    // Buscar usuarios similares
    console.log('\n🔍 Buscando usuarios con DNI similar:');
    const similarUsers = await db.collection('users').find({
      $or: [
        { dni: { $regex: '2200082131', $options: 'i' } },
        { name: { $regex: '2200082131', $options: 'i' } }
      ]
    }).limit(5).toArray();
    
    if (similarUsers.length > 0) {
      console.log('Usuarios similares encontrados:');
      similarUsers.forEach(u => {
        console.log(`- ${u.name} ${u.lastName} (DNI: ${u.dni})`);
      });
    } else {
      console.log('No se encontraron usuarios similares');
    }
    
    // Verificar si el usuario está en el árbol
    if (user && user.tree) {
      console.log('\n✅ El usuario está marcado como tree: true');
    } else if (user) {
      console.log('\n⚠️ El usuario existe pero NO está en el árbol (tree: false o null)');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

debugTreeSearch();
