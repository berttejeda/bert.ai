package main

import (
	"context"
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

func main() {
	app, err := NewApp(context.Background())
	if err != nil {
		log.DefaultLogger.Error("Failed to create app", "error", err)
		os.Exit(1)
	}

	if err := backend.Serve(backend.ServeOpts{
		CallResourceHandler: app,
		CheckHealthHandler:  app,
	}); err != nil {
		log.DefaultLogger.Error(err.Error())
		os.Exit(1)
	}
}
