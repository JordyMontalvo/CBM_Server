import db from "../../../components/db";
import lib from "../../../components/lib";

const { Tree, User } = db;
const { success, midd, map, error } = lib;

// Cache para evitar consultas repetidas
let treeCache = null;
let usersCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 30000; // 30 segundos

// Función para obtener datos con cache
async function getCachedData() {
  const now = Date.now();
  
  if (treeCache && usersCache && (now - lastCacheTime) < CACHE_DURATION) {
    return { tree: treeCache, users: usersCache };
  }

  const [tree, users] = await Promise.all([
    Tree.find({}),
    User.find({ tree: true })
  ]);

  treeCache = tree;
  usersCache = users;
  lastCacheTime = now;

  return { tree, users };
}

// Función mejorada para buscar nodo por ID o DNI
function findNode(tree, users, identifier) {
  // Limpiar el identificador
  const cleanId = identifier.toString().trim();
  
  console.log(`🔍 Buscando nodo con identificador: "${cleanId}"`);
  
  // Buscar en el árbol por ID exacto
  let node = tree.find(n => n.id === cleanId);
  if (node) {
    console.log(`✅ Nodo encontrado por ID: ${node.id}`);
    return node;
  }
  
  // Buscar en usuarios por DNI exacto
  let user = users.find(u => u.dni === cleanId || u.dni === parseInt(cleanId));
  if (user) {
    console.log(`✅ Usuario encontrado por DNI: ${user.dni}`);
    // Buscar el nodo correspondiente
    node = tree.find(n => n.id === user.id);
    if (node) {
      console.log(`✅ Nodo del usuario encontrado: ${node.id}`);
      return node;
    } else {
      console.log(`❌ Usuario encontrado pero no tiene nodo en el árbol`);
      return null;
    }
  }
  
  // Buscar por nombre exacto
  user = users.find(u => 
    u.name === cleanId || 
    u.lastName === cleanId ||
    `${u.name} ${u.lastName}` === cleanId
  );
  if (user) {
    console.log(`✅ Usuario encontrado por nombre: ${user.name} ${user.lastName}`);
    node = tree.find(n => n.id === user.id);
    if (node) {
      console.log(`✅ Nodo del usuario encontrado: ${node.id}`);
      return node;
    }
  }
  
  // Búsqueda parcial por DNI
  if (cleanId.length >= 4) {
    user = users.find(u => 
      u.dni && u.dni.toString().includes(cleanId)
    );
    if (user) {
      console.log(`✅ Usuario encontrado por DNI parcial: ${user.dni}`);
      node = tree.find(n => n.id === user.id);
      if (node) {
        console.log(`✅ Nodo del usuario encontrado: ${node.id}`);
        return node;
      }
    }
  }
  
  // Búsqueda parcial por nombre
  if (cleanId.length >= 3) {
    user = users.find(u => 
      u.name && u.name.toLowerCase().includes(cleanId.toLowerCase()) ||
      u.lastName && u.lastName.toLowerCase().includes(cleanId.toLowerCase())
    );
    if (user) {
      console.log(`✅ Usuario encontrado por nombre parcial: ${user.name} ${user.lastName}`);
      node = tree.find(n => n.id === user.id);
      if (node) {
        console.log(`✅ Nodo del usuario encontrado: ${node.id}`);
        return node;
      }
    }
  }
  
  console.log(`❌ No se encontró ningún nodo con identificador: "${cleanId}"`);
  return null;
}

// Función para validar movimiento en el árbol
function isValidMove(tree, fromId, toId) {
  const fromNode = tree.find(n => n.id === fromId);
  const toNode = tree.find(n => n.id === toId);
  
  if (!fromNode || !toNode) return false;
  
  // Verificar que no se está moviendo un nodo debajo de sus propios descendientes
  function isDescendant(nodeId, ancestorId) {
    const node = tree.find(n => n.id === nodeId);
    if (!node || !node.parent) return false;
    if (node.parent === ancestorId) return true;
    return isDescendant(node.parent, ancestorId);
  }
  
  return !isDescendant(toId, fromId);
}

// Función para obtener hijos directos de un nodo (lazy loading)
async function getDirectChildren(nodeId, tree, users) {
  const node = tree.find(n => n.id === nodeId);
  if (!node || !node.childs || node.childs.length === 0) {
    return { children: [], children_points: [] };
  }

  // Obtener nodos hijos
  const childNodes = tree.filter(n => node.childs.includes(n.id));
  
  // Obtener usuarios de los hijos
  const childUsers = users.filter(u => node.childs.includes(u.id));
  
  // Crear mapa de usuarios para acceso rápido
  const userMap = new Map(childUsers.map(u => [u.id, u]));
  
  // Mapear hijos con datos de usuario en el orden correcto
  const children = node.childs.map(childId => {
    const childNode = childNodes.find(n => n.id === childId);
    const childUser = userMap.get(childId);
    
    if (!childNode || !childUser) return null;
    
    return {
      id: childNode.id,
      childs: childNode.childs || [],
      parent: childNode.parent,
      name: childUser.name,
      lastName: childUser.lastName,
      dni: childUser.dni,
      plan: childUser.plan,
      activated: childUser.activated,
      affiliated: childUser.affiliated,
      points: Number(childUser.points) || 0,
      affiliation_points: childUser.affiliation_points || 0,
      total_points: childUser.total_points || 0,
      photo: childUser.photo,
      country: childUser.country,
      phone: childUser.phone,
      email: childUser.email,
      rank: childUser.rank,
    };
  }).filter(Boolean);

  // Calcular puntos grupales de cada hijo
  const children_points = children.map(child => child.total_points || 0);

  return { children, children_points };
}

