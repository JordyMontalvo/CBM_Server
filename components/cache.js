// Sistema de caché centralizado para la aplicación
// Esto permite limpiar cachés desde diferentes endpoints

let caches = {
  plans: null,
  products: null,
  offices: null,
  tree: null,
  users: null,
};

// Función para obtener un caché
export function getCache(key) {
  return caches[key];
}

// Función para establecer un caché
export function setCache(key, value) {
  caches[key] = value;
}

// Función para limpiar un caché específico
export function clearCache(key) {
  caches[key] = null;
}

// Función para limpiar todos los cachés
export function clearAllCaches() {
  Object.keys(caches).forEach(key => {
    caches[key] = null;
  });
}

// Función para limpiar cachés relacionados con productos
export function clearProductCaches() {
  caches.products = null;
  caches.offices = null; // Las oficinas también tienen productos
}

export default {
  getCache,
  setCache,
  clearCache,
  clearAllCaches,
  clearProductCaches,
};

