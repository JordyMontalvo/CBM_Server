#!/usr/bin/env bash
# Compila el motor de cierre (closing-engine/cmd/server) en bin/closing-engine.
# En Heroku lo llama `heroku-postbuild`. Si no hay `go` en el PATH, descarga un
# toolchain fijado (con verificación sha256) a un directorio temporal, para que
# no termine dentro del slug.
set -euo pipefail

GO_VERSION="1.26.1"
GO_SHA256_LINUX_AMD64="031f088e5d955bab8657ede27ad4e3bc5b7c1ba281f05f245bcc304f327c987a"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/bin/closing-engine"
WORK="${TMPDIR:-/tmp}/closing-engine-build"
mkdir -p "$WORK" "$ROOT/bin"

if ! command -v go >/dev/null 2>&1; then
  if [ "$(uname -s)" != "Linux" ] || [ "$(uname -m)" != "x86_64" ]; then
    echo "closing-engine: no hay 'go' y la descarga automática solo cubre linux/amd64" >&2
    exit 1
  fi
  tarball="$WORK/go${GO_VERSION}.linux-amd64.tar.gz"
  echo "-----> closing-engine: descargando Go ${GO_VERSION}"
  curl -fsSL --retry 3 -o "$tarball" "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz"
  echo "${GO_SHA256_LINUX_AMD64}  $tarball" | sha256sum -c - >/dev/null
  rm -rf "$WORK/go"
  tar -C "$WORK" -xzf "$tarball"
  rm -f "$tarball"
  export PATH="$WORK/go/bin:$PATH"
fi

# Caches fuera del árbol de la app.
export GOPATH="$WORK/gopath"
export GOCACHE="$WORK/gocache"
export GOTOOLCHAIN=local
export CGO_ENABLED=0

echo "-----> closing-engine: compilando con $(go version)"
cd "$ROOT/closing-engine/cmd/server"
go build -trimpath -ldflags="-s -w" -o "$OUT" .
echo "-----> closing-engine: listo ($(du -h "$OUT" | cut -f1)) en bin/closing-engine"
