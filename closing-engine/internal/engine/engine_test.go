package engine

import (
	"context"
	"fmt"
	"math"
	"testing"

	"github.com/JordyMontalvo/CBM_Server/closing-engine/internal/jsv"
)

// ---------- store falso ----------

type op struct {
	kind, coll string
	a, b       *jsv.Doc
}

type fakeStore struct {
	data map[string][]*jsv.Doc
	ops  []op
}

func (s *fakeStore) Find(_ context.Context, coll string, filter *jsv.Doc) ([]*jsv.Doc, error) {
	s.ops = append(s.ops, op{"find", coll, filter, nil})
	return s.data[coll], nil
}
func (s *fakeStore) InsertOne(_ context.Context, coll string, doc *jsv.Doc) error {
	s.ops = append(s.ops, op{"insertOne", coll, doc, nil})
	return nil
}
func (s *fakeStore) UpdateOne(_ context.Context, coll string, f, set *jsv.Doc) error {
	s.ops = append(s.ops, op{"updateOne", coll, f, set})
	return nil
}
func (s *fakeStore) UpdateMany(_ context.Context, coll string, f, set *jsv.Doc) error {
	s.ops = append(s.ops, op{"updateMany", coll, f, set})
	return nil
}
func (s *fakeStore) IncMany(_ context.Context, coll string, f, inc *jsv.Doc) error {
	s.ops = append(s.ops, op{"incMany", coll, f, inc})
	return nil
}
func (s *fakeStore) DeleteOne(_ context.Context, coll string, f *jsv.Doc) error {
	s.ops = append(s.ops, op{"deleteOne", coll, f, nil})
	return nil
}

func nums(vs ...float64) []tp {
	out := make([]tp, len(vs))
	for i, v := range vs {
		out[i] = tp{v: v}
	}
	return out
}

// ---------- calc_range ----------

func TestCalcRangeThresholds(t *testing.T) {
	cases := []struct {
		name string
		arr  []tp
		want string
	}{
		{"vacío", nil, "active"},
		{"un hijo nunca pasa de active", nums(21000), "active"},
		{"star justo en 300", nums(150, 150), "star"},
		{"star por debajo", nums(150, 149), "active"},
		{"master justo en 900", nums(450, 450), "master"},
		{"master por debajo cae a star", nums(450, 449), "star"},
		{"silver justo en 1800", nums(600, 600, 600), "silver"},
		{"silver necesita 3 hijos", nums(900, 900), "master"},
		{"gold justo en 3300", nums(1100, 1100, 1100), "gold"},
		{"sapphire justo en 9000", nums(2250, 2250, 2250, 2250), "sapphire"},
		{"RUBI justo en 21000", nums(5250, 5250, 5250, 5250), "RUBI"},
		{"RUBI por debajo cae a sapphire", nums(5250, 5250, 5250, 5249), "sapphire"},
		{"tope del primer hijo", nums(100000, 0, 0, 0), "active"},
		{"NaN anula la suma", nums(math.NaN(), 10000, 10000, 10000), "active"},
		{"undefined anula la suma", append(nums(10000, 10000, 10000), tp{undef: true}), "active"},
	}
	for _, c := range cases {
		if got := calcRange(c.arr); got != c.want {
			t.Errorf("%s: calcRange(%v) = %q, want %q", c.name, c.arr, got, c.want)
		}
	}
}

func TestSortTotal(t *testing.T) {
	got := sortTotal([]tp{{v: 1}, {undef: true}, {v: 3}, {v: 2}})
	want := []tp{{v: 3}, {v: 2}, {v: 1}, {undef: true}}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("sortTotal = %v, want %v", got, want)
	}
}

// ---------- levels ----------

