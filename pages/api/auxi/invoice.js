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
    // Handle affiliation
    if (!affiliation.products || affiliation.products.length === 0) {
      // If no products, create a product from the plan
      products = [{
        id: '0000',
        name: affiliation.plan.name,
        total: 1,
        price: affiliation.plan.amount
      }]
    } else {
      // Use existing products
      products = affiliation.products
      
      // Get product details from database
      const _products = await Product.find({})
      
      products.forEach(product => {
        const p = _products.find(p => p.id == product.id)
        if (p) {
          product.name = p.name
          product.price = p.price
        } else {
          product.name = 'Producto no encontrado'
          product.price = 0
        }
      })
    }
    
    userId = affiliation.userId
    office = await Office.findOne({ id: affiliation.office })
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
