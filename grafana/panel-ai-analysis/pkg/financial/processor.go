package financial

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"bertai-panel-ai-analysis/pkg/influx"
	"bertai-panel-ai-analysis/pkg/provider"
)

// Processor implements the two-step LLM pipeline:
// question → Flux query → execute → format answer.
type Processor struct {
	influx      *influx.Client
	schemaCache *influx.SchemaCache
	promptCfg   *PromptConfig
}

// AskResult contains the response from the Ask pipeline.
type AskResult struct {
	Answer    string `json:"answer"`
	FluxQuery string `json:"fluxQuery,omitempty"`
	RowCount  int    `json:"rowCount"`
	Error     string `json:"error,omitempty"`
}

// NewProcessor creates a Processor with the given InfluxDB client, schema cache,
// and optional prompt configuration (nil falls back to compiled-in defaults).
func NewProcessor(client *influx.Client, cache *influx.SchemaCache, promptCfg *PromptConfig) *Processor {
	return &Processor{
		influx:      client,
		schemaCache: cache,
		promptCfg:   promptCfg,
	}
}

// Client returns the underlying InfluxDB client.
func (p *Processor) Client() *influx.Client {
	return p.influx
}

// maxRetries is the number of times the LLM can retry a failed Flux query
// by receiving the error feedback and generating a corrected query.
const maxRetries = 2

// Ask runs the full pipeline: question → LLM generates Flux → execute against InfluxDB → LLM formats results.
// If the generated query fails, the error is fed back to the LLM for up to maxRetries correction attempts.
// dashboardContext is an optional text block describing the dashboard's panels and queries.
func (p *Processor) Ask(ctx context.Context, llm provider.LLMProvider, question string, dashboardContext string) (*AskResult, error) {
	// Step 1: Get schema
	schema, err := p.schemaCache.Get(ctx, p.influx)
	if err != nil {
		return nil, fmt.Errorf("failed to get InfluxDB schema: %w", err)
	}

	// Step 2: Build system prompt and generate Flux query
	systemPrompt := BuildFluxSystemPrompt(schema, p.influx.Bucket(), p.promptCfg)

	// Append dashboard context if provided
	if dashboardContext != "" {
		systemPrompt += "\n\n" + dashboardContext +
			"\n\nUse the dashboard context above to understand what data is being tracked " +
			"and what metrics matter to the user. Tailor your Flux queries and answers accordingly."
	}

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

	// Step 3: Execute Flux query against InfluxDB, with retry on failure
	var rows []map[string]interface{}
	var lastErr error

	for attempt := 0; attempt <= maxRetries; attempt++ {
		execCtx, cancel := context.WithTimeout(ctx, p.influx.Timeout())
		rows, lastErr = p.influx.Execute(execCtx, fluxQuery)
		cancel()

		if lastErr == nil {
			break
		}

		// If we have retries left, ask the LLM to fix the query
		if attempt < maxRetries {
			retryMsg := fmt.Sprintf(
				"The following Flux query failed with an error. Fix the query and return ONLY the corrected Flux query in ```flux code fences.\n\n"+
					"Failed query:\n```flux\n%s\n```\n\nError: %s\n\n"+
					"Original question: %s",
				fluxQuery, lastErr.Error(), question,
			)

			fixedRaw, retryErr := llm.GenerateWithSystem(ctx, systemPrompt, retryMsg)
			if retryErr != nil {
				break // LLM call failed, stop retrying
			}

			fixedQuery := extractFlux(fixedRaw)
			if fixedQuery == "" || fixedQuery == fluxQuery {
				break // LLM couldn't produce a different query
			}

			fluxQuery = fixedQuery
		}
	}

	if lastErr != nil {
		return &AskResult{
			Answer:    fmt.Sprintf("The generated Flux query failed to execute after %d attempts:\n\n```\n%s\n```\n\nError: %v\n\nTry rephrasing your question.", maxRetries+1, fluxQuery, lastErr),
			FluxQuery: fluxQuery,
			Error:     lastErr.Error(),
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
	formatSystem := BuildFormatPrompt(p.promptCfg)
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
	var query string

	// Try fenced code block first
	re := regexp.MustCompile("(?s)```(?:flux)?\\s*\n?(.*?)```")
	matches := re.FindStringSubmatch(raw)
	if len(matches) >= 2 {
		query = strings.TrimSpace(matches[1])
	} else {
		// Fallback: if the response looks like a valid Flux query (starts with "from(" or "import")
		trimmed := strings.TrimSpace(raw)
		if strings.HasPrefix(trimmed, "from(") || strings.HasPrefix(trimmed, "import") {
			query = trimmed
		}
	}

	if query == "" {
		return ""
	}

	// Sanitize: convert # comments (invalid Flux) to // comments
	query = sanitizeHashComments(query)

	return query
}

// sanitizeHashComments converts lines with # comments to // comments.
// Flux only supports // for comments; LLMs sometimes emit # (Python-style).
func sanitizeHashComments(flux string) string {
	lines := strings.Split(flux, "\n")
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		// Full-line # comment
		if strings.HasPrefix(trimmed, "#") {
			indent := line[:len(line)-len(strings.TrimLeft(line, " \t"))]
			lines[i] = indent + "//" + trimmed[1:]
			continue
		}
		// Inline # comment after code — only if # is not inside a string literal
		if idx := findInlineHash(line); idx >= 0 {
			lines[i] = line[:idx] + "//" + line[idx+1:]
		}
	}
	return strings.Join(lines, "\n")
}

// findInlineHash returns the index of a trailing # comment on a code line,
// or -1 if not found. It skips # characters inside string literals.
func findInlineHash(line string) int {
	inString := false
	var strChar byte
	for i := 0; i < len(line); i++ {
		ch := line[i]
		if inString {
			if ch == '\\' && i+1 < len(line) {
				i++ // skip escaped char
				continue
			}
			if ch == strChar {
				inString = false
			}
			continue
		}
		if ch == '"' || ch == '\'' {
			inString = true
			strChar = ch
			continue
		}
		// Found # outside a string — likely an inline comment
		if ch == '#' {
			// Only treat as comment if preceded by whitespace (not a valid operator position)
			if i > 0 && (line[i-1] == ' ' || line[i-1] == '\t' || line[i-1] == ')') {
				return i
			}
		}
	}
	return -1
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