func TestLevels(t *testing.T) {
	want := map[string]float64{
		"active": 3, "star": 6, "master": 9, "silver": 11, "gold": 13,
		"sapphire": 14, "RUBI": 15, "DIAMANTE": 15, "DOBLE DIAMANTE": 15,
		"TRIPLE DIAMANTE": 15, "DIAMANTE ESTRELLA": 15,
	}
	r := &Run{}
	for rk := range want {
		r.tree = append(r.tree, &node{doc: jsv.NewDoc(), rank: rk})
	}
	none := &node{doc: jsv.NewDoc(), rank: "none"}
	r.tree = append(r.tree, none)
	r.levels()
	for _, n := range r.tree[:len(r.tree)-1] {
		if !n.hasLevels || n.levels != want[n.rank] {
			t.Errorf("levels(%s) = %v, want %v", n.rank, n.levels, want[n.rank])
		}
	}
	if none.hasLevels || none.doc.Has("levels") {
		t.Errorf("un nodo sin rango no debe recibir levels")
	}
}

// ---------- pay_residual ----------

// chain arma una cadena 0 <- 1 <- ... <- k-1 (0 es la raíz).
func chain(k int, activated func(i int) bool, rank string) *Run {
	r := &Run{index: map[string]*node{}}
	for i := 0; i < k; i++ {
		var parent any = nil
		if i > 0 {
			parent = fmt.Sprintf("n%d", i-1)
		}
		n := &node{
			doc:         jsv.D("name", fmt.Sprintf("N %d", i), "dni", fmt.Sprintf("%d", i)),
			id:          fmt.Sprintf("n%d", i),
			parent:      parent,
			activated:   activated(i),
			points:      100,
			rank:        rank,
			residualArr: []any{},
		}
		if !n.activated {
			n.rank = "none"
		}
		r.tree = append(r.tree, n)
		r.index[n.id.(string)] = n
	}
	r.levels()
	return r
}

func TestPayResidualStopsAt13(t *testing.T) {
	r := chain(16, func(int) bool { return true }, "RUBI")
	user := r.tree[15]
	if err := r.payResidual(user.parent, 0, user); err != nil {
		t.Fatal(err)
	}
	for i, n := range r.tree[:15] {
		level := 14 - i
		paid := level < 13
		if paid {
			want := R["RUBI"][level] * user.points * 1
			if n.residual != want || len(n.residualArr) != 1 {
				t.Errorf("nodo %d (nivel %d): residual %v, want %v", i, level, n.residual, want)
			}
		} else if n.residual != 0 {
			t.Errorf("nodo %d (nivel %d) no debería cobrar: %v", i, level, n.residual)
		}
	}
}

func TestPayResidualSkipsInactives(t *testing.T) {
	// 0 activo <- 1 inactivo <- 2 inactivo <- 3 (paga)
	r := chain(4, func(i int) bool { return i == 0 || i == 3 }, "active")
	user := r.tree[3]
	if err := r.payResidual(user.parent, 0, user); err != nil {
		t.Fatal(err)
	}
	want := R["active"][0] * user.points * 1
	if got := r.tree[0].residual; got != want {
		t.Errorf("residual = %v, want %v (los inactivos no gastan nivel)", got, want)
	}
	entry := r.tree[0].residualArr[0].(*jsv.Doc)
	if entry.Get("n") != 0.0 || entry.Get("dni") != "3" || entry.Get("name") != "N 3" || entry.Get("val") != 100.0 {
		t.Errorf("residual_bonus_arr = %s", jsv.Marshal(entry))
	}
}

func TestPayResidualRespectsLevels(t *testing.T) {
	// "active" cobra 3 niveles: el 4.º ancestro no recibe nada.
	r := chain(5, func(int) bool { return true }, "active")
	user := r.tree[4]
	if err := r.payResidual(user.parent, 0, user); err != nil {
		t.Fatal(err)
	}
	if r.tree[0].residual != 0 {
		t.Errorf("nivel 3 con levels=3 no debería cobrar: %v", r.tree[0].residual)
	}
	if r.tree[1].residual == 0 {
		t.Errorf("nivel 2 debería cobrar")
	}
}

