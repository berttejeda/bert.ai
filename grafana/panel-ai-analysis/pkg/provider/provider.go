package provider

import (
	"context"
	"fmt"
	"os"
	"strings"
)

// Config carries per-request provider settings.
// Values may come from panel options (preferred) or fall back to env vars.
type Config struct {
	Provider string `json:"provider"` // "gemini" | "ollama" | "openai-compatible"
	Endpoint string `json:"endpoint"` // API base URL (empty = env default)
	Model    string `json:"model"`    // Model name   (empty = env default)
	APIKey   string `json:"apiKey"`   // API key      (empty = env default; not needed for Ollama)
}

// LLMProvider generates a text completion given a prompt.
type LLMProvider interface {
	Generate(ctx context.Context, prompt string) (string, error)
	// GenerateWithSystem sends a system prompt + user message for chat-style APIs.
	GenerateWithSystem(ctx context.Context, systemPrompt, userMessage string) (string, error)
}

// ProviderInfo describes a provider and whether it is configured.
type ProviderInfo struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Configured bool   `json:"configured"`
}

// New returns the appropriate provider for the given config,
// resolving blank fields from environment variables.
func New(cfg Config) (LLMProvider, error) {
	provider := strings.ToLower(strings.TrimSpace(cfg.Provider))
	if provider == "" {
		provider = strings.ToLower(strings.TrimSpace(os.Getenv("LLM_PROVIDER")))
	}
	if provider == "" {
		return nil, fmt.Errorf("no LLM provider specified (set LLM_PROVIDER env var or select one in panel options)")
	}

	switch provider {
	case "gemini":
		return newGemini(cfg)
	case "ollama":
		return newOllamaCompat(cfg)
	case "openai-compatible":
		return newOpenAICompat(cfg)
	default:
		return nil, fmt.Errorf("unknown LLM provider: %q", provider)
	}
}

// AvailableProviders returns info about which providers are configured
// based on environment variables.
func AvailableProviders() []ProviderInfo {
	return []ProviderInfo{
		{
			ID:         "gemini",
			Name:       "Google Gemini",
			Configured: os.Getenv("GEMINI_API_KEY") != "",
		},
		{
			ID:         "ollama",
			Name:       "Ollama (local)",
			Configured: os.Getenv("OLLAMA_ENDPOINT") != "" || os.Getenv("OLLAMA_MODEL") != "",
		},
		{
			ID:         "openai-compatible",
			Name:       "OpenAI-compatible",
			Configured: os.Getenv("OPENAI_COMPAT_ENDPOINT") != "",
		},
	}
}

// DefaultConfig describes the server-side default LLM configuration from env vars.
type DefaultConfig struct {
	Provider string `json:"provider"`
	Endpoint string `json:"endpoint"`
	Model    string `json:"model"`
	HasKey   bool   `json:"hasKey"`
}

// ServerDefault returns the resolved default provider configuration from environment variables.
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

// envOrDefault returns the environment variable value if the override is empty.
func envOrDefault(override, envKey, fallback string) string {
	if override != "" {
		return override
	}
	if v := os.Getenv(envKey); v != "" {
		return v
	}
	return fallback
}
