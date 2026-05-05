import db  from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session, Closed } = db
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


  await midd(req, res)

  let { session } = req.query

  // valid session
  session = await Session.findOne({ value: session })
  if(!session) return res.json(error('invalid session'))

  // check verified
  const user = await User.findOne({ id: session.id })
  // if(!user.verified) return res.json(error('unverified user'))

  if(req.method == 'GET') {
    // Solo traer cierres donde el usuario está en el tree
    const closeds = await Closed.findOptimized(
      { "tree.id": user.id },
      { date: 1, tree: { $elemMatch: { id: user.id } } }
    )

    // response
    return res.json(success({
      name:       user.name,
      lastName:   user.lastName,
      affiliated: user.affiliated,
      activated:  user.activated,

      id: user.id,
      closeds: closeds.sort((a,b) => new Date(b.date) - new Date(a.date)), // Ordenar por fecha descendente
    }))
  }
}
