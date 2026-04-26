package main

import (
	"context"
	"net/http"
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// App is the main plugin application.
type App struct {
	logger log.Logger
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

	return &App{
		logger: logger,
	}, nil
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
	case "providers":
		return a.handleListProviders(ctx, req, sender)
	default:
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusNotFound,
			Body:   []byte(`{"error": "not found"}`),
		})
	}
}
