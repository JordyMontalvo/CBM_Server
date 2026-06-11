const URL  = process.env.DB_URL
const name = process.env.DB_NAME


class DB {
  constructor({ User, Session, Affiliation, Product, Activation, Banner, Promo, Prom, Plan, Token, Transaction, Tree, Collect, OfficeCollect, Office, Recharge, Closed }) {
    this.User        = User
    this.Session     = Session
    this.Affiliation = Affiliation
    this.Product     = Product
    this.Activation  = Activation
    this.Banner      = Banner
    this.Promo       = Promo
    this.Prom        = Prom
    this.Plan        = Plan
    this.Token       = Token
    this.Transaction = Transaction
    this.Tree        = Tree
    this.Collect     = Collect
    this.OfficeCollect = OfficeCollect
    this.Office      = Office
    this.Recharge    = Recharge
    this.Closed      = Closed
  }
}

class User {
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const user   = await db.collection('users').findOne(query)
    return user
  }
  async find(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const users  = await db.collection('users').find(query).toArray()
    return users
  }
  async findOptimized(query, projection = {}, limit = null) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    let cursor = db.collection('users').find(query, { projection })
    if (limit) cursor = cursor.limit(limit)
    const users = await cursor.toArray()
    return users
  }
  async insert(user) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('users').insertOne(user)
    return
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('users').updateOne(query, { $set: values })
    return
  }

  async updateOne(q, vals) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('users').updateOne(q, { $set: vals })
    return
  }

  async updateMany(q, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('users').updateMany(q, { $set: values })
    return
  }

  async incMany(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('users').updateMany(query, { $inc: values })
    return
  }
}

class Session {
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const session = await db.collection('sessions').findOne(query)
    return session
  }
  async insert(session) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('sessions').insertOne(session)
    return
  }
  async delete(value) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('sessions').deleteOne({ value })
    return
  }

  async deleteMany(q) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('sessions').deleteMany(q)
    return
  }
}

class Affiliation {
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const affiliation = await db.collection('affiliations').findOne(query)
    return affiliation
  }
  async findOneLast(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const affiliation = await db.collection('affiliations').find(query).toArray()
    return (affiliation) ? affiliation[affiliation.length - 1] : null
  }
  async find(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const affiliations = await db.collection('affiliations').find(query).toArray()
    return affiliations
  }
  async insert(affiliation) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('affiliations').insertOne(affiliation)
    return
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('affiliations').updateOne(query, { $set: values })
    return
  }

  async updateMany(q, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('affiliations').updateMany(q, { $set: values })
    return
  }

  async delete(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('affiliations').deleteOne(query)
    return
  }
}

class Banner {
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const banner  = await db.collection('banner').findOne(query)
    return banner
  }
  async find(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const banners = await db.collection('banner').find(query).toArray()
    return banners
  }
  async insert(banner) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('banner').insertOne(banner)
    return
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('banner').updateOne(query, { $set: values })
    return
  }
}

class Promo {
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const promo  = await db.collection('promos').findOne(query)
    return promo
  }
  async find(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const promos = await db.collection('promos').find(query).toArray()
    return promos
  }
  async insert(promo) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('promos').insertOne(promo)
    return
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('promos').updateOne(query, { $set: values })
    return
  }
}

class Prom {
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const promo  = await db.collection('promo').findOne(query)
    return promo
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('promo').updateOne(query, { $set: values })
    return
  }
}

class Product {
  async find(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const products = await db.collection('products').find(query).toArray()
    return products
  }
  async insert(user) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('products').insertOne(user)
    return
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('products').updateOne(query, { $set: values })
    return
  }
  async un_update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('products').updateOne(query, { $unset: values })
    return
  }
  async delete(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('products').deleteOne(query)
    return
  }
}

class Activation {
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const activation = await db.collection('activations').findOne(query)
    return activation
  }
  async find(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const activations = await db.collection('activations').find(query).toArray()
    return activations
  }
  async findLast1000() {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const activations = await db.collection('activations')
      .find({}, { projection: { date: 1, price: 1, points: 1, user_id: 1, _id: 0 } })
      .sort({ date: -1 })
      .limit(1000)
      .toArray()
    return activations
  }
  async insert(activation) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('activations').insertOne(activation)
    return
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('activations').updateOne(query, { $set: values })
    return
  }

  async updateMany(q, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('activations').updateMany(q, { $set: values })
    return
  }

  async delete(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('activations').deleteOne(query)
    return
  }
}

