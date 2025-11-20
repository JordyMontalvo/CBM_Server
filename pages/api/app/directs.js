import db  from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session, Affiliation, Tree } = db
const { error, success, _ids, _map, model, midd } = lib

// models
// const D = ['id', 'name', 'lastName', 'email', 'phone', 'affiliated', 'activated', 'affiliationDate']
const D = ['id', 'name', 'lastName', 'affiliated', 'activated', 'tree', 'email', 'phone', 'points', 'country']

// Función helper para obtener todos los descendientes de un nodo recursivamente
async function getAllDescendants(nodeId, allNodes = null) {
  if (!allNodes) {
    allNodes = await Tree.find({})
  }
  
  const node = allNodes.find(n => n.id === nodeId)
  if (!node || !node.childs || node.childs.length === 0) {
    return []
  }
  
  let descendants = [...node.childs]
  
  // Recursivamente obtener descendientes de cada hijo
  for (const childId of node.childs) {
    const childDescendants = await getAllDescendants(childId, allNodes)
    descendants = [...descendants, ...childDescendants]
  }
  
  return descendants
}


const directs = async (req, res) => {
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

  await midd(req, res)

  let { session } = req.query

  // valid session
  session = await Session.findOne({ value: session })
  if(!session) return res.json(error('invalid session'))

  // get USER
  const user = await User.findOne({ id: session.id })

  // find directs
  let directs = await User.find({ parentId: user.id })

  // const ids = _ids(directs)

  // let affiliations = await Affiliation.find({ status: 'approved', userId: { $in: ids } })

  // affiliations = _map(affiliations)

  directs = directs.map(direct => {

    // const affiliation = affiliations.get(direct.id)
    const d = model(direct, D)

    // if(affiliation) return { ...d, plan: affiliation.plan.name }
    // else            return { ...d, plan: null }

    // Asegurar que points siempre esté presente (puntos personales)
    return { 
      ...d, 
      points: direct.points !== undefined && direct.points !== null ? Number(direct.points) : 0
    }
  })


  // Obtener frontales (todos los descendientes en el árbol que NO son hijos directos)
  let frontals = []
  
  const node = await Tree.findOne({ id: user.id })
  
  if (!node) {
    console.log('No se encontró nodo en el árbol para el usuario:', user.id)
    // Si no existe el nodo, crearlo con childs vacío
    await Tree.insert({ id: user.id, childs: [], parent: user.parentId || null })
    frontals = []
  } else if (node.childs && Array.isArray(node.childs) && node.childs.length > 0) {
    console.log('Nodo encontrado:', { nodeId: node.id, childsCount: node.childs.length })
    
    // Obtener todos los descendientes recursivamente
    const allDescendants = await getAllDescendants(user.id)
    console.log('Total descendientes encontrados:', allDescendants.length)
    
    if (allDescendants.length > 0) {
      // Buscar usuarios que son descendientes pero NO son hijos directos
      let frontalsUsers = await User.find({ id: { $in: allDescendants } })
      console.log('Usuarios encontrados en descendientes:', frontalsUsers.length)
      
      // Filtrar: frontales son los que están en el árbol pero NO son hijos directos
      frontals = frontalsUsers.filter(e => e && e.parentId != user.id)
      console.log('Frontales filtrados (excluyendo directos):', frontals.length)
      
      frontals = frontals.map(frontal => {
        const d = model(frontal, D)
        // Asegurar que points siempre esté presente (puntos personales)
        return { 
          ...d, 
          points: frontal.points !== undefined && frontal.points !== null ? Number(frontal.points) : 0
        }
      })
    }
  } else {
    console.log('Nodo encontrado pero sin childs para el usuario:', user.id)
    frontals = []
  }

  // response
  return res.json(success({
    name:       user.name,
    lastName:   user.lastName,
    affiliated: user.affiliated,
    _activated: user._activated,
    activated:  user.activated,
    plan:       user.plan,
    country:    user.country,
    photo:      user.photo,
    tree:       user.tree,
    token:      user.token,

    id:       user.id,
    coverage: user.coverage,
    directs,
    frontals,
    // branch:   user.branch,
    // childs,
    // names,
  }))
}

export default directs
