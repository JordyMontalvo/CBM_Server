import db  from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session, Transaction } = db
const { error, success, midd } = lib


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
    await midd(req, res)

    let { session } = req.query

    // valid session
    session = await Session.findOne({ value: session })
    if(!session) {
      clearTimeout(timeout);
      return res.json(error('invalid session'))
    }

    const user = await User.findOne({ id: session.id })
    if(!user) {
      clearTimeout(timeout);
      return res.json(error('user not found'))
    }

    if(req.method == 'GET') {
      // OPTIMIZACIÓN: Usar agregación de MongoDB en lugar de cargar todos los usuarios
      const transactions = await Transaction.aggregate([
        {
          $match: { 
            user_id: user.id, 
            name: 'wallet transfer' 
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_user_id',
            foreignField: 'id',
            as: 'user_info',
            pipeline: [
              {
                $project: {
                  name: 1,
                  lastName: 1
                }
              }
            ]
          }
        },
        {
          $addFields: {
            name: {
              $concat: [
                { $arrayElemAt: ['$user_info.name', 0] },
                ' ',
                { $arrayElemAt: ['$user_info.lastName', 0] }
              ]
            }
          }
        },
        {
          $project: {
            user_info: 0
          }
        }
      ]);

      clearTimeout(timeout);
      
      // response
      return res.json(success({
        name:       user.name,
        lastName:   user.lastName,
        affiliated: user.affiliated,
        activated:  user.activated,
        plan:       user.plan,
        country:    user.country,
        photo:      user.photo,
        tree:       user.tree,
        transactions,
      }))
    }
  } catch (err) {
    console.error('Error en transfers API:', err);
    clearTimeout(timeout);
    return res.status(500).json(error('Internal server error'));
  }
}
