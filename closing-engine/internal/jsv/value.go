// Package jsv modela los valores que maneja el motor de cierre JS
// (pages/api/admin/closeds.js) con la misma semántica de JavaScript:
// documentos con orden de claves, `undefined` distinto de `null`,
// números siempre float64 y las coerciones de `==`, `Number()`, `String()`
// y truthiness que usa el código original.
//
// Tipos de valor admitidos:
//
//	Undefined, nil (null), bool, float64, string, ObjectID, Date,
//	Decimal128, *Doc, []any, Opaque
package jsv

import (
	"encoding/hex"
	"fmt"
	"math"
	"math/big"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
)

type undefinedType struct{}

// Undefined representa el `undefined` de JS.
var Undefined = undefinedType{}

// IsUndefined indica si v es Undefined.
func IsUndefined(v any) bool {
	_, ok := v.(undefinedType)
	return ok
}

// ObjectID es un ObjectId de Mongo (12 bytes).
type ObjectID [12]byte

// Hex devuelve la representación hexadecimal, igual que ObjectId.toString().
func (o ObjectID) Hex() string { return hex.EncodeToString(o[:]) }

// Date son milisegundos desde epoch (Date de JS / BSON DateTime).
type Date int64

// Decimal128 conserva el valor BSON y su representación en texto.
type Decimal128 struct {
	High, Low uint64
	Str       string
}

// Opaque guarda un valor BSON que el motor no interpreta. Raw se reescribe
// tal cual en Mongo y JSON es lo que se serializa en las respuestas.
type Opaque struct {
	Raw  any
	JSON any
}

// Doc es un objeto de JS: claves con orden de inserción.
type Doc struct {
	keys []string
	vals map[string]any
}

// NewDoc crea un documento vacío.
func NewDoc() *Doc { return &Doc{vals: map[string]any{}} }

// D crea un documento a partir de pares clave/valor, en orden.
func D(kv ...any) *Doc {
	d := NewDoc()
	for i := 0; i+1 < len(kv); i += 2 {
		d.Set(kv[i].(string), kv[i+1])
	}
	return d
}

// Get devuelve el valor de la clave o Undefined si no existe.
func (d *Doc) Get(k string) any {
	if v, ok := d.vals[k]; ok {
		return v
	}
	return Undefined
}

// Has indica si la clave existe (aunque valga Undefined).
func (d *Doc) Has(k string) bool {
	_, ok := d.vals[k]
	return ok
}

// Set asigna la clave. Si ya existe conserva su posición, como en JS.
func (d *Doc) Set(k string, v any) {
	if _, ok := d.vals[k]; !ok {
		d.keys = append(d.keys, k)
	}
	d.vals[k] = v
}

// Keys devuelve las claves en orden de inserción.
func (d *Doc) Keys() []string { return d.keys }

// Len devuelve el número de claves.
func (d *Doc) Len() int { return len(d.keys) }

// TypeError reproduce los errores que lanza JS al leer propiedades de
// null/undefined o llamar métodos inexistentes.
type TypeError struct{ Msg string }

func (e *TypeError) Error() string { return "TypeError: " + e.Msg }

// IsNullish indica null o undefined.
func IsNullish(v any) bool { return v == nil || IsUndefined(v) }

// GetProp equivale a `v[key]`: error si v es null/undefined, Undefined si v
// no tiene esa propiedad.
func GetProp(v any, key string) (any, error) {
	if IsNullish(v) {
		return nil, &TypeError{fmt.Sprintf("Cannot read properties of %s (reading '%s')", ToString(v), key)}
	}
	if d, ok := v.(*Doc); ok {
		return d.Get(key), nil
	}
	return Undefined, nil
}

// SetProp equivale a `v[key] = val` en modo estricto.
func SetProp(v any, key string, val any) error {
	switch x := v.(type) {
	case *Doc:
		x.Set(key, val)
		return nil
	case []any, ObjectID, Date, Decimal128, Opaque:
		// Objetos sin forma serializable para esa clave: la asignación
		// no tiene efecto visible en JSON/BSON.
		return nil
	}
	if IsNullish(v) {
		return &TypeError{fmt.Sprintf("Cannot set properties of %s (setting '%s')", ToString(v), key)}
	}
	return &TypeError{fmt.Sprintf("Cannot create property '%s' on %s '%s'", key, typeName(v), ToString(v))}
}

func typeName(v any) string {
	switch v.(type) {
	case bool:
		return "boolean"
	case float64:
		return "number"
	case string:
		return "string"
	}
	return "object"
}

// Truthy reproduce la conversión a booleano de JS.
func Truthy(v any) bool {
	switch x := v.(type) {
	case undefinedType, nil:
		return false
	case bool:
		return x
	case float64:
		return x != 0 && !math.IsNaN(x)
	case string:
		return x != ""
	}
	return true
}

// NumberString reproduce Number.prototype.toString() (base 10).
func NumberString(f float64) string {
	switch {
	case math.IsNaN(f):
		return "NaN"
	case math.IsInf(f, 1):
		return "Infinity"
	case math.IsInf(f, -1):
		return "-Infinity"
	case f == 0:
		return "0"
	}
	abs := math.Abs(f)
	if abs >= 1e21 || abs < 1e-6 {
		s := strconv.FormatFloat(f, 'e', -1, 64)
		i := strings.IndexByte(s, 'e')
		mant, exp := s[:i], s[i+1:]
		sign := exp[0]
		digits := strings.TrimLeft(exp[1:], "0")
		if digits == "" {
			digits = "0"
		}
		return mant + "e" + string(sign) + digits
	}
	return strconv.FormatFloat(f, 'f', -1, 64)
}

