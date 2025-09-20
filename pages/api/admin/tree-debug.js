import db from "../../../components/db";
import lib from "../../../components/lib";

const { Tree, User } = db;
const { success, midd, error } = lib;

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

  try {
    await midd(req, res);

    const { search } = req.query;
    
    // Obtener todos los usuarios en el árbol
    const users = await User.find({ tree: true });
    const tree = await Tree.find({});
    
    let results = users.map(user => {
      const treeNode = tree.find(n => n.id === user.id);
      return {
        id: user.id,
        name: user.name,
        lastName: user.lastName,
        dni: user.dni,
        tree: user.tree,
        activated: user.activated,
        affiliated: user.affiliated,
        hasTreeNode: !!treeNode,
        parent: treeNode ? treeNode.parent : null,
        childs: treeNode ? treeNode.childs : []
      };
    });
    
    // Filtrar por búsqueda si se proporciona
    if (search) {
      const searchLower = search.toLowerCase();
      results = results.filter(user => 
        user.dni && user.dni.toString().includes(search) ||
        user.name && user.name.toLowerCase().includes(searchLower) ||
        user.lastName && user.lastName.toLowerCase().includes(searchLower)
      );
    }
    
    // Ordenar por DNI
    results.sort((a, b) => (a.dni || '').toString().localeCompare((b.dni || '').toString()));
    
    return res.json(success({
      totalUsers: results.length,
      totalTreeNodes: tree.length,
      users: results.slice(0, 50), // Limitar a 50 resultados
      search: search || null
    }));

  } catch (err) {
    console.error("Error en tree-debug API:", err);
    return res.status(500).json(error("Error interno del servidor"));
  }
};
