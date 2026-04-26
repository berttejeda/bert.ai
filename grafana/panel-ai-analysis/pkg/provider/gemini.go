package provider

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

const defaultGeminiModel = "gemini-2.0-flash-exp"

type geminiProvider struct {
	apiKey string
	model  string
}

func newGemini(cfg Config) (*geminiProvider, error) {
	apiKey := envOrDefault(cfg.APIKey, "GEMINI_API_KEY", "")
	if apiKey == "" {
		return nil, fmt.Errorf("gemini provider requires an API key (set GEMINI_API_KEY or provide via panel options)")
	}

	model := envOrDefault(cfg.Model, "GEMINI_MODEL", defaultGeminiModel)

	return &geminiProvider{
		apiKey: apiKey,
		model:  model,
	}, nil
}

func (g *geminiProvider) Generate(ctx context.Context, prompt string) (string, error) {
	client, err := genai.NewClient(ctx, option.WithAPIKey(g.apiKey))
	if err != nil {
		return "", fmt.Errorf("failed to create Gemini client: %w", err)
	}
	defer client.Close()

	model := client.GenerativeModel(g.model)
	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return "", fmt.Errorf("Gemini API error: %w", err)
	}

	var result strings.Builder
	for _, candidate := range resp.Candidates {
		if candidate.Content != nil {
			for _, part := range candidate.Content.Parts {
				result.WriteString(fmt.Sprintf("%v", part))
			}
		}
	}

	text := result.String()
	if text == "" {
		return "", fmt.Errorf("Gemini returned empty response")
	}

	return text, nil
}
