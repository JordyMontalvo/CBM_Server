// Package engine es la traducción 1:1 del motor de cierre de
// pages/api/admin/closeds.js. Mantiene los mismos nombres, tablas, orden de
// recorrido y orden de escritura. Los comportamientos raros del código JS
// se copian a propósito (ver comentarios "IGUAL QUE JS").
package engine

import (
	"context"
	"fmt"
	"log"
	"math"
	"sort"

	"github.com/JordyMontalvo/CBM_Server/closing-engine/internal/jsv"
)

// tp es un total_points: un número o "sin definir" (nodos que no cuelgan de
// la raíz fija). En operaciones aritméticas undefined se comporta como NaN;
// solo se distingue al ordenar (Array.sort deja los undefined al final).
type tp struct {
	v     float64
	undef bool
}

func (t tp) num() float64 {
	if t.undef {
		return math.NaN()
	}
	return t.v
}

func (t tp) js() any {
	if t.undef {
		return jsv.Undefined
	}
	return t.v
}

func tpsToAny(ts []tp) []any {
	out := make([]any, len(ts))
	for i, t := range ts {
		out[i] = t.js()
	}
	return out
}

// node guarda el documento del árbol (que se devuelve y se guarda tal cual)
// y los campos que usa el cálculo.
type node struct {
	doc         *jsv.Doc
	id          any
	parent      any
	childIDs    []any
	children    []*node
	activated   bool
	points      float64
	affPoints   float64
	totalPoints tp
	total       []tp
	rank        string
	levels      float64
	hasLevels   bool
	residual    float64
	residualArr []any
}

// Run es el estado de un cierre. En JS son las variables globales
// `tree` / `treeIndex`; aquí va por request para que dos cierres
// simultáneos no se pisen.
type Run struct {
	tree  []*node
	index map[string]*node
}

// indexById: si hay ids repetidos gana el primero, igual que Array.find.
func indexById(docs []*jsv.Doc) map[string]*jsv.Doc {
	index := make(map[string]*jsv.Doc, len(docs))
	for _, d := range docs {
		key := jsv.ToString(d.Get("id"))
		if _, ok := index[key]; !ok {
			index[key] = d
		}
	}
	return index
}

func (r *Run) findNode(id any) *node {
	return r.index[jsv.ToString(id)]
}

// New ejecuta `action: "new"` (líneas 428–552) y devuelve
// { tree, affiliations, activations }.
func New(ctx context.Context, st Store) (tree, affiliations, activations []any, err error) {
	log.Println("new ...")

	users, err := st.Find(ctx, CollUsers, jsv.D("tree", true))
	if err != nil {
		return nil, nil, nil, err
	}
	treeDocs, err := st.Find(ctx, CollTree, jsv.NewDoc())
	if err != nil {
		return nil, nil, nil, err
	}

	run, err := Compute(users, treeDocs)
	if err != nil {
		return nil, nil, nil, err
	}

	if err := run.fastBonus(ctx, st); err != nil {
		return nil, nil, nil, err
	}

	if err := run.buildPays(); err != nil {
		return nil, nil, nil, err
	}
	log.Println("5")

	affs, err := st.Find(ctx, CollAffiliations, jsv.D("closed", false))
	if err != nil {
		return nil, nil, nil, err
	}
	acts, err := st.Find(ctx, CollActivations, jsv.D("closed", false))
	if err != nil {
		return nil, nil, nil, err
	}

	return run.TreeDocs(), docsToAny(affs), docsToAny(acts), nil
}

// TreeDocs devuelve los documentos del árbol en el orden de Mongo.
func (r *Run) TreeDocs() []any {
	out := make([]any, len(r.tree))
	for i, n := range r.tree {
		out[i] = n.doc
	}
	return out
}

