import bcrypt from "bcrypt";
import { connectToDatabase } from "./mongodb";

const BCRYPT_ROUNDS = 12;

export function getAdminUsername() {
  return String(process.env.ADMIN_USERNAME || "CBM").trim();
}

export function getSessionFromRequest(req) {
  const auth = req.headers?.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return match[1].trim();
  if (req.body?.session) return String(req.body.session).trim();
  if (req.query?.session) return String(req.query.session).trim();
  return null;
}

async function createAdmin(admins, username, password) {
  const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
  const admin = {
    id: `admin_${Date.now()}`,
    username,
    passwordHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await admins.insertOne(admin);
  return admin;
}

export async function authenticateAdmin(username, password) {
  const adminUsername = getAdminUsername();
  const normalizedUsername = String(username || "").trim();
  const normalizedPassword = String(password || "");

  if (!normalizedUsername || !normalizedPassword) return null;

  const { db } = await connectToDatabase();
  const admins = db.collection("admin_users");

  const existing = await admins.findOne({ username: normalizedUsername });
  if (existing) {
    const valid = await bcrypt.compare(normalizedPassword, String(existing.passwordHash || ""));
    return valid ? existing : null;
  }

  if (normalizedUsername !== adminUsername) return null;

  const hasAdmins = (await admins.countDocuments({})) > 0;
  const bootstrapPassword = process.env.ADMIN_PASSWORD;

  // Primera configuración: en BD vacía, el primer login con CBM define la contraseña.
  if (!hasAdmins) {
    return createAdmin(admins, normalizedUsername, normalizedPassword);
  }

  // Si ya hay admins pero falta este usuario, permitir bootstrap solo con ADMIN_PASSWORD.
  if (bootstrapPassword && normalizedPassword === bootstrapPassword) {
    return createAdmin(admins, normalizedUsername, normalizedPassword);
  }

  return null;
}

export async function getAdminSession(sessionValue) {
  if (!sessionValue) return null;

  const { db } = await connectToDatabase();
  const session = await db.collection("admin_sessions").findOne({ value: sessionValue });
  if (!session) return null;

  const admin = await db.collection("admin_users").findOne({
    id: session.adminId,
    username: session.adminUsername,
  });

  if (!admin) return null;

  return { db, session, sessionValue, admin };
}

export async function revokeOtherAdminSessions(db, adminId, currentSessionValue) {
  await db.collection("admin_sessions").deleteMany({
    adminId,
    value: { $ne: currentSessionValue },
  });
}
