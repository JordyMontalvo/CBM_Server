import https from "https";

// Sube un archivo a Bunny Storage y devuelve la URL pública en la Pull Zone (CDN).
// Credenciales por variables de entorno del servidor (nunca en el navegador):
//   BUNNY_STORAGE_ZONE_NAME   nombre de la Storage Zone
//   BUNNY_STORAGE_PASSWORD    contraseña (API key) de la Storage Zone
//   BUNNY_STORAGE_HOSTNAME    host de la región, p. ej. storage.bunnycdn.com o br.storage.bunnycdn.com
//   BUNNY_PULL_ZONE_URL       URL pública de la Pull Zone, p. ej. https://cbm.b-cdn.net
export function bunnyConfigured() {
  return !!(
    process.env.BUNNY_STORAGE_ZONE_NAME &&
    process.env.BUNNY_STORAGE_PASSWORD &&
    process.env.BUNNY_PULL_ZONE_URL
  );
}

export function uploadToBunny({ path, buffer }) {
  const zone = process.env.BUNNY_STORAGE_ZONE_NAME;
  const password = process.env.BUNNY_STORAGE_PASSWORD;
  const host = process.env.BUNNY_STORAGE_HOSTNAME || "storage.bunnycdn.com";
  const pullZone = String(process.env.BUNNY_PULL_ZONE_URL || "").replace(/\/$/, "");

  if (!bunnyConfigured()) {
    return Promise.reject(new Error("Bunny no está configurado en el servidor"));
  }

  const url = `https://${host}/${zone}/${path}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "PUT",
        headers: {
          AccessKey: password,
          "Content-Type": "application/octet-stream",
          "Content-Length": buffer.length,
        },
        timeout: 60000,
      },
      (res) => {
        let body = "";
        res.on("data", (d) => { body += d; });
        res.on("end", () => {
          if (res.statusCode === 201 || res.statusCode === 200) {
            return resolve({ url: `${pullZone}/${path}` });
          }
          reject(new Error(`Bunny respondió ${res.statusCode}: ${body || "sin detalle"}`));
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Bunny no respondió a tiempo")));
    req.on("error", (e) => reject(new Error(`Error de red con Bunny: ${e.message}`)));
    req.write(buffer);
    req.end();
  });
}
