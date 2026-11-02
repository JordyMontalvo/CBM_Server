#!/usr/bin/env bash
# Arranque del dyno web: motor de cierre Go (solo localhost) + Next.
#
# - Go arranca si existe bin/closing-engine y CLOSING_ENGINE_SECRET está definida.
#   Escucha en 127.0.0.1:${CLOSING_ENGINE_PORT:-8081}; si se cae, se reinicia.
# - Si Go no arranca, se quita CLOSING_ENGINE_URL para que Next use el motor JS.
# - Para volver al motor JS basta con borrar CLOSING_ENGINE_URL en Heroku.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/bin/closing-engine"
CE_PORT="${CLOSING_ENGINE_PORT:-8081}"

if [ -x "$BIN" ] && [ -n "${CLOSING_ENGINE_SECRET:-}" ]; then
  (
    # SIGTERM del dyno: dejar que Go termine el cierre en curso y no reiniciarlo.
    trap 'stopping=1; [ -n "${pid:-}" ] && kill -TERM "$pid" 2>/dev/null' TERM INT
    stopping=0
    while [ "$stopping" = 0 ]; do
      PORT="$CE_PORT" LISTEN_ADDR="127.0.0.1:$CE_PORT" "$BIN" &
      pid=$!
      wait "$pid"
      status=$?
      # wait vuelve antes de tiempo si llega una señal: esperar a que Go salga.
      while kill -0 "$pid" 2>/dev/null; do wait "$pid"; status=$?; done
      [ "$stopping" = 0 ] || break
      echo "closing-engine: salió con código $status, reiniciando en 2 s" >&2
      sleep 2
    done
  ) &
  echo "closing-engine: iniciado en 127.0.0.1:$CE_PORT"
else
  if [ -n "${CLOSING_ENGINE_URL:-}" ]; then
    echo "closing-engine: no disponible (falta binario o CLOSING_ENGINE_SECRET); se usa el motor JS" >&2
  fi
  unset CLOSING_ENGINE_URL
fi

cd "$ROOT"
exec npm start
