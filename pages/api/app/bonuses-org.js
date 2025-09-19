import db  from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session, Transaction } = db
const { error, success, midd, acum } = lib


const handler = async (req, res) => {

  let { session } = req.query

  // valid session
  session = await Session.findOne({ value: session })
  if(!session) return res.json(error('invalid session'))

  // get USER
  const user = await User.findOne({ id: session.userId })


  // get transactions
  const transactions = await Transaction.find({ userId: user.id }) || []

  const ins  = acum(transactions, {type: 'in'}, 'value')
  const outs = acum(transactions, {type: 'out'}, 'value')

  // const parent_transactions  = transactions.filter(t => t.level == 'parent')
  // const gParent_transactions = transactions.filter(t => t.level == 'gParent')

  // const standard    = acum(parent_transactions, {name: 'standard-register'}, 'value')
  // const business    = acum(parent_transactions, {name: 'business-register'}, 'value')
  // const businessVip = acum(parent_transactions, {name: 'business-vip-register'}, 'value')
  
  const standard    = acum(transactions, {name: 'standard-register'}, 'value')
  const business    = acum(transactions, {name: 'business-register'}, 'value')
  const businessVip = acum(transactions, {name: 'business-vip-register'}, 'value')

  // const upward = acum(gParent_transactions, {type: 'in'}, 'value')

  const residual = acum(transactions, {name: 'residual'}, 'value')
  const excedent = acum(transactions, {name: 'excedent'}, 'value')
  const autoExcedent = acum(transactions, {name: 'autoExcedent'}, 'value')

  // const endYear = user.endYear.reduce((a, b) => a + b, 0)

  // response
  return res.json(success({
    name: user.name,
    lastName: user.lastName,
    affiliated: user.affiliated,
    activated:  user.activated,
    plan:       user.plan,
    country:    user.country,
    photo:      user.photo,

    ins,
    outs,
    balance: (ins - outs),

    standard,
    business,
    businessVip,
    // upward,

    rank: user.rank,
    residual,
    excedent,
    autoExcedent,
    // endYear,
  }))
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

 await midd(req, res); return handler(req, res) }
