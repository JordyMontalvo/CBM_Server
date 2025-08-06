import db  from "../../../components/db"
import lib from "../../../components/lib"

const { Activation, Affiliation, User, Office, Product } = db
const { error, success, midd } = lib


const Invoice = async (req, res) => {

  console.log('Request method:', req.method)
  console.log('Request body type:', typeof req.body)
  console.log('Request body:', req.body)

  let id = null

  // Intentar obtener el ID de diferentes maneras
  if (req.body && typeof req.body === 'object' && req.body.id) {
    id = req.body.id
  } else if (req.body && typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body)
      id = parsed.id
    } catch (err) {
      console.error('Error parsing string body:', err)
    }
  } else if (req.query && req.query.id) {
    id = req.query.id
  }

  console.log('Extracted ID:', id)

  if (!id) {
    return res.json(error('ID no proporcionado'))
  }

  // get activation
  const activation  = await Activation.findOne({ id })
  const affiliation = await Affiliation.findOne({ id })
  
  console.log('Activation:', activation ? 'Found' : 'Not found')
  console.log('Affiliation:', affiliation ? 'Found' : 'Not found')

  if (!activation && !affiliation) {
    return res.json(error('No se encontró la activación o afiliación'))
  }

  let products = []
  let userId = null
  let office = null

  if (activation) {
    // Handle activation
    products = activation.products || []
    userId = activation.userId
    office = await Office.findOne({ id: activation.office })
  } else {
    // Handle affiliation - mostrar plan elegido + productos elegidos
    userId = affiliation.userId
    office = await Office.findOne({ id: affiliation.office })
    
    // Calcular precio del plan
    let planPrice = 0
    if (affiliation.plan && affiliation.plan.amount) {
      planPrice = affiliation.plan.amount
    } else if (affiliation.price) {
      planPrice = affiliation.price
    } else {
      // Precio por defecto según el tipo de plan
      if (affiliation.plan && affiliation.plan.id === 'pre-basic') {
        planPrice = 28 // PLAN PILOTO 90
      } else if (affiliation.plan && affiliation.plan.id === 'basic') {
        planPrice = 50 // BÁSICO
      } else if (affiliation.plan && affiliation.plan.id === 'standard') {
        planPrice = 150 // ESTÁNDAR
      } else if (affiliation.plan && affiliation.plan.id === 'business') {
        planPrice = 300 // PREMIUM
      } else if (affiliation.plan && affiliation.plan.id === 'master') {
        planPrice = 500 // ESTRELLA
      } else {
        planPrice = 500 // Precio por defecto
      }
    }
    
    // Crear lista de productos: plan + productos elegidos
    products = [{
      id: '0000',
      name: affiliation.plan ? affiliation.plan.name : 'Plan de Afiliación',
      total: 1,
      price: planPrice
    }]
    
    // Agregar productos elegidos solo con nombre/descripción
    if (affiliation.products && Array.isArray(affiliation.products) && affiliation.products.length > 0) {
      const selectedProducts = affiliation.products.map(product => ({
        id: product.id,
        name: product.name,
        total: product.total,
        price: 0 // Sin precio, solo descripción
      }))
      products = products.concat(selectedProducts)
    }
  }

  // Filter products with total > 0
  products = products.filter(product => product.total > 0)

  if (products.length === 0) {
    return res.json(error('No hay productos para mostrar'))
  }

  const user = await User.findOne({ id: userId })
  
  if (!user) {
    return res.json(error('Usuario no encontrado'))
  }

  if (!office) {
    return res.json(error('Oficina no encontrada'))
  }

  console.log('Products:', products)
  console.log('User:', user.name)
  console.log('Office:', office.name)

  // response
  return res.json(success({
    products,
    user,
    office,
  }))
}

export default async (req, res) => { await midd(req, res); return Invoice(req, res) }
