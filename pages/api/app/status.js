import db  from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session, Tree } = db
const { error, success, midd, map } = lib


let tree
let users
let activateds

function count(id) {

  if(!tree[id]) return 0

  if(users.get(id).activated) activateds++

  const a = tree[id].childs

  let ret = 0

  a.forEach(id => { if(id != null) ret += (count(id) + 1) })

  return ret
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


  await midd(req, res)

  let { session } = req.query

  // valid session
  session = await Session.findOne({ value: session })
  if(!session) return res.json(error('invalid session'))

  // get USER
  const user = await User.findOne({ id: session.userId })

  // get team
  tree = await Tree.find({})
  activateds = 0

  const ids = tree.map(e => e.id)

  users = await User.find({ id: { $in: ids } })
  users = map(users)

  tree = tree.reduce((a, b) => { a[`${b.id}`] = b; return a }, {})

  const team = count(user.id)

  if(user.activated) activateds--

  // response
  return res.json(success({
    name:            user.name,
    lastName:        user.lastName,
    affiliated:      user.affiliated,
    activated:       user.activated,
    date:            user.date,
    affiliationDate: user.affiliationDate,
    plan:            user.plan,
    country:         user.country,
    photo:           user.photo,


    rank:            user.rank,
    team,
    activateds,
    unactivateds:    team - activateds,
  }))
}
