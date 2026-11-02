package engine

import (
	"context"
	"crypto/rand"
	"fmt"
	"log"
	"math/big"

	"github.com/JordyMontalvo/CBM_Server/closing-engine/internal/jsv"
)

// randID equivale a lib.rand(): Math.random().toString(36).substr(2).
// Variable para poder fijarla en tests.
var randID = func() string {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
	max := big.NewInt(int64(len(alphabet)))
	out := make([]byte, 11)
	for i := range out {
		k, err := rand.Int(rand.Reader, max)
		if err != nil {
			panic(err)
		}
		out[i] = alphabet[k.Int64()]
	}
	return string(out)
}

// Orden en que el JS revisa los bonos (líneas 622–625). "ruby" y "diamond"
// no son rangos que existan, así que nunca coinciden (IGUAL QUE JS).
var bonusRanks = []string{"sapphire", "ruby", "gold", "diamond"}

// Save ejecuta `action: "save"` (líneas 554–687) con el cuerpo recibido.
// Escribe en el mismo orden que el JS y, como el JS, sin transacción: si
// falla a la mitad deja la base en un estado parcial.
func Save(ctx context.Context, st Store, body any) error {
	log.Println("save ...")

	data, err := jsv.GetProp(body, "data")
	if err != nil {
		return err
	}
	treeV, err := jsv.GetProp(data, "tree")
	if err != nil {
		return err
	}
	affiliations, _ := jsv.GetProp(data, "affiliations")
	activations, _ := jsv.GetProp(data, "activations")

	tree, ok := treeV.([]any)
	if !ok {
		return &jsv.TypeError{Msg: "tree is not iterable"}
	}

	users := []any{}
	for _, node := range tree {
		rank, err := jsv.GetProp(node, "rank")
		if err != nil {
			return err
		}
		if jsv.LooseEq(rank, "none") {
			continue
		}
		get := func(k string) any { v, _ := jsv.GetProp(node, k); return v }
		users = append(users, jsv.D(
			"name", get("name"),
			"activated", get("activated"),
			"_activated", get("_activated"),
			"points", get("points"),
			"total", get("_total"),
			"rank", rank,
			"residual_bonus", get("residual_bonus"),
		))
	}
	log.Println("1")

	if err := st.InsertOne(ctx, CollCloseds, jsv.D(
		"id", randID(),
		"date", now(),
		"users", users,
		"tree", tree,
		"affiliations", affiliations,
		"activations", activations,
	)); err != nil {
		return err
	}
	log.Println("2")

	for _, node := range tree {
		rank, err := jsv.GetProp(node, "rank")
		if err != nil {
			return err
		}
		if jsv.LooseEq(rank, "none") {
			// IGUAL QUE JS: `node.n_inactives + 1;` (línea 628) no hace nada.
			continue
		}
		id, _ := jsv.GetProp(node, "id")
		residual, _ := jsv.GetProp(node, "residual_bonus")

		if err := st.InsertOne(ctx, CollTransactions, jsv.D(
			"date", now(),
			"user_id", id,
			"type", "in",
			"value", residual,
			"name", "residual",
		)); err != nil {
			return err
		}
		log.Println("3")

		paysV, _ := jsv.GetProp(node, "pays")
		pays, err := paysArray(paysV, id)
		if err != nil {
			return err
		}
		pos, err := findPayIndex(pays, rank)
		if err != nil {
			return err
		}

		if pos != -1 {
			for i := 0; i <= pos; i++ {
				pay := pays[i]
				payed, err := jsv.GetProp(pay, "payed")
				if err != nil {
					return err
				}
				if jsv.Truthy(payed) {
					continue
				}
				name, _ := jsv.GetProp(pay, "name")
				var value any = jsv.Undefined
				if v, ok := Pay[jsv.ToString(name)]; ok {
					value = v
				}

				if err := st.InsertOne(ctx, CollTransactions, jsv.D(
					"date", now(),
					"user_id", id,
					"type", "in",
					"value", value,
					"name", "closed bonus",
				)); err != nil {
					return err
				}
				log.Println("4")

				if err := jsv.SetProp(pay, "payed", true); err != nil {
					return err
				}
			}
		}

		for _, b := range bonusRanks {
			if !jsv.LooseEq(rank, b) {
				continue
			}
			bonuses, err := jsv.GetProp(node, "bonuses")
			if err != nil {
				return err
			}
			listV, err := jsv.GetProp(bonuses, b)
			if err != nil {
				return err
			}
			list, ok := listV.([]any)
			if !ok {
				return &jsv.TypeError{Msg: fmt.Sprintf("node.bonuses[%q].push is not a function (nodo %s)", b, jsv.ToString(id))}
			}
			if err := jsv.SetProp(bonuses, b, append(list, true)); err != nil {
				return err
			}
		}
	}
	log.Println("5")

	if err := st.UpdateMany(ctx, CollUsers, jsv.NewDoc(), jsv.D(
		"activated", false,
		"_activated", false,
		"rank", "none",
		"total_points", 0.0,
		"points", 0.0,
		"affiliation_points", 0.0,
	)); err != nil {
		return err
	}
	log.Println("6")

	if err := st.IncMany(ctx, CollUsers, jsv.NewDoc(), jsv.D("upgrade_pos", 1.0)); err != nil {
		return err
	}

	if err := st.UpdateMany(ctx, CollUsers, jsv.D("upgrade_pos", 2.0), jsv.D(
		"upgrade_pos", 0.0,
		"upgrade_arr", []any{0.0, 0.0},
	)); err != nil {
		return err
	}

	for _, node := range tree {
		rank, _ := jsv.GetProp(node, "rank")
		if jsv.LooseEq(rank, "none") {
			continue
		}
		get := func(k string) any { v, _ := jsv.GetProp(node, k); return v }
		// IGUAL QUE JS: `closeds: node.closeds` es undefined y el driver lo
		// guarda como null (ignoreUndefined: false).
		if err := st.UpdateOne(ctx, CollUsers, jsv.D("id", get("id")), jsv.D(
			"rank", rank,
			"pays", get("pays"),
			"closeds", get("closeds"),
			"bonuses", get("bonuses"),
			"n_inactives", get("n_inactives"),
		)); err != nil {
			return err
		}
		log.Println("7")
	}
	log.Println("8")

	if err := st.UpdateMany(ctx, CollAffiliations, jsv.NewDoc(), jsv.D("closed", true)); err != nil {
		return err
	}
	if err := st.UpdateMany(ctx, CollActivations, jsv.NewDoc(), jsv.D("closed", true)); err != nil {
		return err
	}
	log.Println("9")

	virtual, err := st.Find(ctx, CollTransactions, jsv.D("virtual", true))
	if err != nil {
		return err
	}
	for _, t := range virtual {
		if err := st.DeleteOne(ctx, CollTransactions, jsv.D("id", t.Get("id"))); err != nil {
			return err
		}
	}
	return nil
}
