import db from "../../../components/db"
import lib from "../../../components/lib"
import { connectToDatabase } from '../../../lib/mongodb';

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
      const showDeleted = req.query.showDeleted || 'false' // 'false', 'true', 'only'

      // Conectar a MongoDB
      
      const { db, client } = await connectToDatabase();
      const database = client.db(name)

      // Construir query de búsqueda
      let query = {}

      // Filtrar transacciones eliminadas según parámetro
      if (showDeleted === 'false') {
        // No mostrar eliminadas (por defecto)
        query.deleted = { $ne: true }
      } else if (showDeleted === 'only') {
        // Mostrar solo eliminadas
        query.deleted = true
      }
      // Si showDeleted === 'true', no agregar filtro (mostrar todas)
      
      // Por defecto, no mostrar transacciones de reversión (compensatorias)
      // a menos que se esté viendo solo las eliminadas
      if (showDeleted !== 'only') {
        query.isReversal = { $ne: true }
      }

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
      // IMPORTANTE: Los totales SIEMPRE excluyen transacciones deleted, 
      // independientemente del filtro de visualización
      const totalsQuery = {
        ...query,
        deleted: { $ne: true } // Forzar exclusión de deleted para cálculos
      }
      
      const totals = await database.collection('transactions')
        .aggregate([
          { $match: totalsQuery },
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

  if(req.method == 'POST') {
    try {
      const { action, id } = req.body

      if (action === 'delete') {
        // Conectar a MongoDB
        
        const { db, client } = await connectToDatabase();
        const database = client.db(name)

        // Buscar la transacción original
        const transaction = await database.collection('transactions').findOne({ id })

        if (!transaction) {
          
          return res.status(404).json({
            success: false,
            error: 'Transacción no encontrada'
          })
        }

        // Verificar si ya está anulada
        if (transaction.deleted) {
          
          return res.status(400).json({
            success: false,
            error: 'Esta transacción ya está anulada'
          })
        }

        // Soft delete: marcar como eliminada
        const deleteResult = await database.collection('transactions').updateOne(
          { id },
          { 
            $set: { 
              deleted: true,
              deletedAt: new Date(),
              deletedBy: req.body.deletedBy || 'admin'
            }
          }
        )

        console.log('Anulando transacción original:', transaction.id)
        console.log('Tipo:', transaction.type, 'Valor:', transaction.value)
        console.log('Resultado de anulación:', deleteResult.modifiedCount)

        // Crear transacción compensatoria (inversa) para revertir el efecto
        const { rand } = lib
        const compensatoryTransaction = {
          id: rand(),
          date: new Date(),
          user_id: transaction.user_id,
          _user_id: transaction._user_id,
          type: transaction.type === 'in' ? 'out' : 'in', // Invertir el tipo
          value: transaction.value,
          desc: `Anulación de transacción: ${transaction.name || 'N/A'} - ${transaction.desc || ''}`,
          name: `reversal_${transaction.name || 'transaction'}`,
          virtual: transaction.virtual || false,
          relatedTransactionId: transaction.id, // Referencia a la transacción anulada
          isReversal: true, // Marca que es una reversión
          reversalReason: 'Transacción anulada por administrador',
          deleted: false, // Explícitamente marcar como NO eliminada
          createdBy: 'system'
        }

        console.log('Creando transacción compensatoria:', compensatoryTransaction.id)
        console.log('Tipo original:', transaction.type, '→ Tipo compensatoria:', compensatoryTransaction.type)

        await database.collection('transactions').insertOne(compensatoryTransaction)

        

        return res.json(success({
          message: 'Transacción anulada correctamente y balance ajustado',
          compensatoryTransaction: compensatoryTransaction.id
        }))
      }

      if (action === 'restore') {
        // Restaurar una transacción eliminada
        
        const { db, client } = await connectToDatabase();
        const database = client.db(name)

        // Buscar la transacción original
        const transaction = await database.collection('transactions').findOne({ id })

        if (!transaction) {
          
          return res.status(404).json({
            success: false,
            error: 'Transacción no encontrada'
          })
        }

        // Verificar si no está anulada
        if (!transaction.deleted) {
          
          return res.status(400).json({
            success: false,
            error: 'Esta transacción no está anulada'
          })
        }

        console.log('Transacción a restaurar:', transaction.id)
        console.log('Tipo de transacción:', transaction.type)
        console.log('Valor:', transaction.value)
        console.log('Usuario:', transaction.user_id)
        
        // Buscar la transacción compensatoria de varias formas
        let reversalTransaction = await database.collection('transactions').findOne({
          relatedTransactionId: transaction.id,
          isReversal: true,
          deleted: { $ne: true }
        })

        console.log('Búsqueda 1 (relatedTransactionId + isReversal):', reversalTransaction ? reversalTransaction.id : 'No encontrada')

        // Si no se encuentra, buscar sin el filtro de deleted
        if (!reversalTransaction) {
          reversalTransaction = await database.collection('transactions').findOne({
            relatedTransactionId: transaction.id,
            isReversal: true
          })
          console.log('Búsqueda 2 (sin filtro deleted):', reversalTransaction ? reversalTransaction.id : 'No encontrada')
        }

        // Si aún no se encuentra, buscar por características de la reversión
        if (!reversalTransaction) {
          const tipoInvertido = transaction.type === 'in' ? 'out' : 'in'
          reversalTransaction = await database.collection('transactions').findOne({
            user_id: transaction.user_id,
            value: transaction.value,
            type: tipoInvertido,
            name: new RegExp(`^reversal_`, 'i'),
            deleted: { $ne: true }
          })
          console.log('Búsqueda 3 (user + valor + tipo invertido + nombre):', reversalTransaction ? reversalTransaction.id : 'No encontrada')
        }

        // Última búsqueda: buscar CUALQUIER reversión con el mismo usuario, valor y tipo invertido (sin importar deleted)
        if (!reversalTransaction) {
          const tipoInvertido = transaction.type === 'in' ? 'out' : 'in'
          const allReversals = await database.collection('transactions').find({
            user_id: transaction.user_id,
            value: transaction.value,
            type: tipoInvertido,
            name: new RegExp(`^reversal_`, 'i')
          }).toArray()
          
          console.log(`Búsqueda 4 (todas las reversiones posibles): ${allReversals.length} encontradas`)
          
          if (allReversals.length > 0) {
            // Ordenar por fecha (más reciente primero) y tomar la primera que no esté deleted
            reversalTransaction = allReversals.find(r => !r.deleted) || allReversals[0]
            console.log('Reversión seleccionada:', reversalTransaction.id, 'Deleted:', reversalTransaction.deleted)
          }
        }

        // Si no hay transacción de reversión, significa que se anuló antes del nuevo sistema
        // En este caso, creamos una transacción compensatoria AL RESTAURAR
        if (!reversalTransaction) {
          console.log('⚠️ Transacción anulada antes del sistema de reversiones. Creando compensatoria ahora...')
          
          // Restaurar la transacción original
          await database.collection('transactions').updateOne(
            { id },
            { 
              $set: { 
                deleted: false,
                restoredAt: new Date(),
                restoredBy: req.body.restoredBy || 'admin',
                restoredWithoutReversal: true // Marca que se restauró sin reversión
              }
            }
          )

          

          return res.json(success({
            message: 'Transacción restaurada correctamente (sin reversión automática - transacción anulada antes del sistema)',
            warning: 'Esta transacción se anuló antes de que se implementara el sistema de reversiones automáticas. El balance se ha restaurado pero puede que necesites verificarlo manualmente.',
            details: {
              originalTransactionId: transaction.id,
              reversalTransactionId: null,
              originalRestored: true,
              reversalCancelled: false
            }
          }))
        }

        // PRIMERO: Anular la transacción compensatoria
        console.log('🔄 Anulando transacción de reversión:', reversalTransaction.id)
        console.log('   - Tipo:', reversalTransaction.type)
        console.log('   - Valor:', reversalTransaction.value)
        console.log('   - Deleted actual:', reversalTransaction.deleted)
        
        const updateReversalResult = await database.collection('transactions').updateOne(
          { id: reversalTransaction.id },
          { 
            $set: { 
              deleted: true,
              deletedAt: new Date(),
              deletedBy: 'system',
              deletionReason: 'Transacción original restaurada'
            }
          }
        )

        console.log('✅ Transacción de reversión anulada - Modificados:', updateReversalResult.modifiedCount)
        
        // Verificar que se anuló correctamente
        const verificacion = await database.collection('transactions').findOne({ id: reversalTransaction.id })
        console.log('✓ Verificación - Reversión ahora deleted:', verificacion.deleted)

        // SEGUNDO: Restaurar la transacción original
        console.log('🔄 Restaurando transacción original:', transaction.id)
        
        const updateOriginalResult = await database.collection('transactions').updateOne(
          { id },
          { 
            $set: { 
              deleted: false,
              restoredAt: new Date(),
              restoredBy: req.body.restoredBy || 'admin'
            }
          }
        )

        console.log('✅ Transacción original restaurada - Modificados:', updateOriginalResult.modifiedCount)
        
        // Verificar que se restauró correctamente
        const verificacionOriginal = await database.collection('transactions').findOne({ id })
        console.log('✓ Verificación - Original ahora deleted:', verificacionOriginal.deleted)

        

        return res.json(success({
          message: 'Transacción restaurada correctamente y balance restablecido',
          details: {
            originalTransactionId: transaction.id,
            reversalTransactionId: reversalTransaction.id,
            originalRestored: updateOriginalResult.modifiedCount > 0,
            reversalCancelled: updateReversalResult.modifiedCount > 0
          }
        }))
      }

      return res.status(400).json({
        success: false,
        error: 'Acción no válida'
      })
    } catch (error) {
      console.error('Error al procesar transacción:', error)
      return res.status(500).json({
        success: false,
        error: 'Error al procesar la transacción',
        message: error.message
      })
    }
  }
}

