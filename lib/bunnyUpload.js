import https from "https";

// Sube un archivo a Bunny Storage y devuelve la URL pública en la Pull Zone (CDN).
// Credenciales por variables de entorno del servidor (nunca en el navegador):
//   BUNNY_STORAGE_ZONE_NAME   nombre de la Storage Zone
//   BUNNY_STORAGE_PASSWORD    contraseña (API key) de la Storage Zone
//   BUNNY_STORAGE_HOSTNAME    host de la región, p. ej. storage.bunnycdn.com o br.storage.bunnycdn.com
//   BUNNY_PULL_ZONE_URL       URL pública de la Pull Zone, p. ej. https://cbm.b-cdn.net
// Los valores se limpian: al pegarlos en el panel del hosting es fácil que se
// cuele un salto de línea o espacios, y un salto de línea en la contraseña hace
// que Node rechace la cabecera AccessKey ("Invalid character in header content").
function env(name) {
  return String(process.env[name] || "").replace(/\s+/g, "");
}

function readConfig() {
  return {
    zone: env("BUNNY_STORAGE_ZONE_NAME").replace(/^\/+|\/+$/g, ""),
    password: env("BUNNY_STORAGE_PASSWORD"),
    host: (env("BUNNY_STORAGE_HOSTNAME") || "storage.bunnycdn.com")
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, ""),
    pullZone: env("BUNNY_PULL_ZONE_URL").replace(/\/+$/, ""),
  };
}

export function bunnyConfigured() {
  const { zone, password, pullZone } = readConfig();
  return !!(zone && password && pullZone);
}

export function uploadToBunny({ path, buffer }) {
  const { zone, password, host } = readConfig();
  let { pullZone } = readConfig();
  if (pullZone && !/^https?:\/\//i.test(pullZone)) pullZone = `https://${pullZone}`;

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