func TestPayResidualCycle(t *testing.T) {
	r := chain(3, func(i int) bool { return i == 2 }, "active")
	r.tree[0].parent = "n1" // ciclo 0 <-> 1, ambos inactivos
	user := r.tree[2]
	if err := r.payResidual(user.parent, 0, user); err == nil {
		t.Fatal("se esperaba error por ciclo")
	}
}

// ---------- is_rank ----------

func TestIsRankDiamante(t *testing.T) {
	build := func(sapphires int) (*Run, *node) {
		r := &Run{index: map[string]*node{}}
		parent := &node{doc: jsv.NewDoc(), id: "p", rank: "RUBI"}
		r.tree = append(r.tree, parent)
		for i := 0; i < 5; i++ {
			rk := "gold"
			if i < sapphires {
				rk = "sapphire"
			}
			c := &node{doc: jsv.NewDoc(), id: fmt.Sprintf("c%d", i), rank: rk}
			parent.childIDs = append(parent.childIDs, c.id)
			parent.children = append(parent.children, c)
			r.tree = append(r.tree, c)
		}
		parent.total = nums(13000, 12000, 12000, 12000, 12000) // 61000 con topes
		return r, parent
	}

	r, p := build(4)
	if !r.isRank(p, "DIAMANTE") {
		t.Errorf("con 5 ramas, 61000 puntos y 4 sapphire debería ser DIAMANTE")
	}
	r, p = build(3)
	if r.isRank(p, "DIAMANTE") {
		t.Errorf("con solo 3 ramas sapphire no debería ser DIAMANTE")
	}
	r, p = build(5)
	p.total = nums(20000, 11000, 11000, 11000, 6000) // 13000+11000*3+6000 = 52000
	if r.isRank(p, "DIAMANTE") {
		t.Errorf("con 52000 puntos con topes no debería ser DIAMANTE")
	}
}

// ---------- action "new" de extremo a extremo ----------

func treeNode(id string, parent any, childs ...any) *jsv.Doc {
	if childs == nil {
		childs = []any{}
	}
	return jsv.D("id", id, "childs", childs, "parent", parent)
}

func userDoc(id string, activated bool, points any, extra ...any) *jsv.Doc {
	d := jsv.D("id", id, "name", "Nombre", "lastName", id, "dni", "dni-"+id,
		"activated", activated, "points", points, "plan", "basic", "tree", true)
	for i := 0; i+1 < len(extra); i += 2 {
		d.Set(extra[i].(string), extra[i+1])
	}
	return d
}

func newFixture() *fakeStore {
	return &fakeStore{data: map[string][]*jsv.Doc{
		CollUsers: {
			userDoc(RootID, true, 100.0),
			userDoc("A", true, 200.0, "affiliation_points", 50.0),
			userDoc("B", false, "0"),
			userDoc("C", true, 100.0, "pays", []any{
				jsv.D("name", "star", "payed", true),
				jsv.D("name", "active", "payed", false),
			}),
			userDoc("O", false, 10.0),
			userDoc("P", false, 10.0),
		},
		CollTree: {
			treeNode(RootID, nil, "A", "B"),
			treeNode("A", RootID, "C"),
			treeNode("B", RootID),
			treeNode("C", "A"),
			treeNode("O", nil, "P"), // fuera de la raíz fija
			treeNode("P", "O"),
		},
		CollAffiliations: {jsv.D("id", "af1", "closed", false)},
		CollActivations:  {jsv.D("id", "ac1", "closed", false)},
	}}
}

func byID(tree []any) map[string]*jsv.Doc {
	out := map[string]*jsv.Doc{}
	for _, v := range tree {
		d := v.(*jsv.Doc)
		out[d.Get("id").(string)] = d
	}
	return out
}

