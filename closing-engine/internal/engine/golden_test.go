package engine

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/JordyMontalvo/CBM_Server/closing-engine/internal/jsv"
)

// TestGoldenEquivalence compara la respuesta de `action:"new"` del motor JS
// con la del motor Go sobre la misma base. Se salta si no existen las
// capturas (ver closing-engine/README.md):
//
//	testdata/js_new.json  respuesta de POST /api/admin/closeds sin CLOSING_ENGINE_URL
//	testdata/go_new.json  respuesta con CLOSING_ENGINE_URL apuntando al servicio Go
func TestGoldenEquivalence(t *testing.T) {
	jsTree := loadGoldenTree(t, "js_new.json")
	goTree := loadGoldenTree(t, "go_new.json")

	if len(jsTree) != len(goTree) {
		t.Fatalf("número de nodos: js=%d go=%d", len(jsTree), len(goTree))
	}

	fields := []string{
		"id", "rank", "levels", "total", "_total", "total_points",
		"residual_bonus", "residual_bonus_arr", "_pays",
	}
	for i := range jsTree {
		js, ok1 := jsTree[i].(*jsv.Doc)
		gd, ok2 := goTree[i].(*jsv.Doc)
		if !ok1 || !ok2 {
			t.Fatalf("nodo %d no es un objeto", i)
		}
		for _, f := range fields {
			a := string(jsv.Marshal(js.Get(f)))
			b := string(jsv.Marshal(gd.Get(f)))
			if js.Has(f) != gd.Has(f) || a != b {
				t.Errorf("nodo %s campo %s: js=%s go=%s", jsv.ToString(js.Get("id")), f, a, b)
			}
		}
	}
}

func loadGoldenTree(t *testing.T, name string) []any {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", name))
	if os.IsNotExist(err) {
		t.Skipf("falta testdata/%s: prueba golden omitida", name)
	}
	if err != nil {
		t.Fatal(err)
	}
	v, err := jsv.Parse(raw)
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	tree, _ := jsv.GetProp(v, "tree")
	arr, ok := tree.([]any)
	if !ok {
		t.Fatalf("%s no tiene un array tree", name)
	}
	return arr
}
