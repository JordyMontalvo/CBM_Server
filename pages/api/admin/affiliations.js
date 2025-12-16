import db from "../../../components/db";
import lib from "../../../components/lib";
import { MongoClient } from "mongodb";
import { updateTotalPointsCascade } from '../../../components/lib'

const URL = process.env.DB_URL;
const name = process.env.DB_NAME;

const { Affiliation, User, Tree, Token, Transaction, Office } = db;
const { error, success, midd, ids, parent_ids, map, model, rand } = lib;

// valid filters
const q = { all: {}, pending: { status: 'pending'} }

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
      affiliation_id: aff.id,
      virtual,
      _user_id: _id,
    });

    aff.transactions.push(id);
  }

  if (i == 4 || !node.parent || plan == "basic") return;

  pay_bonus(node.parent, arr, i + 1, aff, amount, migration, plan, _id);
}

function total_pay(id, parent_id, aff) {
  const node = tree.find((e) => e.id == id);
  let _pay = 0;
  let r = 0;

  if (node.parentId == parent_id && !node.closeds) {
    if (node.plan == "basic") _pay = 50;
    if (node.plan == "standard") _pay = 150;
    if (node.plan == "business") _pay = 300;
    if (node.plan == "master") _pay = 500;
  }

  if (aff.plan.id == "basic") r = 0.1;
  if (aff.plan.id == "standard") r = 0.2;
  if (aff.plan.id == "business") r = 0.3;
  if (aff.plan.id == "master") r = 0.4;

  _pay = _pay * r;
  aff.plan._pay += _pay;

  node.childs.forEach((_id) => {
    total_pay(_id, parent_id, aff);
  });
}