// ISOString reproduce Date.prototype.toISOString().
func (d Date) ISOString() string {
	t := time.UnixMilli(int64(d)).UTC()
	y := t.Year()
	rest := t.Format("-01-02T15:04:05.000Z")
	if y >= 0 && y <= 9999 {
		return fmt.Sprintf("%04d%s", y, rest)
	}
	if y < 0 {
		return fmt.Sprintf("-%06d%s", -y, rest)
	}
	return fmt.Sprintf("+%06d%s", y, rest)
}

// validDate indica si el Date está en el rango válido de JS.
func (d Date) valid() bool { return int64(d) >= -8.64e15 && int64(d) <= 8.64e15 }

// jsDateString aproxima Date.prototype.toString() asumiendo TZ=UTC
// (la del dyno de Heroku).
func (d Date) jsDateString() string {
	if !d.valid() {
		return "Invalid Date"
	}
	t := time.UnixMilli(int64(d)).UTC()
	return t.Format("Mon Jan 02 2006 15:04:05") + " GMT+0000 (Coordinated Universal Time)"
}

// ToString reproduce String(v).
func ToString(v any) string {
	switch x := v.(type) {
	case undefinedType:
		return "undefined"
	case nil:
		return "null"
	case bool:
		if x {
			return "true"
		}
		return "false"
	case float64:
		return NumberString(x)
	case string:
		return x
	case ObjectID:
		return x.Hex()
	case Date:
		return x.jsDateString()
	case Decimal128:
		return x.Str
	case []any:
		parts := make([]string, len(x))
		for i, e := range x {
			if !IsNullish(e) {
				parts[i] = ToString(e)
			}
		}
		return strings.Join(parts, ",")
	}
	return "[object Object]"
}

var decimalLiteral = regexp.MustCompile(`^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$`)

func isJSWhitespace(r rune) bool {
	if r == '﻿' {
		return true
	}
	if r == '\u0085' {
		return false
	}
	return unicode.IsSpace(r)
}

// StringToNumber reproduce la conversión de string a número de JS.
func StringToNumber(s string) float64 {
	t := strings.TrimFunc(s, isJSWhitespace)
	if t == "" {
		return 0
	}
	switch t {
	case "Infinity", "+Infinity":
		return math.Inf(1)
	case "-Infinity":
		return math.Inf(-1)
	}
	if len(t) > 2 && t[0] == '0' {
		base := 0
		switch t[1] {
		case 'x', 'X':
			base = 16
		case 'o', 'O':
			base = 8
		case 'b', 'B':
			base = 2
		}
		if base != 0 {
			n, ok := new(big.Int).SetString(t[2:], base)
			if !ok || strings.ContainsAny(t[2:], "_+-") {
				return math.NaN()
			}
			f, _ := new(big.Float).SetInt(n).Float64()
			return f
		}
	}
	if !decimalLiteral.MatchString(t) {
		return math.NaN()
	}
	f, err := strconv.ParseFloat(t, 64)
	if err != nil {
		if ne, ok := err.(*strconv.NumError); ok && ne.Err == strconv.ErrRange {
			return f
		}
		return math.NaN()
	}
	return f
}

// ToNumber reproduce Number(v).
func ToNumber(v any) float64 {
	switch x := v.(type) {
	case undefinedType:
		return math.NaN()
	case nil:
		return 0
	case bool:
		if x {
			return 1
		}
		return 0
	case float64:
		return x
	case string:
		return StringToNumber(x)
	case Date:
		if !x.valid() {
			return math.NaN()
		}
		return float64(x)
	case ObjectID, Decimal128, []any:
		return StringToNumber(ToString(x))
	}
	return math.NaN()
}

// toPrimitive reproduce ToPrimitive (hint "default") para objetos.
// Devuelve el valor tal cual si ya es primitivo.
func toPrimitive(v any) any {
	switch v.(type) {
	case ObjectID, Date, Decimal128, []any, *Doc, Opaque:
		return ToString(v)
	}
	return v
}

func isObject(v any) bool {
	switch v.(type) {
	case ObjectID, Date, Decimal128, []any, *Doc, Opaque:
		return true
	}
	return false
}

// LooseEq reproduce el operador `==` de JS.
func LooseEq(a, b any) bool {
	if IsNullish(a) || IsNullish(b) {
		return IsNullish(a) && IsNullish(b)
	}
	if isObject(a) && isObject(b) {
		// Comparación por referencia: solo documentos idénticos.
		da, okA := a.(*Doc)
		db, okB := b.(*Doc)
		return okA && okB && da == db
	}
	if isObject(a) {
		return LooseEq(toPrimitive(a), b)
	}
	if isObject(b) {
		return LooseEq(a, toPrimitive(b))
	}
	switch x := a.(type) {
	case bool:
		return LooseEq(ToNumber(x), b)
	case float64:
		switch y := b.(type) {
		case float64:
			return x == y
		case string:
			return x == StringToNumber(y)
		case bool:
			return x == ToNumber(y)
		}
	case string:
		switch y := b.(type) {
		case string:
			return x == y
		case float64:
			return StringToNumber(x) == y
		case bool:
			return StringToNumber(x) == ToNumber(y)
		}
	}
	return false
}
