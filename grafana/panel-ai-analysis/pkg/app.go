package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"

	"bertai-panel-ai-analysis/pkg/financial"
	"bertai-panel-ai-analysis/pkg/influx"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// App is the main plugin application.
type App struct {
	logger      log.Logger
	schemaCache *influx.SchemaCache

	// Cached default processor (from env vars), lazily initialized
	mu               sync.Mutex
	defaultProcessor *financial.Processor
	defaultClient    *influx.Client
}

// NewApp creates a new App instance.
// It validates that at least one LLM provider is configured via environment variables.
func NewApp(_ context.Context) (*App, error) {
	logger := log.DefaultLogger

	// Log which providers are configured
	if os.Getenv("GEMINI_API_KEY") != "" {
		logger.Info("Gemini provider configured")
	}
	if os.Getenv("OLLAMA_ENDPOINT") != "" || os.Getenv("OLLAMA_MODEL") != "" {
		logger.Info("Ollama provider configured")
	}
	if os.Getenv("OPENAI_COMPAT_ENDPOINT") != "" {
		logger.Info("OpenAI-compatible provider configured")
	}

	// Log InfluxDB status
	influxCfg := influx.ConfigFromEnv()
	if influxCfg.IsConfigured() {
		logger.Info("InfluxDB configured for Financial Q&A", "url", influxCfg.URL, "bucket", influxCfg.Bucket)
	} else {
		logger.Info("InfluxDB not configured — Financial Q&A (Ask mode) will be unavailable unless configured per-panel")
	}

	return &App{
		logger:      logger,
		schemaCache: influx.NewSchemaCache(5 * time.Minute),
	}, nil
}

// getProcessor returns a financial.Processor for the given InfluxDB config override.
// If override is nil, it uses the default (env var) config and caches the client.
func (a *App) getProcessor(override *influx.Config) (*financial.Processor, error) {
	if override != nil && override.URL != "" {
		// Per-request override — merge with env, create a fresh client
		cfg := influx.MergeWithEnv(*override)
		client, err := influx.New(cfg)
		if err != nil {
			return nil, fmt.Errorf("failed to create InfluxDB client from panel config: %w", err)
		}
		return financial.NewProcessor(client, a.schemaCache), nil
	}

	// Use cached default
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.defaultProcessor != nil {
		return a.defaultProcessor, nil
	}

	cfg := influx.MergeWithEnv(influx.Config{})
	if !cfg.IsConfigured() {
		return nil, fmt.Errorf("InfluxDB not configured. Set INFLUXDB_HOST, INFLUXDB_TOKEN, INFLUXDB_ORG, INFLUXDB_BUCKET environment variables or provide influxdb config in panel options")
	}

	client, err := influx.New(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create default InfluxDB client: %w", err)
	}

	a.defaultClient = client
	a.defaultProcessor = financial.NewProcessor(client, a.schemaCache)
	a.logger.Info("Default InfluxDB client initialized", "url", cfg.URL, "bucket", cfg.Bucket)

	return a.defaultProcessor, nil
}

// CheckHealth handles health checks from Grafana.
func (a *App) CheckHealth(_ context.Context, _ *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	// Check if at least one provider is configured
	geminiOK := os.Getenv("GEMINI_API_KEY") != ""
	ollamaOK := os.Getenv("OLLAMA_ENDPOINT") != "" || os.Getenv("OLLAMA_MODEL") != ""
	openaiOK := os.Getenv("OPENAI_COMPAT_ENDPOINT") != ""

	if !geminiOK && !ollamaOK && !openaiOK {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: "No LLM provider configured. Set at least one of: GEMINI_API_KEY, OLLAMA_ENDPOINT, or OPENAI_COMPAT_ENDPOINT.",
		}, nil
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Plugin is healthy. At least one LLM provider is configured.",
	}, nil
}

// CallResource routes resource requests to the appropriate handler.
func (a *App) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	switch req.Path {
	case "analyze":
		return a.handleAnalyze(ctx, req, sender)
	case "ask":
		return a.handleAsk(ctx, req, sender)
	case "providers":
		return a.handleListProviders(ctx, req, sender)
	case "schema":
		return a.handleGetSchema(ctx, req, sender)
	case "schema/refresh":
		return a.handleRefreshSchema(ctx, req, sender)
	default:
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusNotFound,
			Body:   []byte(`{"error": "not found"}`),
		})
	}
}
