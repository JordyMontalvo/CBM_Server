import db from "../../../components/db";
import lib from "../../../components/lib";
import { MongoClient } from "mongodb";
import { updateTotalPointsCascade } from '../../../components/lib'

const URL = process.env.DB_URL; // Asegúrate de que esta variable esté definida correctamente
const name = process.env.DB_NAME;

const { Affiliation, User, Tree, Token, Transaction, Office } = db;
const { error, success, midd, ids, parent_ids, map, model, rand } = lib;

// valid filters
// const q = { all: {}, pending: { status: 'pending'} }

const A = [
  "id",
  "date",
  "plan",
  "voucher",
  "status",
  "office",
  "delivered",
  "remaining",
  "pay_method",
  "bank",
  "voucher_date",
  "voucher_number",
  "amounts",
  "price",
  "products",
];
const U = ["name", "lastName", "dni", "phone"];

let users = null;
let tree = null;

const pay = {
  "pre-basic": [],
  basic: [0.1],
  standard: [0.2, 0.02, 0.02],
  business: [0.3, 0.02, 0.05, 0.01],
  master: [0.4, 0.02, 0.05, 0.01, 0.005],
};

// let pays = []

// let _affs

// async function pay_bonus(id, arr, i, aff_id, amount, migration, plan, _id) {
async function pay_bonus(id, arr, i, aff, amount, migration, plan, _id) {
  const user = users.find((e) => e.id == id);
  const node = tree.find((e) => e.id == id);

  const virtual = user.activated ? false : true;

  const name = migration ? "migration bonus" : "affiliation bonus";

  if (user.plan != "default" && i <= user.n - 1) {
    let p = plan != "basic" ? pay[user.plan][i] : 0.1;

    const id = rand();

    await Transaction.insert({
      id,
      date: new Date(),
      user_id: user.id,
      type: "in",
      value: p * amount,
      name,
      // affiliation_id: aff_id,
      affiliation_id: aff.id,
      virtual,
      _user_id: _id,
    });

    // pays.push(id)
    aff.transactions.push(id);
  }

  if (i == 4 || !node.parent || plan == "basic") return;

  // pay_bonus(node.parent, arr, i + 1, aff_id, amount, migration, plan, _id)
  pay_bonus(node.parent, arr, i + 1, aff, amount, migration, plan, _id);
}

// async function pay_bonus_2(id, arr, i, aff, amount, plan, _id) {

//   if(!id) return

//   const user = users.find(e => e.id == id)
//   const node =  tree.find(e => e.id == id)

//   if(user.id == _id) {

//     if(i <= (aff.plan.n - 1)) {

//       let p = plan != 'basic' ? pay[user.plan][i] : 0.1

//       aff.pays.push(p * amount)
//     }
//   }

//   if (i == 4 || !node.parent || plan == 'basic') return

//   pay_bonus_2(node.parent, arr, i + 1, aff, amount, plan, _id)
// }

// function pay_bonus_2(id, arr, i, aff, plan, _id) {

//   if(!id) return

//   const user = users.find(e => e.id == id)
//   const node =  tree.find(e => e.id == id)
//   const _aff = _affs.find(e => e.userId == id)

//   if(user.id == _id) {

//     if(i <= (aff.plan.n - 1)) {

//       let p = plan != 'basic' ? pay[user.plan][i] : 0.1

//       aff.pays.push(p * _aff.plan.amount)
//     }
//   }

//   if (i == 4 || !node.parent || plan == 'basic') return

//   pay_bonus_2(node.parent, arr, i + 1, aff, plan, _id)
// }

function total_pay(id, parent_id, aff) {
  console.log(id, parent_id);

  const node = tree.find((e) => e.id == id);
  console.log(node);

  let _pay = 0;
  let r = 0;

  if (node.parentId == parent_id && !node.closeds) {
    console.log(":)");

    if (node.plan == "basic") _pay = 50;
    if (node.plan == "standard") _pay = 150;
    if (node.plan == "business") _pay = 300;
    if (node.plan == "master") _pay = 500;

    console.log(_pay);
  }

  console.log(aff.plan.id);

  if ((aff.plan.id = "basic")) r = 0.1;
  if ((aff.plan.id = "standard")) r = 0.2;
  if ((aff.plan.id = "business")) r = 0.3;
  if ((aff.plan.id = "master")) r = 0.4;
  console.log(r);

  _pay = _pay * r;
  console.log(_pay);

  aff.plan._pay += _pay;

  node.childs.forEach((_id) => {
    total_pay(_id, parent_id, aff);
  });
}

