package main

import (
	"context"
	"encoding/base64"
	"math"
	"strconv"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/bsontype"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"

	"github.com/JordyMontalvo/CBM_Server/closing-engine/internal/jsv"
)

// mongoStore implementa engine.Store con las mismas consultas que
// components/db.js.
type mongoStore struct {
	db *mongo.Database
}

func (s *mongoStore) Find(ctx context.Context, coll string, filter *jsv.Doc) ([]*jsv.Doc, error) {
	cur, err := s.db.Collection(coll).Find(ctx, toBSON(filter))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var out []*jsv.Doc
	for cur.Next(ctx) {
		out = append(out, fromRawDoc(cur.Current))
	}
	return out, cur.Err()
}

func (s *mongoStore) InsertOne(ctx context.Context, coll string, doc *jsv.Doc) error {
	_, err := s.db.Collection(coll).InsertOne(ctx, toBSON(doc))
	return err
}

func (s *mongoStore) UpdateOne(ctx context.Context, coll string, filter, set *jsv.Doc) error {
	_, err := s.db.Collection(coll).UpdateOne(ctx, toBSON(filter), bson.D{{Key: "$set", Value: toBSON(set)}})
	return err
}

func (s *mongoStore) UpdateMany(ctx context.Context, coll string, filter, set *jsv.Doc) error {
	_, err := s.db.Collection(coll).UpdateMany(ctx, toBSON(filter), bson.D{{Key: "$set", Value: toBSON(set)}})
	return err
}

func (s *mongoStore) IncMany(ctx context.Context, coll string, filter, inc *jsv.Doc) error {
	_, err := s.db.Collection(coll).UpdateMany(ctx, toBSON(filter), bson.D{{Key: "$inc", Value: toBSON(inc)}})
	return err
}

func (s *mongoStore) DeleteOne(ctx context.Context, coll string, filter *jsv.Doc) error {
	_, err := s.db.Collection(coll).DeleteOne(ctx, toBSON(filter))
	return err
}

// toBSON convierte un valor jsv a BSON igual que el serializador del driver
// de Node (bson v6):
//   - un número entero en rango int32 (y que no sea -0) se guarda como int32,
//     el resto como double,
//   - undefined se guarda como null (ignoreUndefined: false).
func toBSON(v any) any {
	switch x := v.(type) {
	case nil:
		return nil
	case bool, string:
		return x
	case float64:
		if x == math.Trunc(x) && x >= math.MinInt32 && x <= math.MaxInt32 && !(x == 0 && math.Signbit(x)) {
			return int32(x)
		}
		return x
	case jsv.ObjectID:
		return primitive.ObjectID(x)
	case jsv.Date:
		return primitive.DateTime(x)
	case jsv.Decimal128:
		return primitive.NewDecimal128(x.High, x.Low)
	case *jsv.Doc:
		d := make(bson.D, 0, x.Len())
		for _, k := range x.Keys() {
			d = append(d, bson.E{Key: k, Value: toBSON(x.Get(k))})
		}
		return d
	case []any:
		a := make(bson.A, len(x))
		for i, e := range x {
			a[i] = toBSON(e)
		}
		return a
	case jsv.Opaque:
		return x.Raw
	}
	// jsv.Undefined
	return nil
}

func fromRawDoc(raw bson.Raw) *jsv.Doc {
	d := jsv.NewDoc()
	elems, err := raw.Elements()
	if err != nil {
		return d
	}
	for _, e := range elems {
		d.Set(e.Key(), fromRawValue(e.Value()))
	}
	return d
}

// fromRawValue convierte BSON a jsv igual que el deserializador del driver
// de Node: int32/int64/double pasan a número (promoteLongs) y ObjectId/Date
// se conservan para serializarse luego como hex/ISO.
func fromRawValue(rv bson.RawValue) any {
	switch rv.Type {
	case bsontype.Double:
		return rv.Double()
	case bsontype.String:
		return rv.StringValue()
	case bsontype.EmbeddedDocument:
		return fromRawDoc(rv.Document())
	case bsontype.Array:
		vals, err := rv.Array().Values()
		if err != nil {
			return []any{}
		}
		out := make([]any, len(vals))
		for i, e := range vals {
			out[i] = fromRawValue(e)
		}
		return out
	case bsontype.Binary:
		sub, data := rv.Binary()
		return jsv.Opaque{
			Raw:  primitive.Binary{Subtype: sub, Data: data},
			JSON: base64.StdEncoding.EncodeToString(data),
		}
	case bsontype.Undefined, bsontype.Null:
		return nil
	case bsontype.ObjectID:
		return jsv.ObjectID(rv.ObjectID())
	case bsontype.Boolean:
		return rv.Boolean()
	case bsontype.DateTime:
		return jsv.Date(rv.DateTime())
	case bsontype.Int32:
		return float64(rv.Int32())
	case bsontype.Int64:
		return float64(rv.Int64())
	case bsontype.Decimal128:
		d := rv.Decimal128()
		h, l := d.GetBytes()
		return jsv.Decimal128{High: h, Low: l, Str: d.String()}
	case bsontype.Timestamp:
		t, i := rv.Timestamp()
		return jsv.Opaque{
			Raw:  primitive.Timestamp{T: t, I: i},
			JSON: jsv.D("$timestamp", strconv.FormatUint(uint64(t)<<32|uint64(i), 10)),
		}
	case bsontype.Regex:
		p, o := rv.Regex()
		return jsv.Opaque{Raw: primitive.Regex{Pattern: p, Options: o}, JSON: jsv.NewDoc()}
	}
	return jsv.Opaque{Raw: rv, JSON: jsv.NewDoc()}
}
