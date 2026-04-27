package financial

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"text/template"

	"go.yaml.in/yaml/v2"
)

// FluxExample is a single few-shot example for Flux query generation.
type FluxExample struct {
	Question string `yaml:"question"`
	Query    string `yaml:"query"`
}

// PromptConfig holds all prompt templates loaded from prompts.yaml.
type PromptConfig struct {
	FluxSystemPrompt string        `yaml:"fluxSystemPrompt"`
	FluxExamples     []FluxExample `yaml:"fluxExamples"`
	FormatPrompt     string        `yaml:"formatSystemPrompt"`
}

// PromptTemplateData contains the variables available inside prompt templates.
type PromptTemplateData struct {
	Schema string
	Bucket string
}

// promptConfigSearchPaths returns the ordered list of directories to search
// for prompts.yaml, starting with an explicit env-var override.
func promptConfigSearchPaths() []string {
	var paths []string

	// 1. Explicit override
	if p := os.Getenv("PROMPTS_CONFIG_PATH"); p != "" {
		paths = append(paths, filepath.Dir(p))
	}

	// 2. Executable's directory (where Grafana unpacks the plugin)
	if exe, err := os.Executable(); err == nil {
		paths = append(paths, filepath.Dir(exe))
	}

	// 3. Current working directory
	if cwd, err := os.Getwd(); err == nil {
		paths = append(paths, cwd)
	}

	return paths
}

// LoadPromptConfig searches for prompts.yaml and loads it.
// Returns nil (no error) if the file is not found — callers should fall back to defaults.
func LoadPromptConfig() (*PromptConfig, error) {
	// If the env var points to a full file path, try that first
	if p := os.Getenv("PROMPTS_CONFIG_PATH"); p != "" {
		if _, err := os.Stat(p); err == nil {
			return loadFromFile(p)
		}
	}

	for _, dir := range promptConfigSearchPaths() {
		candidate := filepath.Join(dir, "prompts.yaml")
		if _, err := os.Stat(candidate); err == nil {
			return loadFromFile(candidate)
		}
	}

	return nil, nil // not found — use defaults
}

func loadFromFile(path string) (*PromptConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read prompts config %s: %w", path, err)
	}

	var cfg PromptConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse prompts config %s: %w", path, err)
	}

	return &cfg, nil
}

// RenderFluxSystemPrompt renders the Flux system prompt template with the given data.
func (pc *PromptConfig) RenderFluxSystemPrompt(data PromptTemplateData) (string, error) {
	rendered, err := renderTemplate("fluxSystem", pc.FluxSystemPrompt, data)
	if err != nil {
		return "", fmt.Errorf("failed to render flux system prompt: %w", err)
	}

	// Append examples
	if len(pc.FluxExamples) > 0 {
		rendered += "\n\n# Examples:\n"
		for _, ex := range pc.FluxExamples {
			exQuery, err := renderTemplate("fluxExample", ex.Query, data)
			if err != nil {
				return "", fmt.Errorf("failed to render example query: %w", err)
			}
			rendered += fmt.Sprintf("\nUser: %q\n```flux\n%s```\n", ex.Question, exQuery)
		}
	}

	return rendered, nil
}

// RenderFormatPrompt renders the format system prompt template.
func (pc *PromptConfig) RenderFormatPrompt() string {
	return pc.FormatPrompt
}

func renderTemplate(name, tmplStr string, data PromptTemplateData) (string, error) {
	tmpl, err := template.New(name).Parse(tmplStr)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}
