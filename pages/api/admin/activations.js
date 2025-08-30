import db from "../../../components/db";
import lib from "../../../components/lib";
import { MongoClient } from "mongodb";
import { updateTotalPointsCascade } from '../../../components/lib'

const URL = process.env.DB_URL; // Asegúrate de que esta variable esté definida correctamente
const name = process.env.DB_NAME;

const {
  Activation,
  User,
  Tree,
  Token,
  Office,
  Transaction,
  Plan,
  Affiliation,
} = db;
const { error, success, midd, ids, map, model, rand } = lib;

// Definir `qq` como un objeto de consulta
const qq = {}; // Puedes ajustar esto según tus necesidades

// valid filters
// const q = { all: {}, pending: { status: 'pending'} }

// models
const A = [
  "id",
  "date",
  "products",
  "price",
  "points",
  "voucher",
  "status",
  "amounts",
  "office",
  "delivered",
  "closed",
  "pay_method",
  "bank",
  "voucher_date",
  "voucher_number",
];
const U = ["name", "lastName", "dni", "phone"];

let tree = null;

function find(id, i) {
  // i: branch
  const node = tree.find((e) => e.id == id);

  if (node.childs[i] == null) return id;

  return find(node.childs[i], i);
}

function is_upgrade(user, plans, total) {
  const i = plans.findIndex((p) => p.id == user.plan);
  const plan = plans[i];

  let j = -1;

  for (var x = i + 1; x < plans.length; x++) {
    if (plan.amount + total >= plans[x].amount) j = x;
  }

  return j;
}

