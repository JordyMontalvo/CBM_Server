import db from "../../../components/db";
import lib from "../../../components/lib";

const { Tree, User } = db;
const { success, midd, map, error } = lib;

// Cache para evitar consultas repetidas
let treeCache = null;
let usersCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 60000; // 60 segundos en producción

// Función para obtener datos con cache optimizada
async function getCachedData() {
  const now = Date.now();
  
  if (treeCache && usersCache && (now - lastCacheTime) < CACHE_DURATION) {
    return { tree: treeCache, users: usersCache };
  }

  try {
    // Consultas optimizadas sin límites (el ORM no soporta .limit())
    const [tree, users] = await Promise.all([
      Tree.find({}),
      User.find({ tree: true })
    ]);

    // Aplicar límites manualmente para evitar cargar demasiados datos
    const limitedTree = tree.slice(0, 5000);
    const limitedUsers = users.slice(0, 5000);

    treeCache = limitedTree;
    usersCache = limitedUsers;
    lastCacheTime = now;

    return { tree: limitedTree, users: limitedUsers };
  } catch (err) {
    console.error('Error obteniendo datos:', err);
    // Retornar datos vacíos en caso de error
    return { tree: [], users: [] };
  }
}

// Función optimizada para buscar nodo
function findNode(tree, users, identifier) {
  const cleanId = identifier.toString().trim();
  
  // Crear mapas para búsqueda rápida
  const userMap = new Map(users.map(u => [u.id, u]));
  const dniMap = new Map();
  const nameMap = new Map();
  
  // Pre-construir mapas de búsqueda
  users.forEach(user => {
    if (user.dni) {
      dniMap.set(user.dni.toString(), user);
      dniMap.set(user.dni, user);
    }
    if (user.name) {
      nameMap.set(user.name.toLowerCase(), user);
    }
  });
  
  // 1. Buscar por ID exacto en el árbol
  let node = tree.find(n => n.id === cleanId);
  if (node) return node;
  
  // 2. Buscar por DNI exacto
  let user = dniMap.get(cleanId);
  if (user) {
    node = tree.find(n => n.id === user.id);
    if (node) return node;
  }
  
  // 3. Buscar por nombre exacto
  user = nameMap.get(cleanId.toLowerCase());
  if (user) {
    node = tree.find(n => n.id === user.id);
    if (node) return node;
  }
  
  // 4. Búsqueda parcial por DNI (solo si es suficientemente largo)
  if (cleanId.length >= 6) {
    user = users.find(u => 
      u.dni && u.dni.toString().includes(cleanId)
    );
    if (user) {
      node = tree.find(n => n.id === user.id);
      if (node) return node;
    }
  }
  
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

// Función optimizada para obtener hijos directos
function getDirectChildren(nodeId, tree, users) {
  const node = tree.find(n => n.id === nodeId);
  if (!node || !node.childs || node.childs.length === 0) {
    return { children: [], children_points: [] };
  }

  // Crear mapas para acceso rápido
  const userMap = new Map(users.map(u => [u.id, u]));
  const nodeMap = new Map(tree.map(n => [n.id, n]));
  
  // Mapear hijos con datos de usuario
  const children = node.childs.map(childId => {
    const childNode = nodeMap.get(childId);
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

  // Calcular puntos grupales
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

  // Timeout de 8 segundos (reducido para producción)
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({
        success: false,
        message: 'La solicitud está tardando demasiado. Por favor, inténtalo de nuevo.',
        timeout: true
      });
    }
  }, 8000);

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
        return res.json(error(`Nodo no encontrado: "${nodeId}"`));
      }

      // Obtener usuario del nodo
      const nodeUser = users.find(u => u.id === node.id);
      if (!nodeUser) {
        clearTimeout(timeout);
        return res.json(error("Usuario no encontrado"));
      }

      // Obtener hijos directos (lazy loading)
      const { children, children_points } = getDirectChildren(node.id, tree, users);

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