// Compute ejecuta la parte pura del cálculo (líneas 431–495): carga de
// nodos, total_points, rank, rangos Diamante, levels y pay_residual.
func Compute(users, treeDocs []*jsv.Doc) (*Run, error) {
	r := &Run{index: make(map[string]*node, len(treeDocs))}

	for _, d := range treeDocs {
		n := &node{doc: d, id: d.Get("id"), parent: d.Get("parent")}
		r.tree = append(r.tree, n)
		key := jsv.ToString(n.id)
		if _, ok := r.index[key]; !ok {
			r.index[key] = n
		}
	}
	usersIndex := indexById(users)

	for _, n := range r.tree {
		if err := initNode(n, usersIndex); err != nil {
			return nil, err
		}
	}

	if err := r.link(); err != nil {
		return nil, err
	}

	r.totalPointsFrom(RootID)
	log.Println("1")

	for _, n := range r.tree {
		raw := make([]tp, len(n.children))
		for i, c := range n.children {
			raw[i] = c.totalPoints
		}
		n.total = sortTotal(raw)
		n.doc.Set("total", tpsToAny(n.total))
		n.doc.Set("_total", tpsToAny(raw))
	}

	// rank(): en JS se llama recursivamente desde cada nodo, pero el rango
	// de un nodo solo depende de sus propios datos, así que el resultado
	// final es el mismo que asignarlo una vez por nodo.
	for _, n := range r.tree {
		n.rank = rank(n)
		n.doc.Set("rank", n.rank)
	}
	log.Println("2")

	for _, name := range diamondOrder {
		for _, n := range r.tree {
			if r.isRank(n, name) {
				n.rank = name
			}
		}
	}
	for _, n := range r.tree {
		n.doc.Set("rank", n.rank)
	}

	r.levels()
	log.Println("3")

	for _, n := range r.tree {
		if jsv.Truthy(n.parent) {
			if err := r.payResidual(n.parent, 0, n); err != nil {
				return nil, err
			}
		}
	}
	for _, n := range r.tree {
		n.doc.Set("residual_bonus", n.residual)
		n.doc.Set("residual_bonus_arr", n.residualArr)
	}
	log.Println("4")

	return r, nil
}

// initNode copia los datos del usuario al nodo (líneas 436–456).
func initNode(n *node, usersIndex map[string]*jsv.Doc) error {
	user, ok := usersIndex[jsv.ToString(n.id)]
	if !ok {
		// IGUAL QUE JS: `user.parentId` sobre undefined lanza TypeError.
		return &jsv.TypeError{Msg: fmt.Sprintf(
			"Cannot read properties of undefined (reading 'parentId'): no hay usuario con tree:true para el nodo %s",
			jsv.ToString(n.id))}
	}
	d := n.doc

	d.Set("parentId", user.Get("parentId"))
	d.Set("plan", user.Get("plan"))
	d.Set("dni", user.Get("dni"))
	d.Set("name", jsv.ToString(user.Get("name"))+" "+jsv.ToString(user.Get("lastName")))

	activated := user.Get("activated")
	d.Set("activated", activated)
	n.activated = jsv.Truthy(activated)

	_activated := user.Get("_activated")
	if !jsv.Truthy(_activated) {
		_activated = false
	}
	d.Set("_activated", _activated)

	n.points = jsv.ToNumber(user.Get("points"))
	d.Set("points", n.points)

	aff := user.Get("affiliation_points")
	if !jsv.Truthy(aff) {
		aff = 0.0
	}
	d.Set("affiliation_points", aff)
	switch a := aff.(type) {
	case float64:
		n.affPoints = a
	case bool: // solo puede ser true aquí: number + true === number + 1
		n.affPoints = 1
	default:
		// En JS `points + affiliation_points` concatenaría texto. No se
		// reproduce: se corta el cierre para no calcular con datos sucios.
		return fmt.Errorf("affiliation_points no numérico (%s) en el usuario %s; normalizar los datos o usar el motor JS",
			jsv.ToString(aff), jsv.ToString(n.id))
	}

	// IGUAL QUE JS: `user.closeds` no se copia (línea 449 comentada).

	pays := user.Get("pays")
	if !jsv.Truthy(pays) {
		pays = defaultPays()
	}
	d.Set("pays", pays)

	bonuses := user.Get("bonuses")
	if !jsv.Truthy(bonuses) {
		bonuses = defaultBonuses()
	}
	d.Set("bonuses", bonuses)

	nInactives := user.Get("n_inactives")
	if !jsv.Truthy(nInactives) {
		nInactives = 0.0
	}
	d.Set("n_inactives", nInactives)

	n.residual = 0
	n.residualArr = []any{}
	d.Set("residual_bonus", n.residual)
	d.Set("residual_bonus_arr", n.residualArr)
	d.Set("_pays", []any{})

	switch t := d.Get("total_points").(type) {
	case float64:
		n.totalPoints = tp{v: t}
	default:
		if !jsv.IsUndefined(t) {
			return fmt.Errorf("el nodo %s del árbol trae total_points no numérico", jsv.ToString(n.id))
		}
		n.totalPoints = tp{undef: true}
	}
	return nil
}

