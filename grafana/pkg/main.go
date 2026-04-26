package main

import (
	"context"
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

func main() {
	// Create a single instance of our app
	app, err := NewApp(context.Background())
	if err != nil {
		log.DefaultLogger.Error("Failed to create app", "error", err)
		os.Exit(1)
	}

	// Serve the plugin using backend.Serve
	if err := backend.Serve(backend.ServeOpts{
		CallResourceHandler: app,
		CheckHealthHandler:  app,
	}); err != nil {
		log.DefaultLogger.Error(err.Error())
		os.Exit(1)
	}
}
