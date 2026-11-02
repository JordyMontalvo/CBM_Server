package jsv

import (
	"math"
	"testing"
)

func TestNumberString(t *testing.T) {
	// Variables para que la suma se haga en float64 y no como constante exacta.
	a, b := 0.1, 0.2
	cases := []struct {
		in   float64
		want string
	}{
		{0, "0"},
		{math.Copysign(0, -1), "0"},
		{123, "123"},
		{-4.5, "-4.5"},
		{a + b, "0.30000000000000004"},
		{1e21, "1e+21"},
		{1.5e-7, "1.5e-7"},
		{0.000001, "0.000001"},
		{123456789012345680000, "123456789012345680000"},
		{math.NaN(), "NaN"},
		{math.Inf(-1), "-Infinity"},
	}
	for _, c := range cases {
		if got := NumberString(c.in); got != c.want {
			t.Errorf("NumberString(%v) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestToNumber(t *testing.T) {
	cases := []struct {
		in   any
		want float64
	}{
		{"", 0},
		{" 12 ", 12},
		{"0x1A", 26},
		{"1e3", 1000},
		{".5", 0.5},
		{"5.", 5},
		{"Infinity", math.Inf(1)},
		{nil, 0},
		{true, 1},
		{[]any{}, 0},
		{[]any{"7"}, 7},
	}
	for _, c := range cases {
		if got := ToNumber(c.in); got != c.want {
			t.Errorf("ToNumber(%#v) = %v, want %v", c.in, got, c.want)
		}
	}
	for _, in := range []any{Undefined, "abc", "1_000", "inf", "NaN", "0x", NewDoc(), "1e"} {
		if got := ToNumber(in); !math.IsNaN(got) {
			t.Errorf("ToNumber(%#v) = %v, want NaN", in, got)
		}
	}
}

func TestTruthy(t *testing.T) {
	for _, v := range []any{Undefined, nil, false, 0.0, math.NaN(), ""} {
		if Truthy(v) {
			t.Errorf("Truthy(%#v) = true", v)
		}
	}
	for _, v := range []any{true, 1.0, "0", []any{}, NewDoc(), ObjectID{}} {
		if !Truthy(v) {
			t.Errorf("Truthy(%#v) = false", v)
		}
	}
}

func TestLooseEq(t *testing.T) {
	oid := ObjectID{0x5f, 0x0e, 0x0b, 0x67, 0xaf, 0x92, 0x08, 0x9b, 0x58, 0x66, 0xbc, 0xd0}
	cases := []struct {
		a, b any
		want bool
	}{
		{Undefined, nil, true},
		{Undefined, Undefined, true},
		{nil, 0.0, false},
		{Undefined, "x", false},
		{"1", 1.0, true},
		{0.0, false, true},
		{"", 0.0, true},
		{"master", "master", true},
		{"master", "business", false},
		{oid, "5f0e0b67af92089b5866bcd0", true},
		{oid, oid, false}, // objetos distintos: comparación por referencia
		{math.NaN(), math.NaN(), false},
	}
	for _, c := range cases {
		if got := LooseEq(c.a, c.b); got != c.want {
			t.Errorf("LooseEq(%#v, %#v) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}

func TestMarshal(t *testing.T) {
	d := D(
		"a", 1.0,
		"skip", Undefined,
		"nan", math.NaN(),
		"arr", []any{Undefined, nil, 2.5},
		"s", "<a>\"\n\x01",
		"oid", ObjectID{0x5f, 0x0e, 0x0b, 0x67, 0xaf, 0x92, 0x08, 0x9b, 0x58, 0x66, 0xbc, 0xd0},
		"date", Date(0),
	)
	want := `{"a":1,"nan":null,"arr":[null,null,2.5],"s":"<a>\"\n\u0001","oid":"5f0e0b67af92089b5866bcd0","date":"1970-01-01T00:00:00.000Z"}`
	if got := string(Marshal(d)); got != want {
		t.Errorf("Marshal =\n%s\nwant\n%s", got, want)
	}
}

func TestParseKeepsOrderAndLastDuplicate(t *testing.T) {
	v, err := Parse([]byte(`{"b":1,"a":[true,null,"x"],"b":2}`))
	if err != nil {
		t.Fatal(err)
	}
	if got := string(Marshal(v)); got != `{"b":2,"a":[true,null,"x"]}` {
		t.Errorf("Parse/Marshal = %s", got)
	}
}

func TestDocSetKeepsPosition(t *testing.T) {
	d := D("x", 1.0, "y", 2.0)
	d.Set("x", 3.0)
	if got := string(Marshal(d)); got != `{"x":3,"y":2}` {
		t.Errorf("got %s", got)
	}
}