// link resuelve los hijos de cada nodo. En JS un hijo inexistente o un
// ciclo en `childs` hacen fallar el cierre (TypeError al leer
// `_node.total_points` o RangeError por recursión infinita en rank()),
// siempre antes de cualquier escritura. Aquí se detecta de entrada.
func (r *Run) link() error {
	for _, n := range r.tree {
		childs, ok := n.doc.Get("childs").([]any)
		if !ok {
			return &jsv.TypeError{Msg: fmt.Sprintf("node.childs.forEach is not a function (nodo %s)", jsv.ToString(n.id))}
		}
		n.childIDs = childs
		n.children = make([]*node, len(childs))
		for i, cid := range childs {
			c := r.findNode(cid)
			if c == nil {
				return &jsv.TypeError{Msg: fmt.Sprintf(
					"Cannot read properties of undefined (reading 'total_points'): el hijo %s del nodo %s no existe en tree",
					jsv.ToString(cid), jsv.ToString(n.id))}
			}
			n.children[i] = c
		}
	}

	// Detección de ciclos (DFS iterativo con colores).
	const (
		white = iota
		gray
		black
	)
	color := make(map[*node]int, len(r.tree))
	type frame struct {
		n *node
		i int
	}
	for _, start := range r.tree {
		if color[start] != white {
			continue
		}
		stack := []frame{{n: start}}
		color[start] = gray
		for len(stack) > 0 {
			top := &stack[len(stack)-1]
			if top.i == len(top.n.children) {
				color[top.n] = black
				stack = stack[:len(stack)-1]
				continue
			}
			c := top.n.children[top.i]
			top.i++
			switch color[c] {
			case gray:
				return fmt.Errorf("RangeError: Maximum call stack size exceeded (ciclo en tree que pasa por el nodo %s)", jsv.ToString(c.id))
			case white:
				color[c] = gray
				stack = append(stack, frame{n: c})
			}
		}
	}
	return nil
}

// totalPointsFrom equivale a total_points(id) (líneas 145–157). Solo se
// asigna total_points a los nodos que cuelgan de la raíz.
func (r *Run) totalPointsFrom(id any) {
	root := r.findNode(id)
	if root == nil {
		return
	}
	// Un nodo con dos padres se recalcularía en JS con el mismo resultado;
	// se memoriza para no repetir trabajo.
	done := make(map[*node]bool)
	var visit func(n *node) float64
	visit = func(n *node) float64 {
		if done[n] {
			return n.totalPoints.v
		}
		total := n.points + n.affPoints
		for _, c := range n.children {
			total += visit(c)
		}
		n.totalPoints = tp{v: total}
		done[n] = true
		n.doc.Set("total_points", total)
		return total
	}
	visit(root)
}

// sortTotal equivale a node.total.sort((a, b) => b - a): de mayor a menor,
// estable, con los undefined al final.
func sortTotal(raw []tp) []tp {
	defined := make([]tp, 0, len(raw))
	undef := 0
	for _, t := range raw {
		if t.undef {
			undef++
		} else {
			defined = append(defined, t)
		}
	}
	sort.SliceStable(defined, func(i, j int) bool { return defined[i].v > defined[j].v })
	for i := 0; i < undef; i++ {
		defined = append(defined, tp{undef: true})
	}
	return defined
}