func TestNewEndToEnd(t *testing.T) {
	st := newFixture()
	tree, affs, acts, err := New(context.Background(), st)
	if err != nil {
		t.Fatal(err)
	}
	for _, o := range st.ops {
		if o.kind != "find" {
			t.Errorf("action new no debe escribir: %s %s", o.kind, o.coll)
		}
	}
	if len(affs) != 1 || len(acts) != 1 {
		t.Errorf("affiliations/activations = %d/%d", len(affs), len(acts))
	}

	n := byID(tree)
	root, a, b, c, o := n[RootID], n["A"], n["B"], n["C"], n["O"]

	// total_points: C=100, A=200+50+100, B=0, root=100+350+0
	checks := []struct {
		d    *jsv.Doc
		key  string
		want string
	}{
		{root, "total_points", "450"},
		{a, "total_points", "350"},
		{b, "total_points", "0"},
		{root, "total", "[350,0]"},
		{root, "_total", "[350,0]"},
		{root, "rank", `"active"`},
		{root, "levels", "3"},
		{a, "rank", `"active"`},
		{b, "rank", `"none"`},
		{b, "points", "0"},
		{c, "_pays", `[{"name":"active","payed":false}]`},
		{root, "_pays", "[]"},
		{root, "name", `"Nombre ` + RootID + `"`},
		{b, "_activated", "false"},
		{b, "affiliation_points", "0"},
		{o, "total", "[null]"}, // hijo sin total_points (undefined)
	}
	for _, ch := range checks {
		if got := string(jsv.Marshal(ch.d.Get(ch.key))); got != ch.want {
			t.Errorf("%s.%s = %s, want %s", ch.d.Get("id"), ch.key, got, ch.want)
		}
	}
	if o.Has("total_points") {
		t.Errorf("un nodo fuera de la raíz no debe tener total_points")
	}
	if b.Has("levels") {
		t.Errorf("un nodo sin rango no debe tener levels")
	}

	// residual: root recibe de A (nivel 0), de B (0 puntos) y de C (nivel 1).
	pointsA, pointsB, pointsC := 200.0, 0.0, 100.0
	want := 0.0
	want += R["active"][0] * pointsA * 1
	want += R["active"][0] * pointsB * 1
	want += R["active"][1] * pointsC * 1
	if got := root.Get("residual_bonus"); got != want {
		t.Errorf("root.residual_bonus = %v, want %v", got, want)
	}
	if arr := root.Get("residual_bonus_arr").([]any); len(arr) != 2 {
		t.Errorf("root.residual_bonus_arr tiene %d entradas, want 2 (los montos 0 no se guardan)", len(arr))
	}
}

func TestNewMissingUserFails(t *testing.T) {
	st := newFixture()
	st.data[CollUsers] = st.data[CollUsers][1:] // sin el usuario raíz
	if _, _, _, err := New(context.Background(), st); err == nil {
		t.Fatal("se esperaba error si falta el usuario de un nodo")
	}
}

func TestNewRejectsStringAffiliationPoints(t *testing.T) {
	st := newFixture()
	st.data[CollUsers][1].Set("affiliation_points", "50")
	if _, _, _, err := New(context.Background(), st); err == nil {
		t.Fatal("se esperaba error con affiliation_points como string")
	}
}

func TestNewChildCycleFails(t *testing.T) {
	st := newFixture()
	st.data[CollTree][3].Set("childs", []any{"A"}) // C -> A -> C
	if _, _, _, err := New(context.Background(), st); err == nil {
		t.Fatal("se esperaba error por ciclo en childs")
	}
}

func TestFastBonusNeverPaysBecauseOfParenId(t *testing.T) {
	st := newFixture()
	for _, u := range st.data[CollUsers] {
		u.Set("plan", "master")
		u.Set("affiliation_points", 10.0)
		u.Set("parentId", RootID)
	}
	if _, _, _, err := New(context.Background(), st); err != nil {
		t.Fatal(err)
	}
	for _, o := range st.ops {
		if o.kind == "insertOne" {
			t.Fatalf("el fast bonus no debe pagarse (e.parenId): %s", jsv.Marshal(o.a))
		}
	}
}

// ---------- action "save" ----------