export default async (req, res) => {
  // CORS headers directos
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Timeout de 10 segundos
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({
        success: false,
        message: 'La solicitud está tardando demasiado. Por favor, inténtalo de nuevo.',
        timeout: true
      });
    }
  }, 10000);

  try {
    await midd(req, res);

    if (req.method == "GET") {
      const nodeId = req.query.id || "5f0e0b67af92089b5866bcd0";
      
      // Obtener datos con cache
      const { tree, users } = await getCachedData();
      
      // Buscar el nodo solicitado
      const node = findNode(tree, users, nodeId);
      if (!node) {
        clearTimeout(timeout);
        
        // Proporcionar información de debug
        const suggestions = [];
        if (nodeId.length >= 4) {
          const partialMatches = users.filter(u => 
            u.dni && u.dni.toString().includes(nodeId.toString())
          ).slice(0, 5);
          suggestions.push(...partialMatches.map(u => `${u.name} ${u.lastName} (DNI: ${u.dni})`));
        }
        
        return res.json(error(`Nodo no encontrado: "${nodeId}". ${suggestions.length > 0 ? 'Sugerencias: ' + suggestions.join(', ') : ''}`));
      }

      // Obtener usuario del nodo
      const nodeUser = users.find(u => u.id === node.id);
      if (!nodeUser) {
        clearTimeout(timeout);
        return res.json(error("Usuario no encontrado"));
      }

      // Obtener hijos directos (lazy loading)
      const { children, children_points } = await getDirectChildren(node.id, tree, users);

      // Crear nodo principal con datos de usuario
      const mainNode = {
        id: node.id,
        childs: node.childs || [],
        parent: node.parent,
        name: nodeUser.name,
        lastName: nodeUser.lastName,
        dni: nodeUser.dni,
        plan: nodeUser.plan,
        activated: nodeUser.activated,
        affiliated: nodeUser.affiliated,
        points: Number(nodeUser.points) || 0,
        affiliation_points: nodeUser.affiliation_points || 0,
        total_points: nodeUser.total_points || 0,
        photo: nodeUser.photo,
        country: nodeUser.country,
        phone: nodeUser.phone,
        email: nodeUser.email,
        rank: nodeUser.rank,
      };

      clearTimeout(timeout);
      return res.json(success({
        node: mainNode,
        children,
        children_points,
        totalNodes: tree.length,
        totalUsers: users.length,
        cacheTime: lastCacheTime
      }));
    }

    if (req.method == "POST") {
      const { to: _to, from: _from } = req.body;

      if (!_to || !_from) {
        clearTimeout(timeout);
        return res.json(error("Parámetros 'to' y 'from' son requeridos"));
      }

      // Obtener datos con cache
      const { tree, users } = await getCachedData();

      // Buscar nodos por DNI o ID
      const toNode = findNode(tree, users, _to);
      const fromNode = findNode(tree, users, _from);

      if (!toNode) {
        clearTimeout(timeout);
        return res.json(error(`No existe ${_to} en el árbol`));
      }
      if (!fromNode) {
        clearTimeout(timeout);
        return res.json(error(`No existe ${_from} en el árbol`));
      }

      // Validar movimiento
      if (!isValidMove(tree, toNode.id, fromNode.id)) {
        clearTimeout(timeout);
        return res.json(error("Movimiento inválido: no se puede mover un nodo debajo de sus propios descendientes"));
      }

      // Realizar movimiento
      try {
        // Remover del padre actual
        const currentParent = tree.find(n => n.id === toNode.parent);
        if (currentParent) {
          const index = currentParent.childs.indexOf(toNode.id);
          if (index > -1) {
            currentParent.childs.splice(index, 1);
            await Tree.update(
              { id: currentParent.id },
              { childs: currentParent.childs }
            );
          }
        }

        // Agregar al nuevo padre
        fromNode.childs.push(toNode.id);
        await Tree.update(
          { id: fromNode.id },
          { childs: fromNode.childs }
        );

        // Actualizar parent del nodo movido
        toNode.parent = fromNode.id;
        await Tree.update(
          { id: toNode.id },
          { parent: toNode.parent }
        );

        // Limpiar cache para forzar recarga
        treeCache = null;
        usersCache = null;
        lastCacheTime = 0;

        clearTimeout(timeout);
        return res.json(success({ message: "Nodo movido exitosamente" }));

      } catch (moveError) {
        console.error("Error moviendo nodo:", moveError);
        clearTimeout(timeout);
        return res.json(error("Error interno al mover el nodo"));
      }
    }

  } catch (err) {
    console.error("Error en tree API:", err);
    clearTimeout(timeout);
    return res.status(500).json(error("Error interno del servidor"));
  }
};
