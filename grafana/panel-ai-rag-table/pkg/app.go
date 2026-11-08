package main

import (
	"context"
	"net/http"
	"os"

	"bertai-panel-ai-rag-table/pkg/provider"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// App is the main plugin application.
type App struct {
	logger log.Logger
}

// NewApp initialises the plugin and logs which LLM providers are available.
func NewApp(_ context.Context) (*App, error) {
	logger := log.DefaultLogger

	if os.Getenv("GEMINI_API_KEY") != "" {
		logger.Info("Gemini provider configured")
	}
	if os.Getenv("OLLAMA_ENDPOINT") != "" || os.Getenv("OLLAMA_MODEL") != "" {
		logger.Info("Ollama provider configured")
	}
	if os.Getenv("OPENAI_COMPAT_ENDPOINT") != "" {
		logger.Info("OpenAI-compatible provider configured")
	}

	return &App{logger: logger}, nil
}

// CheckHealth reports plugin health to Grafana.
func (a *App) CheckHealth(_ context.Context, _ *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	geminiOK := os.Getenv("GEMINI_API_KEY") != ""
	ollamaOK := os.Getenv("OLLAMA_ENDPOINT") != "" || os.Getenv("OLLAMA_MODEL") != ""
	openaiOK := os.Getenv("OPENAI_COMPAT_ENDPOINT") != ""

	if !geminiOK && !ollamaOK && !openaiOK {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: "No LLM provider configured. Set GEMINI_API_KEY, OLLAMA_ENDPOINT, or OPENAI_COMPAT_ENDPOINT.",
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
	case "rag-analyze":
		return a.handleRagAnalyze(ctx, req, sender)
	case "providers":
		return a.handleListProviders(ctx, req, sender)
	default:
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusNotFound,
			Body:   []byte(`{"error":"not_found","message":"Unknown resource path"}`),
		})
	}
}

// handleListProviders returns configured provider information.
func (a *App) handleListProviders(_ context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	if req.Method != http.MethodGet {
		return sendJSON(sender, http.StatusMethodNotAllowed, errorResponse{Error: "method_not_allowed", Message: "Only GET is accepted"})
	}

	return sendJSON(sender, http.StatusOK, providersResponse{
		Providers:     provider.AvailableProviders(),
		ServerDefault: provider.ServerDefault(),
	})
}