export default async (req, res) => {
  await midd(req, res);

  if (req.method === "GET") {
    const { filter, page = 1, limit = 100, search, startDate, endDate } = req.query;
    console.log("Received request with page:", page, "limit:", limit, "startDate:", startDate, "endDate:", endDate);
    const q = { all: {}, pending: { status: "pending" } };
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (!(filter in q)) return res.json(lib.error("invalid filter"));

    // Construir un objeto de búsqueda
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

    const skip = (pageNum - 1) * limitNum;
    
    // Validar que el skip no sea demasiado grande (límite de MongoDB)
    const MAX_SKIP = 50000; // 50,000 documentos como límite más seguro
    if (skip > MAX_SKIP) {
      return res.json(lib.error("Página demasiado alta. Use la búsqueda para encontrar resultados específicos."));
    }
    
    // Para páginas muy altas, sugerir usar búsqueda
    if (pageNum > 50) { // Con 100 por página, 50 páginas = 5,000 registros
      return res.json(lib.error("Página demasiado alta. Use la búsqueda para encontrar resultados específicos."));
    }
    
    console.log(
      "Calculated skip:",
      skip,
      "using pageNum:",
      pageNum,
      "and limitNum:",
      limitNum
    );

          try {
        const client = new MongoClient(URL);
        await client.connect();
        const db = client.db(name);
        
        // Crear índice compuesto para mejorar el rendimiento del ordenamiento
        try {
          await db.collection("activations").createIndex(
            { status: 1, date: -1 },
            { background: true }
          );
        } catch (indexError) {
          console.log("Index might already exist:", indexError.message);
        }

      // Buscar usuarios que coincidan con el query de búsqueda
      let userIds = [];
      if (search) {
        const users = await db
          .collection("users")
          .find(userSearchQuery)
          .project({ id: 1 }) // Solo obtener el ID para reducir memoria
          .toArray();
        userIds = users.map((user) => user.id); // Obtener los IDs de los usuarios que coinciden
      }

      // Construir la consulta final combinando filtros
      let finalQuery = {
        ...q[filter], // Aplicar el filtro de estado (pending, all, etc.)
        ...(userIds.length > 0 && { userId: { $in: userIds } }) // Filtro de usuarios si hay búsqueda
      };

      // Añadir filtro de fechas si se proporcionan
      if (startDate || endDate) {
        const dateFilter = {};
        
        if (startDate) {
          dateFilter.$gte = new Date(startDate);
        }
        
        if (endDate) {
          // Añadir 23:59:59 al final del día para incluir todo el día
          const endOfDay = new Date(endDate);
          endOfDay.setHours(23, 59, 59, 999);
          dateFilter.$lte = endOfDay;
        }
        
        if (Object.keys(dateFilter).length > 0) {
          finalQuery.date = dateFilter;
        }
      }

      // Optimizar la consulta para reducir uso de memoria
      // Primero contar el total sin ordenar
      const totalActivations = await db
        .collection("activations")
        .countDocuments(finalQuery);

      // Luego obtener solo los campos necesarios para la paginación
      const activationsCursor = db
        .collection("activations")
        .find(finalQuery, {
          projection: {
            id: 1,
            date: 1,
            userId: 1,
            products: 1,
            price: 1,
            points: 1,
            voucher: 1,
            status: 1,
            amounts: 1,
            office: 1,
            delivered: 1,
            closed: 1,
            pay_method: 1,
            bank: 1,
            voucher_date: 1,
            voucher_number: 1
          }
        })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limitNum)
        .allowDiskUse(true); // Permitir uso de disco para ordenamiento

      const activations = await activationsCursor.toArray();

      console.log("Type of page:", typeof page, "Value:", page);
      console.log("Type of limit:", typeof limit, "Value:", limit);
      console.log("Skip value:", skip);
      console.log("Total activations found:", totalActivations);
      console.log("Total pages calculated:", Math.ceil(totalActivations / limitNum));
      client.close();

      // Obtener usuarios relacionados con las activaciones
      console.log("Activations found:", activations.length);
      console.log("Sample activation:", activations[0]);
      
      let relatedUsers = [];
      if (activations.length > 0) {
        try {
          const userIds = lib.ids(activations);
          console.log("User IDs to fetch:", userIds.length);
          relatedUsers = await User.find({ id: { $in: userIds } });
          relatedUsers = lib.map(relatedUsers);
          console.log("Related users found:", relatedUsers.size);
        } catch (userError) {
          console.error("Error fetching related users:", userError);
          relatedUsers = new Map(); // Fallback a un Map vacío
        }
      }

      const enrichedActivations = activations.map((a) => {
        try {
          let u = relatedUsers.get(a.userId) || {};
          a = lib.model(a, A);
          u = lib.model(u, U);
          return { ...a, ...u };
        } catch (mapError) {
          console.error("Error mapping activation:", mapError, a);
          return lib.model(a, A); // Retornar solo la activación sin usuario
        }
      });

      return res.json(
        lib.success({
          activations: enrichedActivations,
          total: totalActivations,
          totalPages: Math.ceil(totalActivations / limitNum),
          currentPage: pageNum,
        })
      );
    } catch (error) {
      console.error("Database connection error:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        page: pageNum,
        limit: limitNum,
        skip: skip
      });
      
      // Manejar errores específicos de MongoDB
      if (error.message.includes("Sort exceeded memory limit")) {
        return res.status(500).json(lib.error("La consulta es demasiado grande. Use la búsqueda para encontrar resultados específicos."));
      }
      
      if (error.message.includes("allowDiskUse")) {
        return res.status(500).json(lib.error("Error de ordenamiento. Intente con una búsqueda más específica."));
      }
      
      return res.status(500).json(lib.error("Error de base de datos: " + error.message));
    }
  }

  if (req.method == "POST") {
    const { id, action, voucher } = req.body;

    let activation = await Activation.findOne({ id });

    if (!activation) return res.json(error("activation not exist"));

    if (action == "updateVoucher") {
      console.log("updateVoucher ...");
      console.log({ id, voucher });
      await Activation.update({ id }, { voucher });
      return res.json(success());
    }

    if (action == "approve" || action == "reject") {
      if (activation.status == "approved")
        return res.json(error("already approved"));
      if (activation.status == "rejected")
        return res.json(error("already rejected"));
    }

    if (action == "approve") {
      console.log("1");
      // Filtrar productos antes de actualizar la activación
      if (Array.isArray(activation.products)) {
        activation.products = activation.products.filter(p => p.total > 0);
        await Activation.update({ id }, { products: activation.products });
      }
      await Activation.update({ id }, { status: "approved" });

      const user = await User.findOne({ id: activation.userId });

      const points_total = user.points + activation.points;
      console.log({ points_total });

      const _activated = user._activated ? true : points_total >= 60;
      console.log({ _activated });

      const activated = user.activated ? true : points_total >= 100;
      console.log({ activated });

      await User.update(
        { id: user.id },
        {
          activated,
          _activated,
          points: points_total,
        }
      );
      // Actualizar total_points en el árbol
      await updateTotalPointsCascade(User, Tree, user.id);

      if (activated) {
        const transactions = await Transaction.find({
          user_id: user.id,
          virtual: true,
        });

        for (let transaction of transactions) {
          console.log({ transaction });
          await Transaction.update({ id: transaction.id }, { virtual: false });
        }
      }

      console.log("UPDATE STOCK ...");
      const office_id = activation.office;
      const products = activation.products;

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

      const upgrade_arr = user.upgrade_arr || [0, 0];
      const upgrade_pos = user.upgrade_pos || 0;

      upgrade_arr[upgrade_pos] += activation.price;

      const upgrade_total = upgrade_arr[0] + upgrade_arr[1];

      const plans = await Plan.find({});

      const j = is_upgrade(user, plans, upgrade_total);

      if (j != -1) {
        const new_plan = plans[j];

        await Affiliation.insert({
          id: rand(),
          date: new Date(),
          userId: user.id,
          products: [],
          price: new_plan.amount,
          plan: new_plan,
          voucher: null,
          office: null,
          status: "approved",
          delivered: null,

          transactions: [],
          amounts: [],
        });

        await User.update(
          { id: user.id },
          {
            plan: new_plan.id,
            n: new_plan.n,

            upgrade_arr: [0, 0],
            upgrade_pos: 0,
          }
        );
      } else {
        await User.update(
          { id: user.id },
          {
            upgrade_arr,
            upgrade_pos,
          }
        );
      }

      return res.json(success());
    }

    if (action == "reject") {
      await Activation.update({ id }, { status: "rejected" });

      if (activation.transactions) {
        for (let transactionId of activation.transactions) {
          await Transaction.delete({ id: transactionId });
        }
      }

      return res.json(success());
    }

    if (action == "check") {
      console.log("check");
      await Activation.update({ id }, { delivered: true });
    }

    if (action == "uncheck") {
      console.log("uncheck");
      await Activation.update({ id }, { delivered: false });
    }

    if (action == "revert") {
      console.log("revert");

      const user = await User.findOne({ id: activation.userId });

      await Activation.delete({ id });

      user.points = user.points - activation.points;

      await User.update({ id: user.id }, { points: user.points });

      const _activated = user._activated ? true : user.points >= 60;
      const activated = user.activated ? true : user.points >= 100;

      await User.update(
        { id: user.id },
        {
          activated,
          _activated,
        }
      );

      const transactions = activation.transactions;
      console.log(transactions);

      for (let id of transactions) {
        await Transaction.delete({ id });
      }

      console.log("UPDATE STOCK ...");
      const office_id = activation.office;
      const products = activation.products;

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

    if (action == "change") {
      console.log("change");

      const { points } = req.body;
      console.log({ points });

      await Activation.update({ id }, { points });
    }

    return res.json(success());
  } else {
    return res.status(405).json(lib.error("Method not allowed")); // Manejo de métodos no permitidos
  }
};