const handler = async (req, res) => {
  if (req.method == "GET") {
    const { filter, page = 1, limit = 20, search, startDate, endDate } = req.query;
    const { account } = req.query;

    if (!(filter in q)) return res.json(error("invalid filter"));

    // Crear una copia del objeto de query para no mutar el original
    let qq = { ...q[filter] };
    if (account && account !== "admin") {
      qq.office = account;
    }

    try {
      const client = new MongoClient(URL);
      await client.connect();
      const dbClient = client.db(name);

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;
      
      // Límite de seguridad para skip
      const MAX_SKIP = 1000000;
      if (skip > MAX_SKIP) {
        await client.close();
        return res.json(error("Página demasiado alta. Use la búsqueda para encontrar resultados específicos."));
      }

      // Construir query de búsqueda optimizada
      let affiliationsQuery = { ...qq };
      
      // Añadir filtro de fechas si se proporcionan
      if (startDate || endDate) {
        const dateFilter = {};
        
        if (startDate) {
          const startDateObj = new Date(startDate);
          if (!isNaN(startDateObj.getTime())) {
            dateFilter.$gte = startDateObj;
          }
        }
        
        if (endDate) {
          const endDateObj = new Date(endDate);
          if (!isNaN(endDateObj.getTime())) {
            // Añadir 23:59:59 al final del día para incluir todo el día
            endDateObj.setHours(23, 59, 59, 999);
            dateFilter.$lte = endDateObj;
          }
        }
        
        if (Object.keys(dateFilter).length > 0) {
          affiliationsQuery.date = dateFilter;
        }
        
      }
      
      if (search) {
        const searchLower = search.toLowerCase();
        // Usar agregación para búsqueda eficiente
        const pipeline = [
          { $match: affiliationsQuery }, // Aplicar filtros de fecha PRIMERO
          {
            $lookup: {
              from: "users",
              localField: "userId",
              foreignField: "id",
              as: "user",
              pipeline: [
                {
                  $match: {
                    $or: [
                      { name: { $regex: searchLower, $options: "i" } },
                      { lastName: { $regex: searchLower, $options: "i" } },
                      { dni: { $regex: searchLower, $options: "i" } },
                      { phone: { $regex: searchLower, $options: "i" } },
                    ]
                  }
                },
                {
                  $project: { name: 1, lastName: 1, dni: 1, phone: 1 }
                }
              ]
            }
          },
          { $match: { user: { $ne: [] } } },
          { $sort: { date: -1 } },
          { $skip: skip },
          { $limit: limitNum },
          {
            $addFields: {
              name: { $arrayElemAt: ["$user.name", 0] },
              lastName: { $arrayElemAt: ["$user.lastName", 0] },
              dni: { $arrayElemAt: ["$user.dni", 0] },
              phone: { $arrayElemAt: ["$user.phone", 0] }
            }
          },
          {
            $project: { user: 0 }
          }
        ];

        const countPipeline = [
          { $match: affiliationsQuery }, // Aplicar filtros de fecha PRIMERO
          {
            $lookup: {
              from: "users",
              localField: "userId",
              foreignField: "id",
              as: "user",
              pipeline: [
                {
                  $match: {
                    $or: [
                      { name: { $regex: searchLower, $options: "i" } },
                      { lastName: { $regex: searchLower, $options: "i" } },
                      { dni: { $regex: searchLower, $options: "i" } },
                      { phone: { $regex: searchLower, $options: "i" } },
                    ]
                  }
                }
              ]
            }
          },
          { $match: { user: { $ne: [] } } },
          { $count: "total" }
        ];

        const [affiliations, countResult] = await Promise.all([
          dbClient.collection("affiliations").aggregate(pipeline).toArray(),
          dbClient.collection("affiliations").aggregate(countPipeline).toArray()
        ]);

        const totalAffiliations = countResult[0]?.total || 0;

        await client.close();

        const result = affiliations.map((a) => model(a, A));

        return res.json(success({
          affiliations: result,
          total: totalAffiliations,
          totalPages: Math.ceil(totalAffiliations / limitNum),
          currentPage: pageNum,
        }));
      } else {
        // Sin búsqueda - consulta simple optimizada
        const [affiliations, totalAffiliations] = await Promise.all([
          dbClient
            .collection("affiliations")
            .find(affiliationsQuery)
            .sort({ date: -1 })
            .skip(skip)
            .limit(limitNum)
            .toArray(),
          dbClient
            .collection("affiliations")
            .countDocuments(affiliationsQuery)
        ]);

        // Obtener solo los usuarios necesarios
        const userIds = [...new Set(affiliations.map(a => a.userId))];
        const users = await dbClient
          .collection("users")
          .find({ id: { $in: userIds } })
          .project({ id: 1, name: 1, lastName: 1, dni: 1, phone: 1 })
          .toArray();

        const userMap = new Map(users.map(u => [u.id, u]));

        const result = affiliations.map((a) => {
          const user = userMap.get(a.userId);
          return {
            ...model(a, A),
            ...model(user, U)
          };
        });

        await client.close();

        return res.json(success({
          affiliations: result,
          total: totalAffiliations,
          totalPages: Math.ceil(totalAffiliations / limitNum),
          currentPage: pageNum,
        }));
      }
    } catch (err) {
      console.error("Database error:", err);
      return res.status(500).json(error("Database error"));
    }
  }

  if (req.method == "POST") {
    const { id, action, voucher } = req.body;

    let affiliation = await Affiliation.findOne({ id });
    if (!affiliation) return res.json(error("affiliation not exist"));

    if (action == "updateVoucher") {
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
      await Affiliation.update({ id }, { status: "approved" });

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
      
      await updateTotalPointsCascade(User, Tree, user.id);

      const parent = await User.findOne({ id: user.parentId });

      // Cargar datos necesarios para pay_bonus
      tree = await Tree.find({});
      users = await User.find({});

      if (user.plan == "default") {
        const plan = affiliation.plan.id;
        const amount = affiliation.plan.amount;

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
        }

        tree.forEach((node) => {
          const _user = users.find((e) => e.id == node.id);
          node.parentId = _user.parentId;
          node.plan = _user.plan;
        });

        affiliation.plan._pay = 0;
        const node = tree.find((e) => e.id == user.id);

        node.childs.forEach((_id) => {
          total_pay(_id, node.id, affiliation);
        });

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
      } else {
        const plan = affiliation.plan.id;
        const amount = affiliation.plan.amount;

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

      await Affiliation.update(
        { id },
        { transactions: affiliation.transactions }
      );

      // UPDATE STOCK
      const office_id = affiliation.office;
      const products = affiliation.products;
      const office = await Office.findOne({ id: office_id });

      products.forEach((p, i) => {
        if (office.products[i]) office.products[i].total -= products[i].total;
      });

      await Office.update(
        { id: office_id },
        { products: office.products }
      );

      // migrar transacciones virtuales
      const transactions = await Transaction.find({
        user_id: user.id,
        virtual: true,
      });

      for (let transaction of transactions) {
        await Transaction.update({ id: transaction.id }, { virtual: false });
      }
    }

    if (action == "reject") {
      await Affiliation.update({ id }, { status: "rejected" });

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
      const user = await User.findOne({ id: affiliation.userId });
      await Affiliation.delete({ id });

      const transactions = affiliation.transactions;
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
            activated: false,
            _activated: false,
            plan: affiliation.plan.id,
            affiliation_date: affiliation.date,
            affiliation_points: affiliation.plan.affiliation_points,
            n: affiliation.plan.n,
          }
        );
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
        await updateTotalPointsCascade(User, Tree, user.id);
      }

      // UPDATE STOCK
      const office_id = affiliation.office;
      const products = affiliation.products;
      const office = await Office.findOne({ id: office_id });

      products.forEach((p, i) => {
        if (office.products[i]) office.products[i].total += products[i].total;
      });

      await Office.update(
        { id: office_id },
        { products: office.products }
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
