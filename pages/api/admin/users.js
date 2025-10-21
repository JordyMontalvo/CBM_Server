import bcrypt from "bcrypt";
import db from "../../../components/db";
import lib from "../../../components/lib";
import { MongoClient } from "mongodb";
import { updateTotalPointsCascade } from '../../../components/lib'

const { User, Transaction, Tree} = db;
const { error, success, midd, model, rand } = lib;

// valid filters
// const q = { all: {}, affiliated: { affiliated: true }, activated: { activated: true } }

// models
const U = [
  "id",
  "date",
  "name",
  "lastName",
  "dni",
  "email",
  "phone",
  "department",
  "affiliated",
  "activated",
  "token",
  "points",
  "balance",
  "parent",
  "virtualbalance",
  "country",
  "rank",
  "affiliation_points",
];

const URL = process.env.DB_URL;
const name = process.env.DB_NAME;

const handler = async (req, res) => {
  if (req.method == "GET") {
    const { filter, page = 1, limit = 20, search, showAvailable } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const q = {
      all: {},
      affiliated: { affiliated: true },
      activated: { activated: true },
    };
    if (!(filter in q)) return res.json(error("invalid filter"));

    // Construir query de búsqueda
    let userSearchQuery = { ...q[filter] };
    if (search) {
      const searchLower = search.toLowerCase();
      userSearchQuery.$or = [
        { name: { $regex: searchLower, $options: "i" } },
        { lastName: { $regex: searchLower, $options: "i" } },
        { dni: { $regex: searchLower, $options: "i" } },
        { country: { $regex: searchLower, $options: "i" } },
        { phone: { $regex: searchLower, $options: "i" } },
      ];
    }

    try {
      const client = new MongoClient(URL);
      await client.connect();
      const db = client.db(name);

      // Total de usuarios (solo count, sin cálculos pesados)
      const totalUsers = await db
        .collection("users")
        .countDocuments(userSearchQuery);

      // Totales globales simplificados (sin cálculos pesados)
      const totalBalance = 0; // Deshabilitado temporalmente por performance
      const totalVirtualBalance = 0; // Deshabilitado temporalmente por performance

      // Usuarios paginados y ordenados
      let users = await db
        .collection("users")
        .find(userSearchQuery)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray();

      // Si showAvailable, filtrar usuarios con saldo disponible
      if (showAvailable === "true") {
        const userIds = users.map((u) => u.id);
        const transaction = await db
          .collection("transactions")
          .find({ user_id: { $in: userIds }, virtual: { $in: [null, false] } })
          .toArray();
        users = users.filter((user) => {
          const ins = transaction
            .filter((i) => i.user_id == user.id && i.type == "in")
            .reduce((a, b) => a + parseFloat(b.value), 0);
          const outs = transaction
            .filter((i) => i.user_id == user.id && i.type == "out")
            .reduce((a, b) => a + parseFloat(b.value), 0);
          return ins - outs > 0;
        });
      }

      // Obtener los padres antes de usarlos
      const parentIds = users.filter((i) => i.parentId).map((i) => i.parentId);
      const parents =
        parentIds.length > 0
          ? await db
              .collection("users")
              .find({ id: { $in: parentIds } })
              .toArray()
          : [];
      users = users.map((user) => {
        if (user.parentId) {
          const i = parents.findIndex((el) => el.id == user.parentId);
          if (i !== -1) {
            user.parent = parents[i];
          }
        }
        return user;
      });

      // Calcular balances usando agregación optimizada solo para usuarios paginados
      const userIds = users.map((u) => u.id);
      
      if (userIds.length > 0) {
        const userBalances = await db.collection("transactions").aggregate([
          { $match: { user_id: { $in: userIds }, virtual: { $in: [null, false] } } },
          {
            $group: {
              _id: "$user_id",
              balance: {
                $sum: {
                  $cond: [
                    { $eq: ["$type", "in"] },
                    { $toDouble: "$value" },
                    { $multiply: [{ $toDouble: "$value" }, -1] }
                  ]
                }
              }
            }
          }
        ]).toArray();

        const userVirtualBalances = await db.collection("transactions").aggregate([
          { $match: { user_id: { $in: userIds }, virtual: true } },
          {
            $group: {
              _id: "$user_id",
              virtualBalance: {
                $sum: {
                  $cond: [
                    { $eq: ["$type", "in"] },
                    { $toDouble: "$value" },
                    { $multiply: [{ $toDouble: "$value" }, -1] }
                  ]
                }
              }
            }
          }
        ]).toArray();

        // Mapear balances a usuarios
        users = users.map((user) => {
          const balance = userBalances.find(b => b._id === user.id);
          const virtualBalance = userVirtualBalances.find(b => b._id === user.id);
          
          user.balance = balance ? balance.balance : 0;
          user.virtualbalance = virtualBalance ? virtualBalance.virtualBalance : 0;
          return user;
        });
      } else {
        // Si no hay usuarios, asignar valores por defecto
        users = users.map((user) => {
          user.balance = 0;
          user.virtualbalance = 0;
          return user;
        });
      }

      // parse user
      users = users.map((user) => {
        const u = model(user, U);
        return { ...u };
      });

      // Calcular totales de los usuarios paginados

      await client.close();

      // response con información de paginación
      return res.json(
        success({
          users,
          total: totalUsers,
          totalPages: Math.ceil(totalUsers / limitNum),
          currentPage: pageNum,
          totalBalance,
          totalVirtualBalance,
        })
      );
    } catch (err) {
      console.error("Database error:", err);
      return res.status(500).json(error("Database error"));
    }
  }

  if (req.method == "POST") {
    console.log("POST ...");

    const { action, id } = req.body;
    console.log({ action, id });

    if (action == "migrate") {
      console.log("migrate ...");

      // migrar transaccinoes virtuales
      const transactions = await Transaction.find({
        user_id: id,
        virtual: true,
      });
      // console.log({ transactions })

      for (let transaction of transactions) {
        console.log({ transaction });

        await Transaction.update({ id: transaction.id }, { virtual: false });
      }
    }

    if (action == "toggle-active") {
      console.log("=== TOGGLE-ACTIVE BACKEND ===");
      const { activated } = req.body;
      
      console.log('req.body completo:', req.body);
      console.log('activated recibido:', activated, 'tipo:', typeof activated);
      
      const user = await User.findOne({ id });
      if (!user) return res.json(error("Usuario no encontrado"));

      console.log('Usuario actual - activated:', user.activated, 'tipo:', typeof user.activated);

      // Asegurar que activated sea un booleano verdadero
      let activatedValue;
      if (activated === true || activated === 'true' || activated === 1 || activated === '1') {
        activatedValue = true;
      } else if (activated === false || activated === 'false' || activated === 0 || activated === '0') {
        activatedValue = false;
      } else {
        // Si no es claro, usar el valor opuesto al actual
        activatedValue = !user.activated;
      }
      
      console.log('Valor calculado activatedValue:', activatedValue, 'tipo:', typeof activatedValue);
      console.log(`Cambiando estado de usuario ${id}:`, {
        estadoAnterior: user.activated,
        nuevoEstado: activatedValue
      });

      await User.update({ id }, { activated: activatedValue });
      
      // Verificar que se actualizó correctamente
      const updatedUser = await User.findOne({ id });
      console.log(`Estado después de actualizar:`, updatedUser.activated, 'tipo:', typeof updatedUser.activated);
      
      return res.json(success({ activated: activatedValue }));
    }

    if (action == "transfer-balance") {
      console.log("=== TRANSFER-BALANCE BACKEND ===");
      console.log("req.body completo:", req.body);
      const { amount, direction } = req.body; // direction: 'toVirtual' or 'toAvailable'
      
      console.log("amount recibido:", amount, "tipo:", typeof amount);
      console.log("direction recibido:", direction);
      
      // Convertir amount a número
      const amountNum = parseFloat(amount);
      console.log("amount convertido a número:", amountNum, "tipo:", typeof amountNum);
      console.log("isNaN(amountNum):", isNaN(amountNum));
      console.log("amountNum <= 0:", amountNum <= 0);
      
      if (!amount || isNaN(amountNum) || amountNum <= 0) {
        console.log("❌ Rechazando transferencia - monto inválido");
        return res.json(error("Monto inválido"));
      }

      const user = await User.findOne({ id });
      if (!user) {
        console.log("❌ Usuario no encontrado:", id);
        return res.json(error("Usuario no encontrado"));
      }
      
      console.log("✓ Usuario encontrado:", user.name, user.lastName);

      try {
        // Verificar saldos actuales
        const availableTransactions = await Transaction.find({
          user_id: id,
          virtual: { $in: [null, false] }
        });
        const virtualTransactions = await Transaction.find({
          user_id: id,
          virtual: true
        });

        const availableIns = availableTransactions
          .filter(t => t.type === 'in')
          .reduce((sum, t) => sum + parseFloat(t.value), 0);
        const availableOuts = availableTransactions
          .filter(t => t.type === 'out')
          .reduce((sum, t) => sum + parseFloat(t.value), 0);
        const availableBalance = availableIns - availableOuts;

        const virtualIns = virtualTransactions
          .filter(t => t.type === 'in')
          .reduce((sum, t) => sum + parseFloat(t.value), 0);
        const virtualOuts = virtualTransactions
          .filter(t => t.type === 'out')
          .reduce((sum, t) => sum + parseFloat(t.value), 0);
        const virtualBalance = virtualIns - virtualOuts;

        console.log("Saldo disponible:", availableBalance);
        console.log("Saldo no disponible:", virtualBalance);

        if (direction === 'toVirtual') {
          // De disponible a no disponible
          console.log(`Intentando transferir ${amountNum} de disponible (${availableBalance}) a no disponible`);
          
          if (availableBalance < amountNum) {
            console.log("❌ Saldo insuficiente");
            return res.json(error(`Saldo disponible insuficiente. Disponible: ${availableBalance.toFixed(2)}, Solicitado: ${amountNum.toFixed(2)}`));
          }

          // Crear transacción de salida en disponible
          await Transaction.insert({
            id: rand(),
            user_id: id,
            type: 'out',
            value: amountNum,
            virtual: false,
            date: new Date(),
            name: 'admin-transfer',
            desc: 'Transferencia a saldo no disponible'
          });

          // Crear transacción de entrada en no disponible
          await Transaction.insert({
            id: rand(),
            user_id: id,
            type: 'in',
            value: amountNum,
            virtual: true,
            date: new Date(),
            name: 'admin-transfer',
            desc: 'Transferencia desde saldo disponible'
          });

          console.log(`✓ Transferencia exitosa: ${amountNum} de disponible a no disponible para usuario ${id}`);

        } else if (direction === 'toAvailable') {
          // De no disponible a disponible
          console.log(`Intentando transferir ${amountNum} de no disponible (${virtualBalance}) a disponible`);
          
          if (virtualBalance < amountNum) {
            console.log("❌ Saldo insuficiente");
            return res.json(error(`Saldo no disponible insuficiente. Disponible: ${virtualBalance.toFixed(2)}, Solicitado: ${amountNum.toFixed(2)}`));
          }

          // Crear transacción de salida en no disponible
          await Transaction.insert({
            id: rand(),
            user_id: id,
            type: 'out',
            value: amountNum,
            virtual: true,
            date: new Date(),
            name: 'admin-transfer',
            desc: 'Transferencia a saldo disponible'
          });

          // Crear transacción de entrada en disponible
          await Transaction.insert({
            id: rand(),
            user_id: id,
            type: 'in',
            value: amountNum,
            virtual: false,
            date: new Date(),
            name: 'admin-transfer',
            desc: 'Transferencia desde saldo no disponible'
          });

          console.log(`✓ Transferencia exitosa: ${amountNum} de no disponible a disponible para usuario ${id}`);
        } else {
          console.log("❌ Dirección inválida:", direction);
          return res.json(error("Dirección de transferencia inválida"));
        }

        return res.json(success({ 
          message: 'Transferencia completada exitosamente',
          amount: amountNum,
          direction
        }));
      } catch (err) {
        console.error("Error en transfer-balance:", err);
        return res.json(error("Error al procesar la transferencia: " + err.message));
      }
    }

    if (action == "name") {
      // console.log('edit name ...')

      const { _name, _lastName, _dni, _password, _parent_dni, _points, _rank, _affiliation_points } =
        req.body.data;
      console.log({
        _name,
        _lastName,
        _dni,
        _password,
        _parent_dni,
        _points,
        _rank,
        _affiliation_points,
      });

      const user = await User.findOne({ id });

      if (_dni != user.dni) {
        // error dni
        const user2 = await User.findOne({ dni: _dni });

        if (user2) return res.json(error("invalid dni"));
      }

      const updateData = {
        name: _name,
        lastName: _lastName,
        dni: _dni,
        points: _points,
        rank: _rank,
        activated: _points >= 100 ? true : user.activated,
      };

      // Solo actualizar affiliation_points si se proporciona
      if (_affiliation_points !== undefined && _affiliation_points !== null) {
        updateData.affiliation_points = parseFloat(_affiliation_points);
      }

      await User.update({ id }, updateData);
      
      // Actualizar total_points en el árbol
      await updateTotalPointsCascade(User, Tree, id);

      if (_password) {
        const password = await bcrypt.hash(_password, 12);

        await User.update({ id }, { password });
      }

      if (_parent_dni) {
        const parent = await User.findOne({ dni: _parent_dni });

        if (!parent) return res.json(error("invalid parent dni"));
        if (parent.id == user.id) return res.json(error("invalid parent dni"));

        await User.update({ id }, { parentId: parent.id });
      }
    }

    // response
    return res.json(success({}));
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

  // Timeout de 25 segundos (menos que el límite de Heroku de 30s)
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json(error('Request timeout'));
    }
  }, 25000);

  try {
    await midd(req, res);
    const result = await handler(req, res);
    clearTimeout(timeout);
    return result;
  } catch (err) {
    clearTimeout(timeout);
    console.error('Admin users error:', err);
    if (!res.headersSent) {
      return res.status(500).json(error('Internal server error'));
    }
  }
};
