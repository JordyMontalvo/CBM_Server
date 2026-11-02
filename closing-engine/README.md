# closing-engine

Motor de cierre (`POST /api/admin/closeds`, acciones `new` y `save`) traducido
1:1 de `pages/api/admin/closeds.js` a Go. Mismas tablas, mismo orden de
recorrido y de escritura, y mismos comportamientos raros del JS (fast bonus
que nunca se paga por `e.parenId`, `n_inactives` que no sube, `ruby`/`diamond`
que nunca coinciden, `closeds: null`).

## Estructura

| Ruta | Qué es |
|---|---|
| `internal/jsv` | Valores con semántica de JS (orden de claves, `undefined`, `==`, `Number()`, `JSON.stringify`) |
| `internal/engine` | `tables.go` (tablas), `engine.go` (`new`), `save.go` (`save`), `store.go` (interfaz de BD) |
| `internal/handler` | Handler HTTP con el mismo contrato que `lib.success` / `lib.error` |
| `cmd/server` | Servidor `net/http` + driver de Mongo (módulo Go aparte) |

`cmd/server` es un módulo aparte para que el motor y sus tests no dependan del
driver de Mongo. **Antes del primer build hay que generar su `go.sum`:**

```sh
cd closing-engine/cmd/server && go mod tidy
```

## Tests

```sh
cd closing-engine && go vet ./... && go test ./...
cd closing-engine/cmd/server && go vet ./... && go build ./...
```

### Prueba golden (equivalencia con el motor JS)

`action:"new"` no escribe en la base, así que se puede comparar contra una
copia de la base:

1. Sin `CLOSING_ENGINE_URL`: `npm run dev` y guardar la respuesta de
   `POST /api/admin/closeds {"action":"new"}` en `internal/engine/testdata/js_new.json`.
2. Con el servicio levantado (`cd cmd/server && go run .`) y
   `CLOSING_ENGINE_URL=http://localhost:8080`, repetir y guardar en
   `internal/engine/testdata/go_new.json`.
3. `go test ./internal/engine -run Golden`.

Las capturas tienen datos personales: están en `.gitignore`.

`action:"save"` solo se prueba contra una base de staging restaurada.

## Variables de entorno

| Variable | Dónde | Uso |
|---|---|---|
| `PORT` | Go | Puerto (por defecto 8080) |
| `LISTEN_ADDR` | Go | Dirección de escucha (por defecto `:PORT`) |
| `DB_URL`, `DB_NAME` | Go | Las mismas que usa `lib/mongodb.js` |
| `CLOSING_ENGINE_SECRET` | Go y Next | Secreto compartido (cabecera `X-Closing-Engine-Secret`) |
| `CLOSING_ENGINE_URL` | Next | URL del servicio Go. Sin ella, Next usa el motor JS |

## Despliegue en Heroku (mismo dyno que Next)

El motor corre dentro del dyno `web` de `cbm-server-1`, junto a Next, escuchando
solo en `127.0.0.1:8081`. No hace falta otra app ni otro buildpack.

- **Build:** `heroku-postbuild` ejecuta `npm run build` y luego
  `scripts/build-closing-engine.sh`, que descarga Go (versión y sha256 fijados)
  a `/tmp` y compila `bin/closing-engine`. El toolchain no entra en el slug.
- **Arranque:** el `Procfile` ejecuta `scripts/start.sh`, que lanza Go (con
  reinicio automático si se cae) y después `npm start`.
- **Activar:** definir en Heroku `CLOSING_ENGINE_SECRET` (cualquier valor
  aleatorio largo) y `CLOSING_ENGINE_URL=http://127.0.0.1:8081`.
- **Desactivar / rollback:** borrar `CLOSING_ENGINE_URL` (Next vuelve al motor JS).
  Sin `CLOSING_ENGINE_SECRET` Go ni siquiera arranca.
- `CLOSING_ENGINE_PORT` cambia el puerto interno (por defecto 8081).

## Diferencias conocidas con el JS

- `affiliation_points` que no sea número (p. ej. string): el JS concatenaría
  texto; Go corta el cierre con error 500. Hay que normalizar los datos.
- Un ciclo en `tree` (en `childs` o en `parent`) da error 500 en ambos (en JS
  por desbordamiento de pila).
- Si `total` tiene `NaN`, el orden de esos elementos puede diferir del de V8;
  el rango calculado no cambia (cualquier `NaN` anula las sumas).
- Los errores devuelven `{ "error": true, "msg": ... }` con 500 en vez de la
  página de error de Next.
