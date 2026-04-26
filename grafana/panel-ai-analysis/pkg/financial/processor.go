package financial

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"bertai-panel-ai-analysis/pkg/influx"
	"bertai-panel-ai-analysis/pkg/provider"
)

// Processor implements the two-step LLM pipeline:
// question → Flux query → execute → format answer.
type Processor struct {
	influx      *influx.Client
	schemaCache *influx.SchemaCache
}

// AskResult contains the response from the Ask pipeline.
type AskResult struct {
	Answer    string `json:"answer"`
	FluxQuery string `json:"fluxQuery,omitempty"`
	RowCount  int    `json:"rowCount"`
	Error     string `json:"error,omitempty"`
}

// NewProcessor creates a Processor with the given InfluxDB client and schema cache.
func NewProcessor(client *influx.Client, cache *influx.SchemaCache) *Processor {
	return &Processor{
		influx:      client,
		schemaCache: cache,
	}
}

// Client returns the underlying InfluxDB client.
func (p *Processor) Client() *influx.Client {
	return p.influx
}

// Ask runs the full pipeline: question → LLM generates Flux → execute against InfluxDB → LLM formats results.
func (p *Processor) Ask(ctx context.Context, llm provider.LLMProvider, question string) (*AskResult, error) {
	// Step 1: Get schema
	schema, err := p.schemaCache.Get(ctx, p.influx)
	if err != nil {
		return nil, fmt.Errorf("failed to get InfluxDB schema: %w", err)
	}

	// Step 2: Build system prompt and generate Flux query
	systemPrompt := BuildFluxSystemPrompt(schema, p.influx.Bucket())
	userMessage := fmt.Sprintf("Convert this question to a Flux query: %s", question)

	fluxRaw, err := llm.GenerateWithSystem(ctx, systemPrompt, userMessage)
	if err != nil {
		return nil, fmt.Errorf("LLM failed to generate Flux query: %w", err)
	}

	fluxQuery := extractFlux(fluxRaw)
	if fluxQuery == "" {
		return &AskResult{
			Answer:    "The AI was unable to generate a valid Flux query for your question. Please try rephrasing.",
			FluxQuery: fluxRaw,
		}, nil
	}

	// Step 3: Execute Flux query against InfluxDB
	execCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	rows, err := p.influx.Execute(execCtx, fluxQuery)
	if err != nil {
		return &AskResult{
			Answer:    fmt.Sprintf("The generated Flux query failed to execute:\n\n```\n%s\n```\n\nError: %v\n\nTry rephrasing your question.", fluxQuery, err),
			FluxQuery: fluxQuery,
			Error:     err.Error(),
		}, nil
	}

	if len(rows) == 0 {
		return &AskResult{
			Answer:    "The query executed successfully but returned no results. The data may not be available for the requested time range or filters.",
			FluxQuery: fluxQuery,
			RowCount:  0,
		}, nil
	}

	// Step 4: Format results with LLM
	resultJSON := marshalRows(rows, 100, 20000)
	formatSystem := BuildFormatPrompt()
	formatUser := fmt.Sprintf("Original question: %s\n\nFlux query results (%d rows):\n%s", question, len(rows), resultJSON)

	answer, err := llm.GenerateWithSystem(ctx, formatSystem, formatUser)
	if err != nil {
		// If formatting fails, return raw data summary
		return &AskResult{
			Answer:    fmt.Sprintf("Query returned %d rows but AI formatting failed: %v\n\nRaw data (first few rows):\n```json\n%s\n```", len(rows), err, resultJSON),
			FluxQuery: fluxQuery,
			RowCount:  len(rows),
			Error:     err.Error(),
		}, nil
	}

	return &AskResult{
		Answer:    answer,
		FluxQuery: fluxQuery,
		RowCount:  len(rows),
	}, nil
}

// extractFlux pulls the Flux query out of LLM response (expects ```flux ... ``` fences).
func extractFlux(raw string) string {
	// Try fenced code block first
	re := regexp.MustCompile("(?s)```(?:flux)?\\s*\n?(.*?)```")
	matches := re.FindStringSubmatch(raw)
	if len(matches) >= 2 {
		return strings.TrimSpace(matches[1])
	}

	// Fallback: if the response looks like a valid Flux query (starts with "from(" or "import")
	trimmed := strings.TrimSpace(raw)
	if strings.HasPrefix(trimmed, "from(") || strings.HasPrefix(trimmed, "import") {
		return trimmed
	}

	return ""
}

// marshalRows serializes rows to JSON, truncating to stay within size limits.
func marshalRows(rows []map[string]interface{}, maxRows, maxChars int) string {
	if len(rows) > maxRows {
		rows = rows[:maxRows]
	}

	data, err := json.MarshalIndent(rows, "", "  ")
	if err != nil {
		return fmt.Sprintf("[error marshaling %d rows: %v]", len(rows), err)
	}

	s := string(data)
	if len(s) > maxChars {
		// Truncate and re-marshal with fewer rows
		half := len(rows) / 2
		if half < 1 {
			half = 1
		}
		data, _ = json.MarshalIndent(rows[:half], "", "  ")
		s = string(data)
		s += fmt.Sprintf("\n... truncated (%d of %d rows shown)", half, len(rows))
	}

	return s
}
