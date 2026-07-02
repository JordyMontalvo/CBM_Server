import bcrypt from "bcrypt";
import lib from "../../../../components/lib";
import {
  getSessionFromRequest,
  getAdminSession,
  revokeOtherAdminSessions,
} from "../../../../lib/adminAuth";

const { error, success, midd } = lib;
const BCRYPT_ROUNDS = 12;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json(error("Method not allowed"));

  const { oldPassword, newPassword } = req.body || {};
  const revokeOthers = req.body?.revokeOthers === undefined ? true : Boolean(req.body.revokeOthers);

  if (!oldPassword || !newPassword) return res.json(error("Faltan campos obligatorios"));
  if (String(newPassword).length < 8) {
    return res.json(error("La nueva contraseña debe tener mínimo 8 caracteres"));
  }

  const sessionValue = getSessionFromRequest(req);
  const auth = await getAdminSession(sessionValue);
  if (!auth) return res.status(401).json(error("No autorizado"));

  const { db, session, admin } = auth;

  const valid = await bcrypt.compare(String(oldPassword), String(admin.passwordHash || ""));
  if (!valid) return res.json(error("Contraseña actual inválida"));

  const passwordHash = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);
  await db.collection("admin_users").updateOne(
    { id: admin.id },
    { $set: { passwordHash, updatedAt: new Date() } }
  );

  if (revokeOthers) {
    await revokeOtherAdminSessions(db, admin.id, session.value);
  }

  try {
    await db.collection("audit_logs").insertOne({
      id: `admin_pwd_${Date.now()}`,
      type: "admin_password_change",
      admin_id: admin.id,
      admin_username: admin.username,
      date: new Date(),
      revokeOthers,
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    });
  } catch (_) {
    // No bloquear por fallas de auditoría
  }

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
