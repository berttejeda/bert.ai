package provider

import (
	"context"
	"fmt"
	"os"
	"strings"
)

// Config carries per-request LLM provider settings from panel options.
// Empty fields fall back to environment variables.
type Config struct {
	Provider string `json:"provider"` // "gemini" | "ollama" | "openai-compatible"
	Endpoint string `json:"endpoint"`
	Model    string `json:"model"`
	APIKey   string `json:"apiKey"`
}

// LLMProvider is the common interface for all LLM backends.
type LLMProvider interface {
	Generate(ctx context.Context, prompt string) (string, error)
	GenerateWithSystem(ctx context.Context, systemPrompt, userMessage string) (string, error)
}

// ProviderInfo describes a configured provider.
type ProviderInfo struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Configured bool   `json:"configured"`
}

// DefaultConfig carries the resolved server-side defaults.
type DefaultConfig struct {
	Provider string `json:"provider"`
	Endpoint string `json:"endpoint"`
	Model    string `json:"model"`
	HasKey   bool   `json:"hasKey"`
}

// New returns the appropriate LLMProvider for the given config.
func New(cfg Config) (LLMProvider, error) {
	p := strings.ToLower(strings.TrimSpace(cfg.Provider))
	if p == "" {
		p = strings.ToLower(strings.TrimSpace(os.Getenv("LLM_PROVIDER")))
	}
	if p == "" {
		return nil, fmt.Errorf("no LLM provider specified (set LLM_PROVIDER env var or choose one in panel options)")
	}

	switch p {
	case "gemini":
		return newGemini(cfg)
	case "ollama":
		return newOllamaCompat(cfg)
	case "openai-compatible":
		return newOpenAICompat(cfg)
	default:
		return nil, fmt.Errorf("unknown LLM provider: %q", p)
	}
}

// AvailableProviders returns which providers are configured from environment variables.
func AvailableProviders() []ProviderInfo {
	return []ProviderInfo{
		{ID: "gemini", Name: "Google Gemini", Configured: os.Getenv("GEMINI_API_KEY") != ""},
		{ID: "ollama", Name: "Ollama (local)", Configured: os.Getenv("OLLAMA_ENDPOINT") != "" || os.Getenv("OLLAMA_MODEL") != ""},
		{ID: "openai-compatible", Name: "OpenAI-compatible", Configured: os.Getenv("OPENAI_COMPAT_ENDPOINT") != ""},
	}
}

// ServerDefault returns the resolved server-side default LLM configuration.
func ServerDefault() DefaultConfig {
	p := strings.ToLower(strings.TrimSpace(os.Getenv("LLM_PROVIDER")))
	cfg := DefaultConfig{Provider: p}

	switch p {
	case "gemini":
		cfg.Model = envOrDefault("", "GEMINI_MODEL", "gemini-2.0-flash-exp")
		cfg.Endpoint = "Gemini API (cloud)"
		cfg.HasKey = os.Getenv("GEMINI_API_KEY") != ""
	case "ollama":
		cfg.Endpoint = envOrDefault("", "OLLAMA_ENDPOINT", "http://localhost:11434")
		cfg.Model = envOrDefault("", "OLLAMA_MODEL", "llama3.1")
	case "openai-compatible":
		cfg.Endpoint = envOrDefault("", "OPENAI_COMPAT_ENDPOINT", "https://api.openai.com/v1")
		cfg.Model = envOrDefault("", "OPENAI_COMPAT_MODEL", "gpt-4o")
		cfg.HasKey = os.Getenv("OPENAI_COMPAT_API_KEY") != ""
	}

	return cfg
}

// envOrDefault returns the override if non-empty, otherwise the env var, otherwise the fallback.
func envOrDefault(override, envKey, fallback string) string {
	if override != "" {
		return override
	}
	if v := os.Getenv(envKey); v != "" {
		return v
	}
	return fallback
}
