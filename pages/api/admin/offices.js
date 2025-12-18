import db from "../../../components/db";
import lib from "../../../components/lib";
import cache from "../../../components/cache";

const { Office, Product, Recharge } = db;
const { success, midd } = lib;

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

  let offices = await Office.find({});
  let products = await Product.find({});
  let recharges = await Recharge.find({});

  for (let office of offices) {
    for (let product of products) {
      const p = office.products.find((e) => e.id == product.id);

      if (!p)
        office.products.push({
          id: product.id,
          total: 0,
        });
    }
  }

  if (req.method == "GET") {
    offices = offices.map((office) => {
      office.products = office.products.map((p) => {
        const product = products.find((e) => e.id == p.id);
        if (product) {
          p.name = product.name;
        } else {
          p.name = "Producto Desconocido"; // Nombre por defecto si no se encuentra el producto
        }
        return p;
      });

      office.recharges = recharges.filter((r) => r.office_id == office.id);

      // Asegurar que el campo active existe (por defecto true si no existe)
      if (office.active === undefined) {
        office.active = true;
      }

      return office;
    });

    return res.json(success({ offices }));
  }

  if (req.method == "POST") {
    const { action, id, products: requestProducts, office, newOffice } = req.body;

    // Crear nueva oficina
    if (action === "create" && newOffice) {
      // Verificar si ya existe una oficina con el mismo id
      const existingOffice = await Office.findOne({ id: newOffice.id });
      if (existingOffice) {
        return res.json({ error: true, msg: "Ya existe una oficina con ese ID" });
      }

      // Inicializar productos con total 0 para todos los productos disponibles
      const officeProducts = products.map((p) => ({
        id: p.id,
        total: 0,
      }));

      const officeData = {
        id: newOffice.id,
        name: newOffice.name || "",
        email: newOffice.email || "",
        password: newOffice.password || "",
        address: newOffice.address || "",
        accounts: newOffice.accounts || "",
        products: officeProducts,
        active: newOffice.active !== undefined ? newOffice.active : true,
      };

      await Office.insert(officeData);
      // Invalidar cache de oficinas
      cache.clearCache('offices');
      return res.json(success({ msg: "Oficina creada correctamente" }));
    }

    // Activar/Desactivar oficina
    if (action === "toggleActive" && id) {
      const officeToUpdate = await Office.findOne({ id });
      if (!officeToUpdate) {
        return res.json({ error: true, msg: "Oficina no encontrada" });
      }

      const newActiveStatus = !(officeToUpdate.active !== false);
      await Office.update({ id }, { active: newActiveStatus });
      // Invalidar cache de oficinas para reflejar el cambio
      cache.clearCache('offices');
      return res.json(success({ msg: `Oficina ${newActiveStatus ? "activada" : "desactivada"} correctamente` }));
    }

    // Recargar productos (funcionalidad existente)
    if (requestProducts) {
      const office = offices.find((e) => e.id == id);
      if (!office) {
        return res.json({ error: true, msg: "Oficina no encontrada" });
      }

      requestProducts.forEach((p, i) => {
        office.products[i].total += requestProducts[i].total;
      });

      await Office.update({ id }, { products: office.products });

      await Recharge.insert({
        date: new Date(),
        office_id: id,
        products: requestProducts,
      });
    }

    // Actualizar datos de oficina (funcionalidad existente)
    if (office && !action) {
      console.log(" update office ", office);
      const updateData = {
        email: office.email,
        password: office.password,
        name: office.name,
        address: office.address,
        accounts: office.accounts,
      };

      // Incluir active si viene en el objeto office
      if (office.active !== undefined) {
        updateData.active = office.active;
        // Invalidar cache si se cambió el estado activo
        cache.clearCache('offices');
      }

      await Office.update({ id }, updateData);
    }

    return res.json(success());
  }
};