// capSum equivale a los reduce de calc_range: suma cada elemento con tope
// (first*m para el primero, rest*m para el resto).
func capSum(arr []tp, first, rest, m float64) float64 {
	a := 0.0
	for c, t := range arr {
		f := rest
		if c == 0 {
			f = first
		}
		limit := f * m
		b := t.num()
		if b > limit {
			a += limit
		} else {
			a += b
		}
	}
	return a
}

// calcRange equivale a calc_range(arr) (líneas 159–232). El segundo
// parámetro del JS no se usa.
func calcRange(arr []tp) string {
	n := len(arr)
	if n >= 4 && capSum(arr, 0.2619, 0.25, 21000) >= 21000 {
		return "RUBI"
	}
	if n >= 4 && capSum(arr, 0.2768, 0.25, 9000) >= 9000 {
		return "sapphire"
	}
	if n >= 3 && capSum(arr, 0.3637, 0.3334, 3300) >= 3300 {
		return "gold"
	}
	if n >= 3 && capSum(arr, 0.4167, 0.3334, 1800) >= 1800 {
		return "silver"
	}
	if n >= 2 && capSum(arr, 0.5556, 0.5, 900) >= 900 {
		return "master"
	}
	if n >= 2 && capSum(arr, 0.6667, 0.5, 300) >= 300 {
		return "star"
	}
	return "active"
}

// rank equivale a rank(node) sin la recursión (ver Compute).
// Solo usuarios con activación full califican para rangos.
func rank(n *node) string {
	if n.activated {
		return calcRange(n.total)
	}
	return "none"
}

// levels equivale a levels() (líneas 246–260).
func (r *Run) levels() {
	for _, n := range r.tree {
		if lv, ok := Levels[n.rank]; ok {
			n.levels = lv
			n.hasLevels = true
			n.doc.Set("levels", lv)
		}
	}
}

// findRank equivale a find_rank(id, name) (líneas 262–275).
func (r *Run) findRank(n *node, name string) bool {
	if Pos[n.rank] >= Pos[name] {
		return true
	}
	for _, c := range n.children {
		if r.findRank(c, name) {
			return true
		}
	}
	return false
}

// isRank equivale a is_rank(node, rank) (líneas 277–336) para los rangos
// Diamante. find_rank no tiene efectos, así que solo se evalúa cuando el
// resultado puede ser true.
func (r *Run) isRank(n *node, name string) bool {
	rule := diamondRules[name]

	total := 0.0
	for i, t := range n.total {
		v := t.num()
		limit := rule.M2
		if i == 0 {
			limit = rule.M1
		}
		if v > limit {
			total += limit
		} else {
			total += v
		}
	}

	if !(total >= rule.M && len(n.childIDs) >= rule.minChilds) {
		return false
	}

	count := 0
	for _, c := range n.children {
		if r.findRank(c, rule.childRank) {
			count++
		}
	}
	return count >= rule.minCount
}

// payResidual equivale a pay_residual(id, n, user) (líneas 338–367):
// sube por el árbol hasta 13 niveles; los inactivos no gastan nivel.
func (r *Run) payResidual(id any, n int, user *node) error {
	// Pasos seguidos sin gastar nivel. Si supera el tamaño del árbol hay un
	// ciclo en `parent` (en JS: RangeError por recursión infinita).
	stall := 0
	for {
		if n == 13 {
			return nil
		}

		nd := r.findNode(id)
		if nd == nil {
			return &jsv.TypeError{Msg: fmt.Sprintf(
				"Cannot read properties of undefined (reading 'parent'): el nodo %s no existe en tree", jsv.ToString(id))}
		}
		parentID := nd.parent

		if nd.activated {
			// Solo activación full: todos reciben 100% de comisiones.
			rr := 1.0

			if nd.hasLevels && nd.levels > float64(n) {
				rates, ok := R[nd.rank]
				if !ok {
					return &jsv.TypeError{Msg: fmt.Sprintf("Cannot read properties of undefined (reading '%d')", n)}
				}
				rate := math.NaN() // r[rank][n] fuera de rango es undefined
				if n < len(rates) {
					rate = rates[n]
				}
				amount := rate * user.points * rr

				nd.residual += amount

				if amount > 0 {
					nd.residualArr = append(nd.residualArr, jsv.D(
						"n", float64(n),
						"dni", user.doc.Get("dni"),
						"name", user.doc.Get("name"),
						"val", user.points,
						"r", rate,
						"rr", rr,
						"amount", amount,
					))
				}
			}

			if !jsv.Truthy(parentID) {
				return nil
			}
			id = parentID
			n++
			stall = 0
			continue
		}

		if !jsv.Truthy(parentID) {
			return nil
		}
		stall++
		if stall > len(r.tree) {
			return fmt.Errorf("RangeError: Maximum call stack size exceeded (ciclo en parent desde el nodo %s)", jsv.ToString(user.id))
		}
		id = parentID
	}
}

