package engine

import (
	"context"
	"time"

	"github.com/JordyMontalvo/CBM_Server/closing-engine/internal/jsv"
)

// Store expone las mismas operaciones que usa el motor JS a través de
// components/db.js. Los métodos de actualización envuelven los valores en
// $set / $inc igual que db.js.
type Store interface {
	// Find equivale a db.collection(coll).find(filter).toArray().
	Find(ctx context.Context, coll string, filter *jsv.Doc) ([]*jsv.Doc, error)
	// InsertOne equivale a insertOne(doc).
	InsertOne(ctx context.Context, coll string, doc *jsv.Doc) error
	// UpdateOne equivale a updateOne(filter, { $set: set }).
	UpdateOne(ctx context.Context, coll string, filter, set *jsv.Doc) error
	// UpdateMany equivale a updateMany(filter, { $set: set }).
	UpdateMany(ctx context.Context, coll string, filter, set *jsv.Doc) error
	// IncMany equivale a updateMany(filter, { $inc: inc }).
	IncMany(ctx context.Context, coll string, filter, inc *jsv.Doc) error
	// DeleteOne equivale a deleteOne(filter).
	DeleteOne(ctx context.Context, coll string, filter *jsv.Doc) error
}

// Colecciones usadas por el motor (las mismas que components/db.js).
const (
	CollUsers        = "users"
	CollTree         = "tree"
	CollAffiliations = "affiliations"
	CollActivations  = "activations"
	CollTransactions = "transactions"
	CollCloseds      = "closeds"
)

// now equivale a `new Date()`. Variable para poder fijarla en tests.
var now = func() jsv.Date { return jsv.Date(time.Now().UnixMilli()) }

func docsToAny(docs []*jsv.Doc) []any {
	out := make([]any, len(docs))
	for i, d := range docs {
		out[i] = d
	}
	return out
}
