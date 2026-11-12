import crypto from "crypto";
import lib from "../../../components/lib";
import { getSessionFromRequest, getAdminSession } from "../../../lib/adminAuth";
import { uploadToBunny } from "../../../lib/bunnyUpload";

const { error, success, midd } = lib;

// Las imágenes llegan en base64 dentro del JSON (~33% más que el archivo).
export const config = {
  api: { bodyParser: { sizeLimit: "12mb" } },
};

const MAX_BYTES = 8 * 1024 * 1024;

// El tipo se decide por el contenido, no por el nombre: así no se puede subir
// HTML o SVG con código bajo el dominio del CDN.
function detectImage(buffer) {
  const ascii = buffer.slice(0, 12).toString("latin1");
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer[0] === 0x89 && ascii.slice(1, 4) === "PNG") return "png";
  if (ascii.startsWith("GIF8")) return "gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "webp";
  return null;
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
}

export default async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  await midd(req, res);

  if (req.method !== "POST") return res.status(405).json(error("Método no permitido"));

  // Solo administradores con sesión válida pueden subir imágenes.
  const auth = await getAdminSession(getSessionFromRequest(req));
  if (!auth) return res.status(401).json(error("Sesión inválida"));

  const { fileName, fileData } = req.body || {};
  if (!fileData || typeof fileData !== "string") {
    return res.status(400).json(error("Falta la imagen"));
  }

  const base64 = fileData.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");

  if (!buffer.length) return res.status(400).json(error("La imagen está vacía"));
  if (buffer.length > MAX_BYTES) return res.status(400).json(error("La imagen supera 8 MB"));

  const ext = detectImage(buffer);
  if (!ext) return res.status(400).json(error("Formato no permitido. Usa JPG, PNG, WEBP o GIF"));

  const base = String(fileName || "producto")
    .replace(/\.[^.]*$/, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 60) || "producto";

  // Prefijo aleatorio para no pisar imágenes existentes con el mismo nombre.
  const path = `productos/${crypto.randomBytes(6).toString("hex")}_${base}.${ext}`;

  try {
    const { url } = await uploadToBunny({ path, buffer });
    return res.json(success({ url }));
  } catch (err) {
    console.error("[product-image]", err.message);
    return res.status(500).json(error(err.message));
  }
};