// fastBonus equivale al bloque de `directs` (líneas 497–525).
//
// IGUAL QUE JS: compara `e.parenId` (sin la "t"), que no existe en los
// nodos, así que en la práctica nunca se paga el fast bonus.
func (r *Run) fastBonus(ctx context.Context, st Store) error {
	var candidates []*node
	for _, e := range r.tree {
		plan := e.doc.Get("plan")
		if jsv.Truthy(e.doc.Get("affiliation_points")) &&
			(jsv.LooseEq(plan, "business") || jsv.LooseEq(plan, "master")) {
			candidates = append(candidates, e)
		}
	}

	for _, n := range r.tree {
		var directs []*node
		for _, e := range candidates {
			if jsv.LooseEq(e.doc.Get("parenId"), n.id) {
				directs = append(directs, e)
			}
		}

		if len(directs) < 5 {
			continue
		}

		sort.SliceStable(directs, func(i, j int) bool {
			return planCmp(directs[i].doc.Get("plan"), directs[j].doc.Get("plan")) < 0
		})

		value := 100.0
		if jsv.LooseEq(directs[4].doc.Get("plan"), "master") {
			value = 250
		}

		if err := st.InsertOne(ctx, CollTransactions, jsv.D(
			"date", now(),
			"user_id", n.id,
			"type", "in",
			"value", value,
			"name", "fast bonus",
		)); err != nil {
			return err
		}
		log.Println("4 4")
	}
	return nil
}

func planCmp(a, b any) int {
	if jsv.LooseEq(a, b) {
		return 0
	}
	if jsv.LooseEq(a, "master") && jsv.LooseEq(b, "business") {
		return -1
	}
	return 1
}

// findPayIndex equivale a node.pays.findIndex((e) => e.name == rank).
func findPayIndex(pays []any, rank any) (int, error) {
	for i, e := range pays {
		name, err := jsv.GetProp(e, "name")
		if err != nil {
			return -1, err
		}
		if jsv.LooseEq(name, rank) {
			return i, nil
		}
	}
	return -1, nil
}

func paysArray(v any, id any) ([]any, error) {
	if jsv.IsNullish(v) {
		return nil, &jsv.TypeError{Msg: fmt.Sprintf("Cannot read properties of %s (reading 'findIndex') (nodo %s)", jsv.ToString(v), jsv.ToString(id))}
	}
	arr, ok := v.([]any)
	if !ok {
		return nil, &jsv.TypeError{Msg: fmt.Sprintf("node.pays.findIndex is not a function (nodo %s)", jsv.ToString(id))}
	}
	return arr, nil
}

// buildPays equivale al bloque de `_pays` (líneas 527–545).
func (r *Run) buildPays() error {
	for _, n := range r.tree {
		if n.rank == "none" {
			continue
		}
		pays, err := paysArray(n.doc.Get("pays"), n.id)
		if err != nil {
			return err
		}
		pos, err := findPayIndex(pays, n.rank)
		if err != nil {
			return err
		}
		if pos == -1 {
			continue
		}
		out := []any{}
		for i := 0; i <= pos; i++ {
			pay := pays[i]
			payed, err := jsv.GetProp(pay, "payed")
			if err != nil {
				return err
			}
			if !jsv.Truthy(payed) {
				out = append(out, pay)
			}
		}
		n.doc.Set("_pays", out)
	}
	return nil
}
