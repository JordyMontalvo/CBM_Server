const cors = require('micro-cors')()

import db  from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session, Affiliation, Tree } = db
const { error, success, _ids, _map, model } = lib

// models
// const D = ['id', 'name', 'lastName', 'email', 'phone', 'affiliated', 'activated', 'affiliationDate']
const D = ['id', 'name', 'lastName', 'affiliated', 'activated', 'tree', 'email', 'phone']


const directs = async (req, res) => {

  let { session } = req.query

  // valid session
  session = await Session.findOne({ value: session })
  if(!session) return res.json(error('invalid session'))

  // get USER
  const user = await User.findOne({ id: session.id })

  // find directs
  let directs = await User.find({ parentId: user.id })

  // const ids = _ids(directs)

  // let affiliations = await Affiliation.find({ status: 'approved', userId: { $in: ids } })

  // affiliations = _map(affiliations)

  directs = directs.map(direct => {

    // const affiliation = affiliations.get(direct.id)
    const d = model(direct, D)

    // if(affiliation) return { ...d, plan: affiliation.plan.name }
    // else            return { ...d, plan: null }

    return { ...d }
  })


  // const node = await Tree.findOne({ id: user.id })
  // let childs = node.childs
  // console.log({ childs })

  // let users = await User.find({ id: { $in: childs } })

  // let names = users.map(u => u.name)
  // console.log({ names })

  const node = await Tree.findOne({ id: user.id })
  console.log({ node })
  const childs = node.childs
  console.log({ childs })

  let frontals = await User.find({ id: {$in: childs}})
  frontals = frontals.filter(e => e.parentId != user.id)
  console.log({ frontals })

  frontals = frontals.map(frontal => {
    const d = model(frontal, D)
    return { ...d }
  })

  // response
  return res.json(success({
    name:       user.name,
    lastName:   user.lastName,
    affiliated: user.affiliated,
    _activated: user._activated,
    activated:  user.activated,
    plan:       user.plan,
    country:    user.country,
    photo:      user.photo,
    tree:       user.tree,
    token:      user.token,

    id:       user.id,
    coverage: user.coverage,
    directs,
    frontals,
    // branch:   user.branch,
    // childs,
    // names,
  }))
}

export default cors(directs)
