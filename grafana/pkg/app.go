package main

import (
	"context"
	"errors"
	"net/http"
	"os"

	"github.com/google/generative-ai-go/genai"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"google.golang.org/api/option"
)

// Make sure App implements required interfaces. This is important to do
// since otherwise we will only get a not implemented error response from plugin in
// runtime. Plugin should not implement all these interfaces - only those which are
// required for a particular task.
var (
	_ backend.CallResourceHandler = (*App)(nil)
	_ backend.CheckHealthHandler  = (*App)(nil)
)

// App is a panel plugin with a backend which can process screenshots.
type App struct {
	geminiClient *genai.GenerativeModel
}

// NewApp creates a new *App instance.
func NewApp(ctx context.Context) (*App, error) {
	app := &App{}

	// Get API key from environment variable
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return nil, errors.New("GEMINI_API_KEY environment variable not set. Please configure the API key in Grafana environment")
	}

	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return nil, errors.New("failed to create gemini client: " + err.Error())
	}
	// Use Gemini 2.0 Flash which supports multimodal input (text + images)
	app.geminiClient = client.GenerativeModel("gemini-2.0-flash-exp")

	return app, nil
}

// CheckHealth handles health checks sent from Grafana to the plugin.
func (a *App) CheckHealth(_ context.Context, _ *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "ok",
	}, nil
}

// CallResource is the entry point for all resource calls.
func (a *App) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// Use a switch to handle different resource paths.
	switch req.Path {
	case "screenshot":
		return a.handleScreenshot(ctx, req, sender)
	default:
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusNotFound,
		})
	}
}
