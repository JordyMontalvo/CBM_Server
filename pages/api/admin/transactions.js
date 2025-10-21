import db from "../../../components/db"
import lib from "../../../components/lib"
import { MongoClient } from "mongodb"

const URL = process.env.DB_URL
const name = process.env.DB_NAME

const { midd, success } = lib


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

  await midd(req, res)

  if(req.method == 'GET') {
    try {
      // Parámetros de paginación y filtros
      const page = parseInt(req.query.page) || 1
      const limit = parseInt(req.query.limit) || 50
      const skip = (page - 1) * limit
      const search = req.query.search || ''
      const type = req.query.type || 'all' // 'all', 'in', 'out'
      const virtual = req.query.virtual || 'all' // 'all', 'true', 'false'
      const transactionName = req.query.name || '' // filtrar por nombre de transacción

      // Conectar a MongoDB
      const client = new MongoClient(URL)
      await client.connect()
      const database = client.db(name)

      // Construir query de búsqueda
      let query = {}

      // Filtrar por tipo
      if (type !== 'all') {
        query.type = type
      }

      // Filtrar por virtual
      if (virtual === 'true') {
        query.virtual = true
      } else if (virtual === 'false') {
        query.virtual = { $in: [null, false] }
      }

      // Filtrar por nombre de transacción
      if (transactionName) {
        query.name = transactionName
      }

      // Si hay búsqueda, buscar usuarios que coincidan
      if (search) {
        const searchLower = search.toLowerCase()
        const users = await database.collection('users')
          .find({
            $or: [
              { name: { $regex: searchLower, $options: 'i' } },
              { lastName: { $regex: searchLower, $options: 'i' } },
              { dni: { $regex: search, $options: 'i' } },
              { email: { $regex: searchLower, $options: 'i' } }
            ]
          })
          .project({ id: 1 })
          .toArray()

        const userIds = users.map(u => u.id)
        
        if (userIds.length > 0) {
          query.user_id = { $in: userIds }
        } else {
          // Si no se encontraron usuarios, devolver resultado vacío
          await client.close()
          return res.json(success({
            transactions: [],
            total: 0,
            page,
            limit,
            totalPages: 0,
            totalIn: 0,
            totalOut: 0,
            balance: 0
          }))
        }
      }

      // Obtener total de transacciones
      const total = await database.collection('transactions').countDocuments(query)

      // Obtener transacciones con paginación
      let transactions = await database.collection('transactions')
        .find(query)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .toArray()

      // Obtener usuarios para mapeo
      const userIds = [...new Set([
        ...transactions.map(t => t.user_id).filter(Boolean),
        ...transactions.map(t => t._user_id).filter(Boolean)
      ])]

      const users = await database.collection('users')
        .find({ id: { $in: userIds } })
        .toArray()

      // Mapear usuarios a las transacciones
      transactions = transactions.map(t => {
        const user = users.find(u => u.id == t.user_id)
        const _user = users.find(u => u.id == t._user_id)

        return {
          ...t,
          userName: user ? `${user.name} ${user.lastName}` : 'Usuario desconocido',
          userDni: user ? user.dni : '',
          _userName: _user ? `${_user.name} ${_user.lastName}` : '',
          _userDni: _user ? _user.dni : '',
        }
      })

      // Calcular totales usando agregación para mejor performance
      const totals = await database.collection('transactions')
        .aggregate([
          { $match: query },
          {
            $group: {
              _id: '$type',
              total: { $sum: { $toDouble: '$value' } }
            }
          }
        ])
        .toArray()

      const totalIn = totals.find(t => t._id === 'in')?.total || 0
      const totalOut = totals.find(t => t._id === 'out')?.total || 0

      await client.close()

      return res.json(success({
        transactions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalIn,
        totalOut,
        balance: totalIn - totalOut
      }))
    } catch (error) {
      console.error('Error en endpoint de transacciones:', error)
      return res.status(500).json({
        success: false,
        error: 'Error al obtener transacciones',
        message: error.message
      })
    }
  }
}

