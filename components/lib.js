class Lib {

  constructor() {
    this.midd = this.midd.bind(this)
  }

  rand ()       { return Math.random().toString(36).substr(2) }
  error(msg)    { return { error: true, msg }}
  success(opts) { return { error: false, ...opts }}

  midd(req, res) {
    // Configurar headers CORS manualmente
    const allowedOrigins = [
      'https://www.cbmundial.com',
      'https://cbmundial.com',
      'https://cbm-admin.vercel.app',
      'http://localhost:8080',
      'http://localhost:8081',
      'http://localhost:3000'
    ];

    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
      // Permitir requests sin origin
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');

    // Manejar preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return Promise.resolve();
    }

    return Promise.resolve();
  }

  acum(a, query, field) {
    // Validar que 'a' sea un array válido
    if (!Array.isArray(a)) {
      return 0
    }

    const x = Object.keys(query)[0]
    const y = Object.values(query)[0]

    return a
      .filter(i => i[x] == y)
      .map(i => i[field])
      .reduce((a, b) => a + Number(b), 0)
  }

  ids(a) {
    return a.map(i => i.userId)
  }
  _ids(a) {
    return a.map(i => i.id)
  }
  parent_ids(a) {
    return a.map(i => i.parentId)
  }

  map(a) {
    return new Map(a.map(i => [i.id, i]))
  }
  _map(a) {
    return new Map(a.map(i => [i.userId, i]))
  }

  model(obj, model) {
    let ret = {}

    for(let key in obj)
      if(model.includes(key))
        ret[key] = obj[key]

    return ret
  }
}

export default new Lib()

// Actualiza total_points de un nodo y propaga hacia arriba
export async function updateTotalPointsCascade(User, Tree, userId) {
  // 1. Obtener el nodo del árbol
  const node = await Tree.findOne({ id: userId });
  if (!node) return;

  // 2. Obtener el usuario
  const user = await User.findOne({ id: userId });
  if (!user) return;

  // 3. Calcular el total de los hijos
  let childrenTotal = 0;
  if (node.childs && node.childs.length > 0) {
    const childUsers = await User.find({ id: { $in: node.childs } });
    childrenTotal = childUsers.reduce((acc, c) => acc + (c.total_points || 0), 0);
  }

  // 4. Calcular el total_points propio
  const total_points = (user.points || 0) + (user.affiliation_points || 0) + childrenTotal;

  // 5. Guardar el total_points en el usuario
  await User.update({ id: userId }, { total_points });

  // 6. Propagar hacia arriba si tiene padre
  if (node.parent) {
    await updateTotalPointsCascade(User, Tree, node.parent);
  }
}