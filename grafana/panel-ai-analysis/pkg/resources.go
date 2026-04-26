package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"bertai-panel-ai-analysis/pkg/provider"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// analyzeRequest mirrors the frontend AnalyzeRequest type.
type analyzeRequest struct {
	PanelJSON         map[string]interface{}   `json:"panelJson"`
	RawTargets        []map[string]interface{} `json:"rawTargets"`
	ResolvedVariables []templateVariableInfo   `json:"resolvedVariables"`
	QueryResults      []serializedDataFrame    `json:"queryResults"`
	Prompt            string                   `json:"prompt"`
	LLM               provider.Config          `json:"llm"`
}

type templateVariableInfo struct {
	Name    string `json:"name"`
	Label   string `json:"label,omitempty"`
	Current string `json:"current"`
	Type    string `json:"type"`
}

type serializedDataFrame struct {
	Name           string            `json:"name"`
	Fields         []serializedField `json:"fields"`
	Length         int               `json:"length"`
	Sampled        bool              `json:"sampled,omitempty"`
	OriginalLength int               `json:"originalLength,omitempty"`
}

type serializedField struct {
	Name   string            `json:"name"`
	Type   string            `json:"type"`
	Values []interface{}     `json:"values"`
	Labels map[string]string `json:"labels,omitempty"`
}

type analyzeResponse struct {
	Analysis string `json:"analysis"`
}

type errorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

type providersResponse struct {
	Providers     []provider.ProviderInfo `json:"providers"`
	ServerDefault provider.DefaultConfig  `json:"serverDefault"`
}

// handleAnalyze processes an analysis request.
func (a *App) handleAnalyze(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	if req.Method != http.MethodPost {
		return sendJSON(sender, http.StatusMethodNotAllowed, errorResponse{
			Error:   "method_not_allowed",
			Message: "Only POST is accepted",
		})
	}

	var request analyzeRequest
	if err := json.Unmarshal(req.Body, &request); err != nil {
		a.logger.Error("Failed to unmarshal request", "error", err)
		return sendJSON(sender, http.StatusBadRequest, errorResponse{
			Error:   "invalid_request",
			Message: fmt.Sprintf("Failed to parse request body: %v", err),
		})
	}

	if len(request.QueryResults) == 0 {
		return sendJSON(sender, http.StatusBadRequest, errorResponse{
			Error:   "no_data",
			Message: "No query results provided. Ensure the panel has a configured datasource.",
		})
	}

	// Build the full prompt
	fullPrompt := buildFullPrompt(request)

	// Resolve provider config (panel options override env defaults)
	llmProvider, err := provider.New(request.LLM)
	if err != nil {
		a.logger.Error("Failed to create LLM provider", "error", err, "provider", request.LLM.Provider)
		return sendJSON(sender, http.StatusBadRequest, errorResponse{
			Error:   "provider_error",
			Message: fmt.Sprintf("Failed to initialize LLM provider %q: %v", request.LLM.Provider, err),
		})
	}

	// Call the LLM
	a.logger.Debug("Sending prompt to LLM", "provider", request.LLM.Provider, "promptLength", len(fullPrompt))
	analysis, err := llmProvider.Generate(ctx, fullPrompt)
	if err != nil {
		a.logger.Error("LLM generation failed", "error", err, "provider", request.LLM.Provider)
		return sendJSON(sender, http.StatusInternalServerError, errorResponse{
			Error:   "llm_error",
			Message: fmt.Sprintf("LLM analysis failed: %v", err),
		})
	}

	a.logger.Debug("Analysis complete", "provider", request.LLM.Provider, "responseLength", len(analysis))
	return sendJSON(sender, http.StatusOK, analyzeResponse{Analysis: analysis})
}

// handleListProviders returns which providers are configured.
func (a *App) handleListProviders(_ context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	if req.Method != http.MethodGet {
		return sendJSON(sender, http.StatusMethodNotAllowed, errorResponse{
			Error:   "method_not_allowed",
			Message: "Only GET is accepted",
		})
	}

	return sendJSON(sender, http.StatusOK, providersResponse{
		Providers:     provider.AvailableProviders(),
		ServerDefault: provider.ServerDefault(),
	})
}

func sendJSON(sender backend.CallResourceResponseSender, status int, payload interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusInternalServerError,
			Body:   []byte(`{"error": "internal", "message": "Failed to marshal response"}`),
		})
	}

	return sender.Send(&backend.CallResourceResponse{
		Status:  status,
		Headers: map[string][]string{"Content-Type": {"application/json"}},
		Body:    body,
	})
}