const handler = async (req, res) => {
  if (req.method == "GET") {
    // Obtener parámetros de paginación
    const { filter, page = 1, limit = 20, search } = req.query;
    console.log(
      "Received request with page:",
      page,
      "and limit:",
      limit,
      "search:",
      search
    );

    const q = { all: {}, pending: { status: "pending" } };

    if (!(filter in q)) return res.json(error("invalid filter"));

    const { account } = req.query;

    // get AFFILIATIONS
    let qq = q[filter];

    if (account != "admin") qq.office = account;

    try {
      const client = new MongoClient(URL);
      await client.connect();
      const dbClient = client.db(name);

      // PAGINACIÓN Y ORDENAMIENTO EN LA BASE DE DATOS
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;
      
      // Validar que el skip no sea demasiado grande (límite de MongoDB)
      const MAX_SKIP = 1000000; // 1 millón de documentos como límite seguro
      if (skip > MAX_SKIP) {
        return res.json(error("Página demasiado alta. Use la búsqueda para encontrar resultados específicos."));
      }

      // Construir un objeto de búsqueda para usuarios
      let userSearchQuery = {};
      if (search) {
        const searchLower = search.toLowerCase();
        userSearchQuery = {
          $or: [
            { name: { $regex: searchLower, $options: "i" } },
            { lastName: { $regex: searchLower, $options: "i" } },
            { dni: { $regex: searchLower, $options: "i" } },
            { phone: { $regex: searchLower, $options: "i" } },
          ],
        };
      }

      // Buscar usuarios que coincidan con el query de búsqueda
      let userIds = [];
      if (search) {
        const users = await dbClient
          .collection("users")
          .find(userSearchQuery)
          .toArray();
        userIds = users.map((user) => user.id); // Obtener los IDs de los usuarios que coinciden
      }

      // Filtrar afiliaciones según el userIds encontrados Y el filtro de estado
      const affiliationsQuery = {
        ...qq, // Aplicar el filtro de estado (pending, all, etc.)
        ...(userIds.length > 0 && { userId: { $in: userIds } }) // Aplicar filtro de usuarios solo si hay búsqueda
      };

      // Total de afiliaciones
      const totalAffiliations = await dbClient
        .collection("affiliations")
        .countDocuments(affiliationsQuery);

      // Afiliaciones paginadas y ordenadas
      let affiliations = await dbClient
        .collection("affiliations")
        .find(affiliationsQuery)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray();

      // Obtener solo los usuarios necesarios para las afiliaciones paginadas
      users = await User.find({ id: { $in: ids(affiliations) } });
      users = map(users);

      // enrich affiliations
      affiliations = affiliations.map((a) => {
        let u = users.get(a.userId);
        a = model(a, A);
        u = model(u, U);
        return { ...a, ...u };
      });

      let parents = await User.find({ id: { $in: parent_ids(affiliations) } });

      await client.close();

      // Devolver los resultados con información de paginación
      return res.json(
        success({
          affiliations,
          total: totalAffiliations,
          totalPages: Math.ceil(totalAffiliations / limitNum),
          currentPage: pageNum,
        })
      );
    } catch (err) {
      console.error("Database error:", err);
      return res.status(500).json(error("Database error"));
    }
  }

  if (req.method == "POST") {
    const { id, action, voucher } = req.body;

    // get affiliation
    let affiliation = await Affiliation.findOne({ id });

    // validate affiliation
    if (!affiliation) return res.json(error("affiliation not exist"));

    if (action == "updateVoucher") {
      console.log("updateVoucher ...");
      console.log({ id, voucher });
      await Affiliation.update({ id }, { voucher });
      return res.json(success());
    }

    if (action == "approve" || action == "reject") {
      if (affiliation.status == "approved")
        return res.json(error("already approved"));
      if (affiliation.status == "rejected")
        return res.json(error("already rejected"));
    }

    if (action == "approve") {
      // approve AFFILIATION
      await Affiliation.update({ id }, { status: "approved" });

      // update USER
      let user = await User.findOne({ id: affiliation.userId });

      await User.update(
        { id: user.id },
        {
          affiliated: true,
          activated: true,
          affiliation_date: new Date(),
          plan: affiliation.plan.id,
          n: affiliation.plan.n,
          affiliation_points: affiliation.plan.affiliation_points,
        }
      );
      
      // Actualizar total_points en el árbol
      await updateTotalPointsCascade(User, Tree, user.id);

      const parent = await User.findOne({ id: user.parentId });

      // pay BONUS
      tree = await Tree.find({});
      users = await User.find({});
      // pays  = []

      if (user.plan == "default") {
        // PAY AFFILIATION BONUS

        const plan = affiliation.plan.id;
        const amount = affiliation.plan.amount;
        console.log(1);
        // pay_bonus(user.parentId, pay, 0, affiliation.id, amount, false, plan, user.id)

        if (plan != "pre-basic") {
          pay_bonus(
            user.parentId,
            pay,
            0,
            affiliation,
            amount,
            false,
            plan,
            user.id
          );
          console.log(2);
        }

        // .................................................................

        tree.forEach((node) => {
          const _user = users.find((e) => e.id == node.id);

          node.parentId = _user.parentId;
          node.plan = _user.plan;
        });
        // console.log(3)

        // _affs = await Affiliation.find({})

        // affiliation.pays = []

        // for(let node of tree) {
        //   if(node.affiliated) {

        //     const _user = users.find(e => e.id == node.id)
        //     // console.log('user: ', _user.name)
        //     // pay_bonus_2(_user.parentId, pay, 0, affiliation, amount, _user.plan, user.id)
        //     pay_bonus_2(_user.parentId, pay, 0, affiliation, _user.plan, user.id)
        //   }
        // }
        // console.log(4)

        // affiliation.plan.pay = affiliation.pays.reduce((a, b) => a + b, 0)

        // .................................................................

        // const _pay = affiliation.plan.pay - (affiliation.amounts ? affiliation.amounts[1] : 0)
        // console.log({ _pay })

        affiliation.plan._pay = 0;

        const node = tree.find((e) => e.id == user.id);
        console.log(node);

        node.childs.forEach((_id) => {
          total_pay(_id, node.id, affiliation);
        });

        console.log("affiliation.plan._pay: ", affiliation.plan._pay);

        if (affiliation.plan._pay) {
          let _id = rand();

          await Transaction.insert({
            id: _id,
            date: new Date(),
            user_id: user.id,
            type: "in",
            value: affiliation.plan._pay,
            name: "remaining",
            virtual: false,
          });

          affiliation.transactions.push(_id);
        }

        if (affiliation.amounts && affiliation.amounts[1]) {
          let _id = rand();

          await Transaction.insert({
            id: _id,
            date: new Date(),
            user_id: user.id,
            type: "out",
            value: affiliation.amounts[1],
            name: "remaining",
            virtual: false,
          });

          affiliation.transactions.push(_id);
        }

        // if(_pay > 0) {

        //   let _id = rand()

        //   await Transaction.insert({
        //     id:     _id,
        //     date:    new Date(),
        //     user_id: user.id,
        //     type:   'in',
        //     value:   affiliation.plan.pay,
        //     name:   'remaining',
        //     virtual: false,
        //   })

        //   pays.push(_id)

        //   _id = rand()

        //   await Transaction.insert({
        //     id:     _id,
        //     date:    new Date(),
        //     user_id: user.id,
        //     type:   'out',
        //     value:  (affiliation.amounts ? affiliation.amounts[1] : 0),
        //     name:   'remaining',
        //     virtual: false,
        //   })

        //   pays.push(_id)
        // }

        // if(_pay < 0 || _pay == 0) {

        //   let _id = rand()

        //   await Transaction.insert({
        //     id:     _id,
        //     date:    new Date(),
        //     user_id: user.id,
        //     type:   'in',
        //     value:   affiliation.plan.pay,
        //     name:   'remaining',
        //     virtual: false,
        //   })

        //   pays.push(_id)

        //   _id = rand()

        //   await Transaction.insert({
        //     id:     _id,
        //     date:    new Date(),
        //     user_id: user.id,
        //     type:   'out',
        //     value:   affiliation.plan.pay,
        //     name:   'remaining',
        //     virtual: false,
        //   })

        //   pays.push(_id)
        // }
      } else {
        // PAY AFFILIATION BONUS

        const plan = affiliation.plan.id;
        const amount = affiliation.plan.amount;

        // pay_bonus(user.parentId, pay, 0, affiliation.id, amount, true, plan, user.id)

        if (plan != "pre-basic") {
          pay_bonus(
            user.parentId,
            pay,
            0,
            affiliation,
            amount,
            true,
            plan,
            user.id
          );
        }
      }

      // await Affiliation.update({ id }, { transactions: pays })
      await Affiliation.update(
        { id },
        { transactions: affiliation.transactions }
      );

      // UPDATE STOCK
      // console.log('UPDATE STOCK ...')
      const office_id = affiliation.office;
      const products = affiliation.products;

      const office = await Office.findOne({ id: office_id });

      products.forEach((p, i) => {
        if (office.products[i]) office.products[i].total -= products[i].total;
      });

      await Office.update(
        { id: office_id },
        {
          products: office.products,
        }
      );

      // migrar transaccinoes virtuales
      const transactions = await Transaction.find({
        user_id: user.id,
        virtual: true,
      });

      for (let transaction of transactions) {
        // console.log({ transaction })
        await Transaction.update({ id: transaction.id }, { virtual: false });
      }
    }

    if (action == "reject") {
      await Affiliation.update({ id }, { status: "rejected" });

      // revert transactions
      if (affiliation.transactions) {
        for (let transactionId of affiliation.transactions) {
          await Transaction.delete({ id: transactionId });
        }
      }
    }

    if (action == "check") {
      await Affiliation.update({ id }, { delivered: true });
    }

    if (action == "uncheck") {
      await Affiliation.update({ id }, { delivered: false });
    }

    if (action == "revert") {
      // console.log('revert')

      const user = await User.findOne({ id: affiliation.userId });

      await Affiliation.delete({ id });

      const transactions = affiliation.transactions;
      // console.log(transactions)

      for (let id of transactions) {
        await Transaction.delete({ id });
      }

      const affiliations = await Affiliation.find({
        userId: user.id,
        status: "approved",
      });

      if (affiliations.length) {
        affiliation = affiliations[affiliations.length - 1];

        await User.update(
          { id: user.id },
          {
            // affiliated: false,
            activated: false,
            _activated: false,
            plan: affiliation.plan.id,
            affiliation_date: affiliation.date,
            affiliation_points: affiliation.plan.affiliation_points,
            n: affiliation.plan.n,
          }
        );
        
        // Actualizar total_points en el árbol
        await updateTotalPointsCascade(User, Tree, user.id);
      } else {
        await User.update(
          { id: user.id },
          {
            affiliated: false,
            activated: false,
            _activated: false,
            plan: "default",
            affiliation_date: null,
            affiliation_points: 0,
            n: 0,
          }
        );
        
        // Actualizar total_points en el árbol
        await updateTotalPointsCascade(User, Tree, user.id);
      }

      // UPDATE STOCK
      // console.log('UPDATE STOCK ...')
      const office_id = affiliation.office;
      const products = affiliation.products;

      const office = await Office.findOne({ id: office_id });

      products.forEach((p, i) => {
        if (office.products[i]) office.products[i].total += products[i].total;
      });

      await Office.update(
        { id: office_id },
        {
          products: office.products,
        }
      );
    }

    return res.json(success());
  }
};

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


  await midd(req, res);
  return handler(req, res);
};
