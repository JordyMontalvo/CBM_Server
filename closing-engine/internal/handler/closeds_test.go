package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JordyMontalvo/CBM_Server/closing-engine/internal/jsv"
)

type emptyStore struct{}

func (emptyStore) Find(context.Context, string, *jsv.Doc) ([]*jsv.Doc, error) { return nil, nil }
func (emptyStore) InsertOne(context.Context, string, *jsv.Doc) error           { return nil }
func (emptyStore) UpdateOne(context.Context, string, *jsv.Doc, *jsv.Doc) error { return nil }
func (emptyStore) UpdateMany(context.Context, string, *jsv.Doc, *jsv.Doc) error {
	return nil
}
func (emptyStore) IncMany(context.Context, string, *jsv.Doc, *jsv.Doc) error { return nil }
func (emptyStore) DeleteOne(context.Context, string, *jsv.Doc) error         { return nil }

func do(h http.Handler, method, body string, header map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, "/closeds", strings.NewReader(body))
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestUnknownActionReturnsSuccess(t *testing.T) {
	h := &Closeds{Store: emptyStore{}}
	rec := do(h, http.MethodPost, `{"action":"otra"}`, nil)
	if rec.Code != 200 || rec.Body.String() != `{"error":false}` {
		t.Errorf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestNewWithEmptyDB(t *testing.T) {
	h := &Closeds{Store: emptyStore{}}
	rec := do(h, http.MethodPost, `{"action":"new"}`, nil)
	want := `{"error":false,"tree":[],"affiliations":[],"activations":[]}`
	if rec.Code != 200 || rec.Body.String() != want {
		t.Errorf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestSaveWithoutDataFails(t *testing.T) {
	h := &Closeds{Store: emptyStore{}}
	rec := do(h, http.MethodPost, `{"action":"save"}`, nil)
	if rec.Code != 500 || !strings.HasPrefix(rec.Body.String(), `{"error":true,"msg":"TypeError`) {
		t.Errorf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestSecret(t *testing.T) {
	h := &Closeds{Store: emptyStore{}, Secret: "s3cr3t"}
	if rec := do(h, http.MethodPost, `{}`, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("sin secreto: %d", rec.Code)
	}
	if rec := do(h, http.MethodPost, `{}`, map[string]string{SecretHeader: "s3cr3t"}); rec.Code != 200 {
		t.Errorf("con secreto: %d", rec.Code)
	}
}

func TestMethodNotAllowed(t *testing.T) {
	h := &Closeds{Store: emptyStore{}}
	if rec := do(h, http.MethodGet, ``, nil); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET: %d", rec.Code)
	}
}
