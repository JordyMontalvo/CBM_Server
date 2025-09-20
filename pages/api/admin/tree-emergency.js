import db from "../../../components/db";
import lib from "../../../components/lib";

const { Tree, User } = db;
const { success, midd, map, error } = lib;

// Cache ultra agresivo
let treeCache = null;
let usersCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 600000; // 10 minutos

// Función de emergencia - solo datos esenciales
async function getEmergencyData() {
  const now = Date.now();
  
  if (treeCache && usersCache && (now - lastCacheTime) < CACHE_DURATION) {
    return { tree: treeCache, users: usersCache };
  }

  try {
    // Solo obtener el nodo principal y sus hijos directos
    const mainNodeId = "5f0e0b67af92089b5866bcd0";
    
    const [mainNode, mainUser] = await Promise.all([
      Tree.find({ id: mainNodeId }),
      User.find({ id: mainNodeId })
    ]);

    if (mainNode.length === 0 || mainUser.length === 0) {
      return { tree: [], users: [] };
    }

    // Obtener solo los hijos directos del nodo principal
    const directChildren = mainNode[0].childs || [];
    const [childNodes, childUsers] = await Promise.all([
      Tree.find({ id: { $in: directChildren } }),
      User.find({ id: { $in: directChildren } })
    ]);

    // Crear estructura simplificada
    const tree = [mainNode[0], ...childNodes];
    const users = [mainUser[0], ...childUsers];

    treeCache = tree;
    usersCache = users;
    lastCacheTime = now;

    return { tree, users };
  } catch (err) {
    console.error('Error obteniendo datos de emergencia:', err);
    return { tree: [], users: [] };
  }
}

// Función simplificada para buscar nodo
function findNodeSimple(tree, users, identifier) {
  const cleanId = identifier.toString().trim();
  
  // Buscar por ID exacto
  let node = tree.find(n => n.id === cleanId);
  if (node) return node;
  
  // Buscar por DNI exacto
  let user = users.find(u => u.dni === cleanId || u.dni === parseInt(cleanId));
  if (user) {
    node = tree.find(n => n.id === user.id);
    if (node) return node;
  }
  
  return null;
}

// Función simplificada para obtener hijos directos
function getDirectChildrenSimple(nodeId, tree, users) {
  const node = tree.find(n => n.id === nodeId);
  if (!node || !node.childs || node.childs.length === 0) {
    return { children: [], children_points: [] };
  }

  const children = node.childs.map(childId => {
    const childNode = tree.find(n => n.id === childId);
    const childUser = users.find(u => u.id === childId);
    
    if (!childNode || !childUser) return null;
    
    return {
      id: childNode.id,
      childs: childNode.childs || [],
      parent: childNode.parent,
      name: childUser.name || '',
      lastName: childUser.lastName || '',
      dni: childUser.dni || '',
      plan: childUser.plan || 'default',
      activated: childUser.activated || false,
      affiliated: childUser.affiliated || false,
      points: Number(childUser.points) || 0,
      affiliation_points: childUser.affiliation_points || 0,
      total_points: childUser.total_points || 0,
      photo: childUser.photo || '',
      country: childUser.country || '',
      phone: childUser.phone || '',
      email: childUser.email || '',
      rank: childUser.rank || 'none',
    };
  }).filter(Boolean);

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

  // Timeout de 3 segundos (ultra agresivo)
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({
        success: false,
        message: 'La solicitud está tardando demasiado. Por favor, inténtalo de nuevo.',
        timeout: true
      });
    }
  }, 3000);

  try {
    await midd(req, res);

    if (req.method == "GET") {
      const nodeId = req.query.id || "5f0e0b67af92089b5866bcd0";
      
      // Obtener datos de emergencia
      const { tree, users } = await getEmergencyData();
      
      // Buscar el nodo solicitado
      const node = findNodeSimple(tree, users, nodeId);
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

      // Obtener hijos directos
      const { children, children_points } = getDirectChildrenSimple(node.id, tree, users);

      // Crear nodo principal
      const mainNode = {
        id: node.id,
        childs: node.childs || [],
        parent: node.parent,
        name: nodeUser.name || '',
        lastName: nodeUser.lastName || '',
        dni: nodeUser.dni || '',
        plan: nodeUser.plan || 'default',
        activated: nodeUser.activated || false,
        affiliated: nodeUser.affiliated || false,
        points: Number(nodeUser.points) || 0,
        affiliation_points: nodeUser.affiliation_points || 0,
        total_points: nodeUser.total_points || 0,
        photo: nodeUser.photo || '',
        country: nodeUser.country || '',
        phone: nodeUser.phone || '',
        email: nodeUser.email || '',
        rank: nodeUser.rank || 'none',
      };

      clearTimeout(timeout);
      return res.json(success({
        node: mainNode,
        children,
        children_points,
        totalNodes: tree.length,
        totalUsers: users.length,
        cacheTime: lastCacheTime,
        emergency: true
      }));
    }

    if (req.method == "POST") {
      clearTimeout(timeout);
      return res.json(error("Movimiento de nodos deshabilitado en modo de emergencia"));
    }

  } catch (err) {
    console.error("Error en tree API de emergencia:", err);
    clearTimeout(timeout);
    return res.status(500).json(error("Error interno del servidor"));
  }
};
