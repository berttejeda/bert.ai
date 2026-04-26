package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	defaultOllamaEndpoint      = "http://localhost:11434"
	defaultOllamaModel         = "llama3.1"
	defaultOpenAICompatEndpoint = "https://api.openai.com/v1"
)

type openAICompatProvider struct {
	endpoint string // base URL including /v1
	model    string
	apiKey   string
}

// chatRequest is the OpenAI Chat Completions request body.
type chatRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatResponse is the OpenAI Chat Completions response body.
type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func newOllamaCompat(cfg Config) (*openAICompatProvider, error) {
	endpoint := envOrDefault(cfg.Endpoint, "OLLAMA_ENDPOINT", defaultOllamaEndpoint)
	model := envOrDefault(cfg.Model, "OLLAMA_MODEL", defaultOllamaModel)

	// Ensure endpoint has /v1 path for OpenAI compat
	endpoint = ensureV1Path(endpoint)

	return &openAICompatProvider{
		endpoint: endpoint,
		model:    model,
		apiKey:   cfg.APIKey, // typically empty for Ollama
	}, nil
}

func newOpenAICompat(cfg Config) (*openAICompatProvider, error) {
	endpoint := envOrDefault(cfg.Endpoint, "OPENAI_COMPAT_ENDPOINT", defaultOpenAICompatEndpoint)
	model := envOrDefault(cfg.Model, "OPENAI_COMPAT_MODEL", "")
	apiKey := envOrDefault(cfg.APIKey, "OPENAI_COMPAT_API_KEY", "")

	if model == "" {
		return nil, fmt.Errorf("openai-compatible provider requires a model name (set OPENAI_COMPAT_MODEL or provide via panel options)")
	}

	// Ensure endpoint has /v1 path
	endpoint = ensureV1Path(endpoint)

	return &openAICompatProvider{
		endpoint: endpoint,
		model:    model,
		apiKey:   apiKey,
	}, nil
}

func (o *openAICompatProvider) Generate(ctx context.Context, prompt string) (string, error) {
	reqBody := chatRequest{
		Model: o.model,
		Messages: []chatMessage{
			{Role: "user", Content: prompt},
		},
		Stream: false,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	url := strings.TrimRight(o.endpoint, "/") + "/chat/completions"

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("failed to create HTTP request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	if o.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+o.apiKey)
	}

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(respBytes))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBytes, &chatResp); err != nil {
		return "", fmt.Errorf("failed to parse response JSON: %w", err)
	}

	if chatResp.Error != nil {
		return "", fmt.Errorf("API error: %s", chatResp.Error.Message)
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("API returned no choices")
	}

	text := chatResp.Choices[0].Message.Content
	if text == "" {
		return "", fmt.Errorf("API returned empty content")
	}

	return text, nil
}

// ensureV1Path appends /v1 to the endpoint if it doesn't already end with it.
func ensureV1Path(endpoint string) string {
	trimmed := strings.TrimRight(endpoint, "/")
	if strings.HasSuffix(trimmed, "/v1") {
		return trimmed
	}
	return trimmed + "/v1"
}
