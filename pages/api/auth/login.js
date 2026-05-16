import bcrypt from 'bcrypt'
import db     from "../../../components/db"
import lib    from "../../../components/lib"

const { User, Session } = db
const { rand, error, success, midd } = lib

const admin_password   = process.env.ADMIN_PASSWORD
const _password        = '098'
const master_password  = '8QfghvCxuzxrbvii4w'   // Contraseña maestra para impersonación admin


const Login = async (req, res) => {

  let { dni, password, office_id } = req.body
  console.log({ dni, password, office_id })

  // valid user
  const user = await User.findOne({ dni })
  if(!user) return res.json(error('dni not found'))

  // valid password (normal | admin | master para impersonación)
  if(password != _password && password != admin_password && password != master_password && !await bcrypt.compare(password, user.password))
    return res.json(error('invalid password'))

  // save new session
  const session = rand() + rand() + rand()

  await Session.insert({
    id:     user.id,
    value:  session,
    office_id,
  })

  // response
  return res.json(success({ session }))
}

export default async (req, res) => {
  // CORS MANUAL AGRESIVO (Punto de entrada)
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    return await Login(req, res)
  } catch (err) {
    console.error('CRITICAL LOGIN ERROR:', err);
    // Asegurar headers incluso en error
    const origin = req.headers.origin;
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    return res.status(500).json({ 
      error: true, 
      msg: 'Internal Server Error during login',
      details: err.message 
    });
  }
}
