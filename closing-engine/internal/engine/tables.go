package engine

import "github.com/JordyMontalvo/CBM_Server/closing-engine/internal/jsv"

// Copia exacta de las tablas de pages/api/admin/closeds.js (líneas 32–143)
// y de la tabla de levels(). No modificar sin modificar también el JS
// mientras el respaldo siga activo.

// RootID es la raíz fija desde la que se suman los puntos (total_points).
const RootID = "5f0e0b67af92089b5866bcd0"

// Pay: monto del "closed bonus" por rango.
var Pay = map[string]float64{
	"star":              15,
	"master":            30,
	"silver":            45,
	"gold":              100,
	"sapphire":          200,
	"RUBI":              300,
	"DIAMANTE":          5000,
	"DOBLE DIAMANTE":    10000,
	"TRIPLE DIAMANTE":   15000,
	"DIAMANTE ESTRELLA": 25000,
}

// payNames: orden de la tabla `pays` por defecto.
var payNames = []string{
	"star",
	"master",
	"silver",
	"gold",
	"sapphire",
	"RUBI",
	"DIAMANTE",
	"DOBLE DIAMANTE",
	"TRIPLE DIAMANTE",
	"DIAMANTE ESTRELLA",
}

// defaultPays crea la tabla `pays` por defecto ({name, payed:false}).
// En JS es un único objeto compartido entre nodos; en `new` no se modifica,
// así que una copia por nodo produce exactamente la misma salida.
func defaultPays() []any {
	out := make([]any, len(payNames))
	for i, name := range payNames {
		out[i] = jsv.D("name", name, "payed", false)
	}
	return out
}

// defaultBonuses crea la tabla `bonuses` por defecto.
func defaultBonuses() *jsv.Doc {
	return jsv.D(
		"gold", []any{},
		"sapphire", []any{},
		"ruby", []any{},
		"diamond", []any{},
	)
}

// R: porcentajes del bono residual por rango y nivel.
var R = map[string][]float64{
	"active": {0.03, 0.01, 0.01},
	"star":   {0.05, 0.06, 0.08, 0.03, 0.005, 0.005},
	"master": {0.05, 0.06, 0.09, 0.07, 0.03, 0.01, 0.01, 0.005, 0.005},
	"silver": {0.05, 0.06, 0.09, 0.07, 0.03, 0.01, 0.01, 0.01, 0.01, 0.005, 0.005},
	"gold": {
		0.05, 0.06, 0.11, 0.08, 0.03, 0.015, 0.01, 0.01, 0.01, 0.005, 0.005, 0.005,
		0.005,
	},
	"sapphire": {
		0.06, 0.06, 0.11, 0.09, 0.04, 0.015, 0.01, 0.01, 0.01, 0.005, 0.005, 0.005,
		0.005, 0.005,
	},
	"RUBI": {
		0.06, 0.07, 0.13, 0.11, 0.04, 0.015, 0.01, 0.01, 0.01, 0.01, 0.005, 0.005,
		0.005, 0.005, 0.005,
	},
	"DIAMANTE": {
		0.07, 0.07, 0.14, 0.12, 0.05, 0.015, 0.01, 0.01, 0.01, 0.01, 0.005, 0.005,
		0.005, 0.005, 0.005,
	},
	"DOBLE DIAMANTE": {
		0.07, 0.08, 0.15, 0.13, 0.05, 0.02, 0.02, 0.01, 0.01, 0.01, 0.005, 0.005,
		0.005, 0.005, 0.005,
	},
	"TRIPLE DIAMANTE": {
		0.08, 0.1, 0.15, 0.13, 0.05, 0.02, 0.02, 0.01, 0.01, 0.01, 0.005, 0.005,
		0.005, 0.005, 0.005,
	},
	"DIAMANTE ESTRELLA": {
		0.08, 0.1, 0.16, 0.13, 0.05, 0.02, 0.02, 0.01, 0.01, 0.01, 0.005, 0.005,
		0.005, 0.005, 0.005,
	},
}

// Pos: orden de los rangos.
var Pos = map[string]float64{
	"none":              -1,
	"active":            0,
	"star":              1,
	"master":            2,
	"silver":            3,
	"gold":              4,
	"sapphire":          5,
	"RUBI":              6,
	"DIAMANTE":          7,
	"DOBLE DIAMANTE":    8,
	"TRIPLE DIAMANTE":   9,
	"DIAMANTE ESTRELLA": 10,
}

// Levels: niveles de profundidad que cobra cada rango (función levels()).
// "none" no está: esos nodos no reciben `levels`.
var Levels = map[string]float64{
	"DIAMANTE ESTRELLA": 15,
	"TRIPLE DIAMANTE":   15,
	"DOBLE DIAMANTE":    15,
	"DIAMANTE":          15,
	"RUBI":              15,
	"sapphire":          14,
	"gold":              13,
	"silver":            11,
	"master":            9,
	"star":              6,
	"active":            3,
}

// diamondRule: umbrales de is_rank() para los rangos Diamante.
type diamondRule struct {
	M, M1, M2 float64
	minChilds int
	minCount  int
	childRank string // rango que deben alcanzar las ramas (find_rank)
}

var diamondRules = map[string]diamondRule{
	"DIAMANTE":          {M: 60000, M1: 13000, M2: 12000, minChilds: 5, minCount: 4, childRank: "sapphire"},
	"DOBLE DIAMANTE":    {M: 115000, M1: 23000, M2: 23000, minChilds: 5, minCount: 4, childRank: "RUBI"},
	"TRIPLE DIAMANTE":   {M: 225000, M1: 37500, M2: 37500, minChilds: 6, minCount: 5, childRank: "RUBI"},
	"DIAMANTE ESTRELLA": {M: 520000, M1: 87000, M2: 86700, minChilds: 6, minCount: 5, childRank: "DIAMANTE"},
}

// diamondOrder: orden en que se evalúan los rangos Diamante (líneas 481–488).
var diamondOrder = []string{"DIAMANTE", "DOBLE DIAMANTE", "TRIPLE DIAMANTE", "DIAMANTE ESTRELLA"}
