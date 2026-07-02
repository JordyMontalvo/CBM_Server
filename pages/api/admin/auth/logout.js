import lib from "../../../../components/lib";
import { connectToDatabase } from "../../../../lib/mongodb";
import { getSessionFromRequest } from "../../../../lib/adminAuth";

const { error, success, midd } = lib;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json(error("Method not allowed"));

  const sessionValue = getSessionFromRequest(req);
  if (!sessionValue) return res.status(401).json(error("No autorizado"));

  const { db } = await connectToDatabase();
  await db.collection("admin_sessions").deleteOne({ value: sessionValue });

  return res.json(success({ success: true }));
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
