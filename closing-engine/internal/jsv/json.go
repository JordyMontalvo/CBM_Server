package jsv

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strconv"
	"unicode/utf8"
)

// Marshal serializa v igual que JSON.stringify sobre los objetos que
// devuelve el driver de Node:
//   - las claves con valor undefined se omiten; en arrays se escribe null,
//   - NaN e Infinity se escriben como null,
//   - ObjectID se escribe como su string hexadecimal (ObjectId.toJSON),
//   - Date se escribe en ISO 8601 con milisegundos (Date.toJSON),
//   - Decimal128 se escribe como {"$numberDecimal": "..."}.
func Marshal(v any) []byte {
	var b bytes.Buffer
	writeValue(&b, v)
	return b.Bytes()
}

func writeValue(b *bytes.Buffer, v any) {
	switch x := v.(type) {
	case undefinedType, nil:
		b.WriteString("null")
	case bool:
		if x {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case float64:
		if math.IsNaN(x) || math.IsInf(x, 0) {
			b.WriteString("null")
		} else {
			b.WriteString(NumberString(x))
		}
	case string:
		writeString(b, x)
	case ObjectID:
		writeString(b, x.Hex())
	case Date:
		if !x.valid() {
			b.WriteString("null")
		} else {
			writeString(b, x.ISOString())
		}
	case Decimal128:
		b.WriteString(`{"$numberDecimal":`)
		writeString(b, x.Str)
		b.WriteByte('}')
	case *Doc:
		b.WriteByte('{')
		first := true
		for _, k := range x.keys {
			val := x.vals[k]
			if IsUndefined(val) {
				continue
			}
			if !first {
				b.WriteByte(',')
			}
			first = false
			writeString(b, k)
			b.WriteByte(':')
			writeValue(b, val)
		}
		b.WriteByte('}')
	case []any:
		b.WriteByte('[')
		for i, e := range x {
			if i > 0 {
				b.WriteByte(',')
			}
			writeValue(b, e)
		}
		b.WriteByte(']')
	case Opaque:
		writeValue(b, x.JSON)
	default:
		b.WriteString("null")
	}
}

const hexDigits = "0123456789abcdef"

func writeString(b *bytes.Buffer, s string) {
	b.WriteByte('"')
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		if r == utf8.RuneError && size == 1 {
			b.WriteString(`�`)
			i++
			continue
		}
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				b.WriteString(`\u00`)
				b.WriteByte(hexDigits[r>>4])
				b.WriteByte(hexDigits[r&0xf])
			} else {
				b.WriteString(s[i : i+size])
			}
		}
		i += size
	}
	b.WriteByte('"')
}

// Parse lee un JSON como JSON.parse: objetos como *Doc con orden de claves
// (si una clave se repite gana la última y conserva la primera posición),
// números como float64.
func Parse(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	v, err := parseValue(dec)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, fmt.Errorf("JSON inválido: datos extra al final")
	}
	return v, nil
}

func parseValue(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	return parseToken(dec, tok)
}

func parseToken(dec *json.Decoder, tok json.Token) (any, error) {
	switch t := tok.(type) {
	case json.Delim:
		switch t {
		case '{':
			d := NewDoc()
			for dec.More() {
				kt, err := dec.Token()
				if err != nil {
					return nil, err
				}
				k, ok := kt.(string)
				if !ok {
					return nil, fmt.Errorf("JSON inválido: clave no string")
				}
				v, err := parseValue(dec)
				if err != nil {
					return nil, err
				}
				d.Set(k, v)
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return d, nil
		case '[':
			arr := []any{}
			for dec.More() {
				v, err := parseValue(dec)
				if err != nil {
					return nil, err
				}
				arr = append(arr, v)
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return arr, nil
		}
		return nil, fmt.Errorf("JSON inválido: delimitador %v", t)
	case json.Number:
		f, err := strconv.ParseFloat(string(t), 64)
		if err != nil {
			if ne, ok := err.(*strconv.NumError); ok && ne.Err == strconv.ErrRange {
				return f, nil
			}
			return nil, err
		}
		return f, nil
	case string, bool, nil:
		return t, nil
	}
	return nil, fmt.Errorf("JSON inválido: token %v", tok)
}
