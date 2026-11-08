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

const defaultGeminiModel = "gemini-2.0-flash-exp"

type geminiProvider struct {
	apiKey string
	model  string
}

type geminiRequest struct {
	Contents []geminiContent `json:"contents"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func newGemini(cfg Config) (*geminiProvider, error) {
	apiKey := envOrDefault(cfg.APIKey, "GEMINI_API_KEY", "")
	if apiKey == "" {
		return nil, fmt.Errorf("gemini provider requires GEMINI_API_KEY")
	}
	model := envOrDefault(cfg.Model, "GEMINI_MODEL", defaultGeminiModel)
	return &geminiProvider{apiKey: apiKey, model: model}, nil
}

func (g *geminiProvider) Generate(ctx context.Context, prompt string) (string, error) {
	return g.generate(ctx, prompt)
}

func (g *geminiProvider) GenerateWithSystem(ctx context.Context, systemPrompt, userMessage string) (string, error) {
	combined := systemPrompt + "\n\n" + userMessage
	return g.generate(ctx, combined)
}

func (g *geminiProvider) generate(ctx context.Context, prompt string) (string, error) {
	reqBody := geminiRequest{
		Contents: []geminiContent{
			{Parts: []geminiPart{{Text: prompt}}},
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal Gemini request: %w", err)
	}

	url := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
		g.model, g.apiKey,
	)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("failed to create Gemini HTTP request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("Gemini HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read Gemini response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Gemini API returned status %d: %s", resp.StatusCode, string(respBytes))
	}

	var gemResp geminiResponse
	if err := json.Unmarshal(respBytes, &gemResp); err != nil {
		return "", fmt.Errorf("failed to parse Gemini response: %w", err)
	}
	if gemResp.Error != nil {
		return "", fmt.Errorf("Gemini API error: %s", gemResp.Error.Message)
	}
	if len(gemResp.Candidates) == 0 || len(gemResp.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("Gemini returned no content")
	}

	var parts []string
	for _, p := range gemResp.Candidates[0].Content.Parts {
		if p.Text != "" {
			parts = append(parts, p.Text)
		}
	}
	if len(parts) == 0 {
		return "", fmt.Errorf("Gemini returned empty text")
	}
	return strings.Join(parts, ""), nil
}
