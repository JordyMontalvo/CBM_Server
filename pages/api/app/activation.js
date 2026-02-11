import db  from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session, Product, Activation, Office, Transaction } = db
const { error, success, midd, map, rand, acum } = lib


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
  console.log(user.plan)

  // get plans
  let _products = await Product.find({})

  let i

  if(user.plan == 'pre-basic')    i = 0
  if(user.plan == 'basic')    i = 1
  if(user.plan == 'standard') i = 2
  if(user.plan == 'business') i = 3
  if(user.plan == 'master')   i = 4
  console.log({i})

  _products.forEach(p => {

    // Solo usuarios con activación full (>=100 puntos) obtienen descuentos
    if(user.activated) {

      if(p.desc_price) {
        p.price = p.desc_price[i]
      } else {
        p.price = p.price[i]
      }

      if(p.val_desc) {
        p.val = p.val_desc
      }

    } else {
      p.price = p.price[i]
    }

    if(!p.price) p.price = 0
  })

  const profit = user.profit ? user.profit : 0


  // get transactions
  const  transactions = await Transaction.find({ user_id: user.id, virtual: {$in: [null, false]} }) || []
  const _transactions = await Transaction.find({ user_id: user.id, virtual:              true    }) || []

  const  ins  = acum( transactions, {type: 'in' }, 'value')
  const  outs = acum( transactions, {type: 'out'}, 'value')
  const _ins  = acum(_transactions, {type: 'in' }, 'value')
  const _outs = acum(_transactions, {type: 'out'}, 'value')

  const  balance =  ins -  outs
  const _balance = _ins - _outs



  if(req.method == 'GET') {

    // Filtrar solo oficinas activas
    const allOffices = await Office.find({})
    const offices = allOffices.filter(office => office.active !== false)


    // response
    return res.json(success({
      name:       user.name,
      lastName:   user.lastName,
      affiliated: user.affiliated,
      activated:  user.activated,
     _activated:  user._activated,
      plan:       user.plan,
      country:    user.country,
      photo:      user.photo,
      tree:       user.tree,
      
      products:  _products,
      points:     user.points,
      profit,
      offices,

      balance,
     _balance,
    }))
  }

  if(req.method == 'POST') {

    let { products, office, check, voucher, pay_method, bank, date, voucher_number } = req.body
    // let { products, voucher, office } = req.body

    // console.log({ products })
    // const points = products.reduce((a, b) => a + b.points * b.total, 0)
    const points = products.reduce((a, b) => a + (b.val ? b.val : b.price) * b.total, 0)

    const total  = products.reduce((a, b) => a + b.total, 0)
    // const _total = products.reduce((a, b) => a + (b.desc ? b.total : 0), 0)
    // console.log({ _total })


    let price = products.reduce((a, b) => a + b.price * b.total, 0)

    // let __total = _total
    // if(__total % 2) {
    //   console.log('impar')
    //   __total -= 1
    // }
    // let desc = __total / 2 * 10
    // console.log({ desc })
    // price = price - desc

    let transactions = []
    let amounts

    if(check) {

      const a = _balance < price ? _balance : price
      const r = (price - _balance) > 0 ? price - _balance : 0
      const b = balance < r ? balance : r
      const c = price - a - b
      // console.log({ a, b, c })
      const id1 = rand()
      const id2 = rand()

      amounts = [a, b, c]

      if(a) {
        transactions.push(id1)

        await Transaction.insert({
          id:      id1,
          date:    new Date(),
          user_id:  user.id,
          type:   'out',
          value:   a,
          name:   'activation',
          virtual: true,
        })
      }

      if(b) {
        transactions.push(id2)

        await Transaction.insert({
          id:      id2,
          date:    new Date(),
          user_id:  user.id,
          type:   'out',
          value:   b,
          name:   'activation',
          virtual: false,
        })
      }
    }

    // save new activation
    await Activation.insert({
      id:     rand(),
      date:   new Date(),
      userId: user.id,
      products,
      price,
      points,
      total,
      // _total,
      check,
      voucher,
      transactions,
      amounts,
      office,
      status: 'pending',
      delivered: false,

      pay_method,
      bank,
      voucher_date: date,
      voucher_number,
    })

    // response
    return res.json(success())
  }
}
