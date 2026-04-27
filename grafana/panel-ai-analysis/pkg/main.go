package main

import (
	"context"
	"fmt"
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// Version is set at build time via -ldflags:
//
//	go build -ldflags "-X main.Version=1.2.3"
var Version = "dev"

func main() {
	// Handle --version / -version flag before starting the plugin server
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-version" || os.Args[1] == "-v") {
		fmt.Println(Version)
		os.Exit(0)
	}

	app, err := NewApp(context.Background())
	if err != nil {
		log.DefaultLogger.Error("Failed to create app", "error", err)
		os.Exit(1)
	}

	log.DefaultLogger.Info("Starting plugin", "version", Version)

	if err := backend.Serve(backend.ServeOpts{
		CallResourceHandler: app,
		CheckHealthHandler:  app,
	}); err != nil {
		log.DefaultLogger.Error(err.Error())
		os.Exit(1)
	}
}
