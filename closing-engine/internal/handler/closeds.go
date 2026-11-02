// Package handler expone el motor de cierre por HTTP con el mismo contrato
// que el POST de pages/api/admin/closeds.js.
package handler

import (
	"context"
	"crypto/subtle"
	"io"
	"log"
	"net/http"

	"github.com/JordyMontalvo/CBM_Server/closing-engine/internal/engine"
	"github.com/JordyMontalvo/CBM_Server/closing-engine/internal/jsv"
)

// SecretHeader es la cabecera con el secreto compartido entre Next y Go.
const SecretHeader = "X-Closing-Engine-Secret"

// maxBody: Next acepta hasta 16mb y reenvía el cuerpo re-serializado;
// se deja margen.
const maxBody = 32 << 20

// Closeds maneja POST /closeds con { action: "new" } y { action: "save" }.
type Closeds struct {
	Store engine.Store
	// Secret, si no está vacío, se exige en la cabecera SecretHeader.
	Secret string
}

func (h *Closeds) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	if h.Secret != "" {
		got := r.Header.Get(SecretHeader)
		if subtle.ConstantTimeCompare([]byte(got), []byte(h.Secret)) != 1 {
			writeJSON(w, http.StatusUnauthorized, errorBody("unauthorized"))
			return
		}
	}

	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil {
		writeJSON(w, http.StatusRequestEntityTooLarge, errorBody(err.Error()))
		return
	}
	body, err := jsv.Parse(raw)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
		return
	}

	// El cierre sigue aunque Next corte la conexión, igual que en Node:
	// cancelar `save` a la mitad dejaría escrituras parciales.
	ctx := context.WithoutCancel(r.Context())

	log.Println("POST ...")

	// const { action } = req.body
	action, err := jsv.GetProp(body, "action")
	if err != nil {
		fail(w, err)
		return
	}

	if jsv.LooseEq(action, "new") {
		tree, affiliations, activations, err := engine.New(ctx, h.Store)
		if err != nil {
			fail(w, err)
			return
		}
		writeJSON(w, http.StatusOK, success(
			"tree", tree,
			"affiliations", affiliations,
			"activations", activations,
		))
		return
	}

	if jsv.LooseEq(action, "save") {
		if err := engine.Save(ctx, h.Store, body); err != nil {
			fail(w, err)
			return
		}
	}

	writeJSON(w, http.StatusOK, success())
}

// success equivale a lib.success(opts): { error: false, ...opts }.
func success(kv ...any) *jsv.Doc {
	return jsv.D(append([]any{"error", false}, kv...)...)
}

// errorBody equivale a lib.error(msg): { error: true, msg }.
func errorBody(msg string) *jsv.Doc {
	return jsv.D("error", true, "msg", msg)
}

func fail(w http.ResponseWriter, err error) {
	log.Printf("closing engine error: %v", err)
	writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(jsv.Marshal(v))
}
