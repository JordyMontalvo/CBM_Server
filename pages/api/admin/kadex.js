import db from "../../../components/db";
import lib from "../../../components/lib";
import { MongoClient } from "mongodb";

const URL = process.env.DB_URL;
const name = process.env.DB_NAME;

const { midd, success, rand } = lib;

export default async (req, res) => {
  await midd(req, res);

  if (req.method == "GET") {
    const productId = req.query.productId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const start = (page - 1) * limit;
    const end = start + limit;

    const client = new MongoClient(URL);
    await client.connect();
    const database = client.db(name);

    // Traer todos los datos necesarios
    let products = await database.collection("products").find({}).toArray();
    let recharges = await database.collection("recharges").find({}).toArray();
    let affiliations = await database
      .collection("affiliations")
      .find({})
      .toArray();
    let activations = await database
      .collection("activations")
      .find({})
      .toArray();

    await client.close();

    // Si no se especifica productId, usar el primero
    const selectedProductId = productId || (products[0] && products[0].id);

    // Replicar la lógica del computed 'table' del frontend
    let ret = [];
    for (let recharge of recharges) {
      if (!recharge.products) continue;
      for (let product of recharge.products) {
        if (product.id == selectedProductId && product.total) {
          ret.push({
            type: "in",
            date: recharge.date,
            id: product.id,
            name: product.name,
            total: product.total,
            office: recharge.office_id,
          });
        }
      }
    }
    for (let affiliation of affiliations) {
      if (affiliation.products) {
        for (let product of affiliation.products) {
          if (product.id == selectedProductId && product.total) {
            ret.push({
              type: "out",
              date: affiliation.date,
              id: product.id,
              name: product.name,
              total: product.total,
              affiliation: true,
              price: product.price,
              office: affiliation.office,
            });
          }
        }
      }
    }
    for (let activation of activations) {
      if (!activation.products) continue;
      for (let product of activation.products) {
        if (product.id == selectedProductId && product.total) {
          ret.push({
            type: "out",
            date: activation.date,
            id: product.id,
            name: product.name,
            total: product.total,
            activation: true,
            price: product.price,
            office: activation.office,
          });
        }
      }
    }
    ret.sort(function (a, b) {
      return new Date(a.date) - new Date(b.date);
    });
    for (let r of ret) {
      r.reason =
        r.type == "in" ? "RECARGA" : r.affiliation ? "AFILIACIÓN" : "RECOMPRA";
      r.total_in = r.type == "in" ? r.total : 0;
      r.total_out = r.type == "out" ? r.total : 0;
      r.price = r.price ? r.price : 0;
      r.total_price = r.type == "out" ? r.total * r.price : 0;
    }
    for (let [i, r] of ret.entries()) {
      let a = i == 0 ? 0 : ret[i - 1].balance;
      r.balance = a + r.total_in - r.total_out;
    }
    const total = ret.length;
    const paginated = ret.slice(start, end);

    return res.json(
      success({
        table: paginated,
        total,
        page,
        limit,
        productId: selectedProductId,
        products: products.map((p) => ({ id: p.id, name: p.name })),
      })
    );
  }
};
