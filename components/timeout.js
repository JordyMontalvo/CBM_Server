// Middleware para manejar timeouts y mejorar la experiencia del usuario
export function timeoutMiddleware(timeoutMs = 25000) {
  return (req, res, next) => {
    // Configurar timeout
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({
          success: false,
          message: 'La solicitud está tardando demasiado. Por favor, inténtalo de nuevo.',
          timeout: true
        });
      }
    }, timeoutMs);

    // Limpiar timeout cuando la respuesta se envía
    const originalEnd = res.end;
    res.end = function(...args) {
      clearTimeout(timeout);
      originalEnd.apply(this, args);
    };

    // Limpiar timeout si la conexión se cierra
    req.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
}

// Función para manejar operaciones asíncronas con timeout
export async function withTimeout(promise, timeoutMs = 20000) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Operation timeout')), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

// Función para optimizar consultas de base de datos
export function optimizeQuery(query, options = {}) {
  const {
    limit = 1000,
    maxSkip = 1000000,
    sort = { date: -1 }
  } = options;

  // Aplicar límite
  if (query.limit && query.limit > limit) {
    query.limit = limit;
  }

  // Aplicar límite de skip
  if (query.skip && query.skip > maxSkip) {
    throw new Error('Skip value too high. Use search filters instead.');
  }

  // Aplicar ordenamiento por defecto
  if (!query.sort) {
    query.sort = sort;
  }

  return query;
}