func TestSaveWriteOrder(t *testing.T) {
	prevNow, prevRand := now, randID
	defer func() { now, randID = prevNow, prevRand }()
	now = func() jsv.Date { return 0 }
	randID = func() string { return "abc123" }

	body, err := jsv.Parse([]byte(`{"action":"save","data":{
		"tree":[
			{"id":"X","name":"Ana X","activated":true,"_activated":false,"points":100,"_total":[1,2],
			 "rank":"sapphire","residual_bonus":5.5,"n_inactives":0,
			 "pays":[{"name":"star","payed":true},{"name":"master","payed":false},{"name":"silver","payed":false},
			         {"name":"gold","payed":false},{"name":"sapphire","payed":false},{"name":"RUBI","payed":false}],
			 "bonuses":{"gold":[],"sapphire":[],"ruby":[],"diamond":[]}},
			{"id":"Y","rank":"none","activated":false}
		],
		"affiliations":[{"id":"af1"}],
		"activations":[]
	}}`))
	if err != nil {
		t.Fatal(err)
	}
	st := &fakeStore{data: map[string][]*jsv.Doc{
		CollTransactions: {jsv.D("id", "v1", "virtual", true)},
	}}
	if err := Save(context.Background(), st, body); err != nil {
		t.Fatal(err)
	}

	var got []string
	for _, o := range st.ops {
		s := o.kind + " " + o.coll + " " + string(jsv.Marshal(o.a))
		if o.b != nil {
			s += " " + string(jsv.Marshal(o.b))
		}
		got = append(got, s)
	}
	date := `"1970-01-01T00:00:00.000Z"`
	tx := func(value, name string) string {
		return `insertOne transactions {"date":` + date + `,"user_id":"X","type":"in","value":` + value + `,"name":"` + name + `"}`
	}
	want := []string{
		`insertOne closeds {"id":"abc123","date":` + date + `,"users":[{"name":"Ana X","activated":true,"_activated":false,"points":100,"total":[1,2],"rank":"sapphire","residual_bonus":5.5}],` +
			`"tree":` + string(jsv.Marshal(mustGet(body, "data", "tree"))) + `,"affiliations":[{"id":"af1"}],"activations":[]}`,
		tx("5.5", "residual"),
		tx("30", "closed bonus"),
		tx("45", "closed bonus"),
		tx("100", "closed bonus"),
		tx("200", "closed bonus"),
		`updateMany users {} {"activated":false,"_activated":false,"rank":"none","total_points":0,"points":0,"affiliation_points":0}`,
		`incMany users {} {"upgrade_pos":1}`,
		`updateMany users {"upgrade_pos":2} {"upgrade_pos":0,"upgrade_arr":[0,0]}`,
		`updateOne users {"id":"X"} {"rank":"sapphire","pays":[{"name":"star","payed":true},{"name":"master","payed":true},{"name":"silver","payed":true},{"name":"gold","payed":true},{"name":"sapphire","payed":true},{"name":"RUBI","payed":false}],"bonuses":{"gold":[],"sapphire":[true],"ruby":[],"diamond":[]},"n_inactives":0}`,
		`updateMany affiliations {} {"closed":true}`,
		`updateMany activations {} {"closed":true}`,
		`find transactions {"virtual":true}`,
		`deleteOne transactions {"id":"v1"}`,
	}
	if len(got) != len(want) {
		t.Fatalf("ops = %d, want %d:\n%v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("op %d:\n got %s\nwant %s", i, got[i], want[i])
		}
	}

	// closeds: undefined (en BSON se guarda null; en JSON se omite).
	upd := st.ops[9].b
	if !upd.Has("closeds") || !jsv.IsUndefined(upd.Get("closeds")) {
		t.Errorf("updateOne debe incluir closeds: undefined")
	}
}

func mustGet(v any, keys ...string) any {
	for _, k := range keys {
		v, _ = jsv.GetProp(v, k)
	}
	return v
}
