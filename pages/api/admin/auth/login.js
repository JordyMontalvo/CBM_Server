import lib from "../../../../components/lib";
import { connectToDatabase } from "../../../../lib/mongodb";
import { authenticateAdmin } from "../../../../lib/adminAuth";

const { error, success, midd, rand } = lib;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json(error("Method not allowed"));

  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !password) return res.json(error("Faltan campos obligatorios"));

  const admin = await authenticateAdmin(username, password);
  if (!admin) return res.json(error("Credenciales inválidas"));

  const { db } = await connectToDatabase();
  const session = rand() + rand() + rand();

  await db.collection("admin_sessions").insertOne({
    value: session,
    adminUsername: admin.username,
    adminId: admin.id,
    createdAt: new Date(),
  });

  return res.json(
    success({
      session,
      admin: { username: admin.username },
    })
  );
}

export default async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (await midd(req, res)) return;
    return await handler(req, res);
  } catch (err) {
    return res.status(500).json({ error: true, msg: err.message });
  }
};