class Plan {
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const plan   = await db.collection('plans').findOne(query)
    return plan
  }
  async find(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const plans  = await db.collection('plans').find(query).toArray()
    return plans
  }
}

class Token {
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const token  = await db.collection('tokens').findOne(query)
    return token
  }
  async insert(token) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('tokens').insertOne(token)
    return
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('tokens').updateOne(query, { $set: values })
    return
  }
}

class Transaction {
  async find(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const transactions = await db.collection('transactions').find(query).toArray()
    return transactions
  }
  async aggregate(pipeline) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const transactions = await db.collection('transactions').aggregate(pipeline).toArray()
    return transactions
  }
  async insert(transaction) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('transactions').insertOne(transaction)
    return
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('transactions').updateOne(query, { $set: values })
    return
  }
  async delete(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('transactions').deleteOne(query)
    return
  }
}

class Tree {
  async find(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const tree   = await db.collection('tree').find(query).toArray()
    return tree
  }
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const node   = await db.collection('tree').findOne(query)
    return node
  }
  async insert(node) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('tree').insertOne(node)
    return
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('tree').updateOne(query, { $set: values })
    return
  }
}

class Collect {
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const collect = await db.collection('collects').findOne(query)
    return collect
  }
  async find(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const collects = await db.collection('collects').find(query).toArray()
    return collects
  }
  async insert(collect) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('collects').insertOne(collect)
    return
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('collects').updateOne(query, { $set: values })
    return
  }
}

class OfficeCollect {
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const office_collect = await db.collection('office_collects').findOne(query)
    return office_collect
  }
  async find(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const office_collects = await db.collection('office_collects').find(query).toArray()
    return office_collects
  }
  async insert(collect) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('office_collects').insertOne(collect)
    return
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('office_collects').updateOne(query, { $set: values })
    return
  }
}

class Office {
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const office = await db.collection('offices').findOne(query)
    return office
  }
  async find(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const offices = await db.collection('offices').find(query).toArray()
    return offices
  }
  async insert(office) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('offices').insertOne(office)
    return
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('offices').updateOne(query, { $set: values })
    return
  }
}

class Recharge {
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const recharge = await db.collection('recharges').findOne(query)
    return recharge
  }
  async find(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const recharges = await db.collection('recharges').find(query).toArray()
    return recharges
  }
  async insert(recharge) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('recharges').insertOne(recharge)
    return
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('recharges').updateOne(query, { $set: values })
    return
  }
}


class Closed {
  async findOne(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const recharge = await db.collection('closeds').findOne(query)
    return recharge
  }
  async find(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const closeds = await db.collection('closeds').find(query).toArray()
    return closeds
  }
  async insert(recharge) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('closeds').insertOne(recharge)
    return
  }
  async update(query, values) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    await db.collection('closeds').updateOne(query, { $set: values })
    return
  }
  async findOptimized(query, projection = {}, limit = null) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    let cursor = db.collection('closeds').find(query, { projection })
    if (limit) cursor = cursor.limit(limit)
    const closeds = await cursor.toArray()
    return closeds
  }
  async aggregate(pipeline) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const results = await db.collection('closeds').aggregate(pipeline).toArray()
    return results
  }
  async countDocuments(query) {
    const { db } = await require('../lib/mongodb').connectToDatabase()
    const count = await db.collection('closeds').countDocuments(query)
    return count
  }
}

module.exports = new DB({
  User:        new User(),
  Session:     new Session(),
  Affiliation: new Affiliation(),
  Product:     new Product(),
  Activation:  new Activation(),
  Banner:      new Banner(),
  Promo:       new Promo(),
  Prom:        new Prom(),
  Plan:        new Plan(),
  Token:       new Token(),
  Transaction: new Transaction(),
  Tree:        new Tree(),
  Collect:     new Collect(),
  OfficeCollect: new OfficeCollect(),
  Office:      new Office(),
  Recharge:    new Recharge(),
  Closed:      new Closed(),
})
