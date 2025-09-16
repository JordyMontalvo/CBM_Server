import db  from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session, Plan, Product, Affiliation, Office, Tree, Transaction } = db
const { error, success, midd, rand, acum } = lib

// Cache para evitar consultas repetidas
let plansCache = null;
let productsCache = null;
let officesCache = null;

// Función para obtener planes con cache
async function getPlans() {
  if (!plansCache) {
    plansCache = await Plan.find({});
  }
  return plansCache;
}

// Función para obtener productos con cache
async function getProducts() {
  if (!productsCache) {
    productsCache = await Product.find({ aff_price: {$exists: true }});
  }
  return productsCache;
}

// Función para obtener oficinas con cache
async function getOffices() {
  if (!officesCache) {
    officesCache = await Office.find({});
  }
  return officesCache;
}

// Función optimizada para calcular pagos
function calculatePayments(user, tree) {
  let pay_basic = 0;
  let pay_standard = 0;
  let pay_business = 0;
  let pay_master = 0;

  function total_pay(id, parent_id) {
    const node = tree.find(e => e.id == id);
    if (!node) return;

    let val = 0;
    if (node.parentId == parent_id && !node.closeds) {
      if (node.plan == 'basic') val = 50;
      if (node.plan == 'standard') val = 150;
      if (node.plan == 'business') val = 300;
      if (node.plan == 'master') val = 500;
    }

    pay_basic += 0.1 * val;
    pay_standard += 0.2 * val;
    pay_business += 0.3 * val;
    pay_master += 0.4 * val;

    // Limitar recursión para evitar timeouts
    if (node.childs && node.childs.length > 0) {
      node.childs.slice(0, 10).forEach(_id => { // Limitar a 10 hijos máximo
        total_pay(_id, parent_id);
      });
    }
  }

  const userNode = tree.find(e => e.id == user.id);
  if (userNode && userNode.childs) {
    userNode.childs.slice(0, 5).forEach(_id => { // Limitar a 5 hijos máximo
      total_pay(_id, userNode.id);
    });
  }

  return { pay_basic, pay_standard, pay_business, pay_master };
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

  // Timeout de 20 segundos
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({
        success: false,
        message: 'La solicitud está tardando demasiado. Por favor, inténtalo de nuevo.',
        timeout: true
      });
    }
  }, 20000);

  try {
    await midd(req, res);

    // valid session
    let { session } = req.query;
    const sessionData = await Session.findOne({ value: session });
    if (!sessionData) {
      clearTimeout(timeout);
      return res.json(error('invalid session'));
    }

    // get USER
    const user = await User.findOne({ id: sessionData.id });
    if (!user) {
      clearTimeout(timeout);
      return res.json(error('user not found'));
    }

    // Consultas paralelas optimizadas
    const [plans, products, affiliation, affiliations, transactions, _transactions] = await Promise.all([
      getPlans(),
      getProducts(),
      Affiliation.findOneLast({ userId: user.id, status: { $in: ['pending', 'approved'] } }),
      Affiliation.find({ userId: user.id, status: 'approved' }),
      Transaction.find({ user_id: user.id, virtual: {$in: [null, false]} }),
      Transaction.find({ user_id: user.id, virtual: true })
    ]);

    // Procesar planes según afiliación
    let processedPlans = [...plans];
    if (affiliation && affiliation.status == 'approved') {
      const planIndex = {
        'pre-basic': 1,
        'basic': 2,
        'standard': 3,
        'business': 4,
        'master': 5
      };
      const removeCount = planIndex[affiliation.plan.id] || 0;
      processedPlans = processedPlans.slice(removeCount);
    }

    // Calcular balances
    const ins = acum(transactions, {type: 'in'}, 'value');
    const outs = acum(transactions, {type: 'out'}, 'value');
    const _ins = acum(_transactions, {type: 'in'}, 'value');
    const _outs = acum(_transactions, {type: 'out'}, 'value');

    const balance = ins - outs;
    const _balance = _ins - _outs;

    // Solo procesar árbol si es necesario y el usuario es default
    if (user.plan == 'default') {
      try {
        const [users, treeData] = await Promise.all([
          User.find({ tree: true }).limit(1000), // Limitar usuarios
          Tree.find({}).limit(1000) // Limitar nodos del árbol
        ]);

        // Crear mapa de usuarios para acceso rápido
        const userMap = new Map(users.map(u => [u.id, u]));

        // Procesar árbol de forma optimizada
        treeData.forEach(node => {
          const userData = userMap.get(node.id);
          if (userData) {
            node.plan = userData.plan;
            node.affiliation_points = userData.affiliation_points;
            node.parentId = userData.parentId;
            node.closeds = userData.closeds ? true : false;
          }
        });

        // Calcular pagos de forma optimizada
        const payments = calculatePayments(user, treeData);
        
        processedPlans[0].pay = 0;
        if (processedPlans[1]) processedPlans[1].pay = payments.pay_basic;
        if (processedPlans[2]) processedPlans[2].pay = payments.pay_standard;
        if (processedPlans[3]) processedPlans[3].pay = payments.pay_business;
        if (processedPlans[4]) processedPlans[4].pay = payments.pay_master;
      } catch (treeError) {
        console.error('Error procesando árbol:', treeError);
        // Continuar sin procesar el árbol si hay error
      }
    }

    if (req.method == 'GET') {
      const offices = await getOffices();

      clearTimeout(timeout);
      return res.json(success({
        name: user.name,
        lastName: user.lastName,
        affiliated: user.affiliated,
        _activated: user._activated,
        activated: user.activated,
        plan: user.plan,
        country: user.country,
        photo: user.photo,
        tree: user.tree,
        plans: processedPlans,
        products,
        affiliation,
        affiliations,
        offices,
        balance,
        _balance,
      }));
    }

    if (req.method == 'POST') {
      let { products, price, final_plan, voucher, office, check, remaining, pay_method, bank, date, voucher_number } = req.body;

      const plan = processedPlans.find(e => e.id == final_plan);
      if (!plan) {
        clearTimeout(timeout);
        return res.json(error('Plan not found'));
      }

      let transactions = [];
      let amounts;

      if (!check) {
        const pay = plan.pay || 0;
        const a = balance < price ? balance : price;
        const r = (price - balance) > 0 ? price - balance : 0;
        const b = pay < r ? pay : r;
        const c = price - a - b;

        amounts = [a, b, c];

        if (a > 0) {
          const id1 = rand();
          transactions.push(id1);

          await Transaction.insert({
            id: id1,
            date: new Date(),
            user_id: user.id,
            type: 'out',
            value: a,
            name: 'affiliation',
          });
        }
      }

      await Affiliation.insert({
        id: rand(),
        date: new Date(),
        userId: user.id,
        products,
        price,
        plan,
        voucher,
        office,
        status: 'pending',
        delivered: false,
        transactions,
        amounts,
        remaining,
        pay_method,
        bank,
        voucher_date: date,
        voucher_number,
      });

      clearTimeout(timeout);
      return res.json(success());
    }

  } catch (err) {
    console.error('Error en affiliation API:', err);
    clearTimeout(timeout);
    return res.status(500).json(error('Internal server error'));
  }
};