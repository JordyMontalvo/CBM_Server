import db  from "../../../components/db"
import lib from "../../../components/lib"

const { User  } = db
const { error, success, midd } = lib


const Check = async (req, res) => {

  const { check } = req.body
  console.log({ check })

  // valid check string
  const user = await User.findOne({ check })
  if(!user) return res.json(error('invalid check string'))

  // valid verified user
  if(user.verified) return res.json(success())

  // update user
  await User.update({ id: user.id }, {
    verified:   true,
    affiliated: false,
    activated:  false,
    phone:   null,
    dni:     null,
    address: null,
  })

  // response
  return res.json(success())
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

 await midd(req, res); return Check(req, res) }
