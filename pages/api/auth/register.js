import bcrypt from 'bcrypt'
import db     from "../../../components/db"
import lib    from "../../../components/lib"

// const { User, Session, Token, Tree } = db
const { User, Session, Token, Tree } = db
const { rand, error, success, midd } = lib


const Register = async (req, res) => {

  let { country, dni, name, lastName, date, email, password, phone, code } = req.body

  code = code.trim().toUpperCase()

  // Validar formato de email
  if(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if(!emailRegex.test(email)) {
      return res.json(error('invalid email'))
    }
  }

  const user = await User.findOne({ dni })

  // valid dni
  if(user) return res.json(error('dni already use'))
  
  // Validar email duplicado
  if(email) {
    const existingEmail = await User.findOne({ email })
    if(existingEmail) return res.json(error('email already use'))
  }
  
  const parent = await User.findOne({ token: code })

  // valid code
  if(!parent) return res.json(error('code not found'))

  
  password = await bcrypt.hash(password, 12)

  const      id  = rand()
  const session  = rand() + rand() + rand()

  const token  = await Token.findOne({ free: true })

  if(!token) return res.json(error('token not available'))

  await Token.update({ value: token.value }, { free: false })


  await User.insert({
    id,
    date: new Date(),
    country,
    dni,
    name,
    lastName,
    birthdate: date,
    email,
    password,
    phone,
    parentId:   parent.id,
    affiliated: false,
    activated:  false,
    _activated:  false,
    plan:      'default',
    photo:     'https://ik.imagekit.io/asu/impulse/avatar_cWVgh_GNP.png',
    points: 0,
    tree: true,
    token: token.value,
  })
  
  // save new session
  await Session.insert({
    id: id,
    value: session,
  })


  // Agregar el nuevo usuario como hijo directo del patrocinador
  let _id  = parent.id
  let node = await Tree.findOne({ id: _id })

  // Si el nodo del patrocinador no existe en el árbol, crearlo
  if(!node) {
    await Tree.insert({ id: _id, childs: [], parent: parent.parentId || null })
    node = await Tree.findOne({ id: _id })
  }

  // Agregar el nuevo usuario como hijo del patrocinador
  if(!node.childs) node.childs = []
  node.childs.push(id)

  await Tree.update({ id: _id }, { childs: node.childs })
  await Tree.insert({ id: id, childs: [], parent: _id })

  // response
  return res.json(success({ session }))
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

 await midd(req, res); return Register(req, res) }
