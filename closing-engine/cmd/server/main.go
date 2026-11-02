// Servidor HTTP del motor de cierre en Go.
//
// Variables de entorno (las mismas que lib/mongodb.js):
//
//	PORT                   puerto (por defecto 8080)
//	DB_URL                 cadena de conexión a Mongo
//	DB_NAME                base de datos
//	CLOSING_ENGINE_SECRET  secreto compartido con Next (cabecera X-Closing-Engine-Secret)
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/JordyMontalvo/CBM_Server/closing-engine/internal/handler"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	url := os.Getenv("DB_URL")
	if url == "" {
		log.Fatal("Please define the DB_URL environment variable")
	}
	name := os.Getenv("DB_NAME")
	secret := os.Getenv("CLOSING_ENGINE_SECRET")
	if secret == "" {
		log.Println("⚠️ CLOSING_ENGINE_SECRET no está definida: el endpoint queda sin protección")
	}

	opts := options.Client().
		ApplyURI(url).
		SetMaxPoolSize(10).
		SetServerSelectionTimeout(5 * time.Second)

	client, err := mongo.Connect(context.Background(), opts)
	if err != nil {
		log.Fatalf("mongo connect: %v", err)
	}
	pingCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	if err := client.Ping(pingCtx, nil); err != nil {
		log.Printf("⚠️ mongo ping: %v", err)
	}
	cancel()

	store := &mongoStore{db: client.Database(name)}

	mux := http.NewServeMux()
	mux.Handle("/closeds", &handler.Closeds{Store: store, Secret: secret})
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("closing engine escuchando en :%s", port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	// Deja terminar un cierre en curso antes de salir (Heroku da 30 s).
	ctx, cancelShutdown := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancelShutdown()
	_ = srv.Shutdown(ctx)
	_ = client.Disconnect(ctx)
}
