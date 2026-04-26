package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

const defaultPrompt = `You are an expert data analyst reviewing Grafana panel data.

Given the panel configuration and query results below, provide:
1. A summary of what metrics/data are being displayed
2. Key trends or patterns in the data
3. Any anomalies or notable observations
4. Actionable insights or recommendations

Be concise but thorough. Use bullet points for clarity.`

// buildFullPrompt constructs the complete prompt sent to the LLM,
// combining user prompt + panel config + template variables + raw queries + query results.
func buildFullPrompt(req analyzeRequest) string {
	var sb strings.Builder

	// User prompt (or default)
	userPrompt := strings.TrimSpace(req.Prompt)
	if userPrompt == "" {
		userPrompt = defaultPrompt
	}
	sb.WriteString(userPrompt)
	sb.WriteString("\n\n")

	// Panel configuration
	sb.WriteString("## Panel Configuration\n")
	if panelJSON, err := json.MarshalIndent(req.PanelJSON, "", "  "); err == nil {
		sb.WriteString("```json\n")
		sb.Write(panelJSON)
		sb.WriteString("\n```\n\n")
	}

	// Template variables
	if len(req.ResolvedVariables) > 0 {
		sb.WriteString("## Template Variables\n")
		for _, v := range req.ResolvedVariables {
			sb.WriteString(fmt.Sprintf("- $%s = %q (type: %s)\n", v.Name, v.Current, v.Type))
		}
		sb.WriteString("\n")
	}

	// Raw query definitions
	if len(req.RawTargets) > 0 {
		sb.WriteString("## Raw Query Definitions\n")
		sb.WriteString("These are the original queries with template variable placeholders:\n\n")
		for i, target := range req.RawTargets {
			sb.WriteString(fmt.Sprintf("### Query %d\n", i+1))
			if targetJSON, err := json.MarshalIndent(target, "", "  "); err == nil {
				sb.WriteString("```json\n")
				sb.Write(targetJSON)
				sb.WriteString("\n```\n\n")
			}
		}
	}

	// Query results as Markdown tables
	sb.WriteString("## Query Results (Resolved Data)\n")
	sb.WriteString("The following tables contain the actual data returned after variable substitution:\n\n")

	for _, df := range req.QueryResults {
		sb.WriteString(fmt.Sprintf("### Series: %s\n", df.Name))

		if df.Sampled {
			sb.WriteString(fmt.Sprintf("_Note: Data sampled from %d to %d points._\n\n", df.OriginalLength, df.Length))
		}

		if len(df.Fields) == 0 {
			sb.WriteString("_(no fields)_\n\n")
			continue
		}

		// Table header
		headers := make([]string, len(df.Fields))
		for i, f := range df.Fields {
			headers[i] = f.Name
		}
		sb.WriteString("| " + strings.Join(headers, " | ") + " |\n")
		sb.WriteString("|" + strings.Repeat("---|", len(headers)) + "\n")

		// Table rows (up to the number of values in the first field)
		rowCount := 0
		if len(df.Fields) > 0 {
			rowCount = len(df.Fields[0].Values)
		}

		for row := 0; row < rowCount; row++ {
			cells := make([]string, len(df.Fields))
			for col, f := range df.Fields {
				if row < len(f.Values) {
					cells[col] = formatValue(f.Values[row])
				} else {
					cells[col] = ""
				}
			}
			sb.WriteString("| " + strings.Join(cells, " | ") + " |\n")
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

func formatValue(v interface{}) string {
	if v == nil {
		return "null"
	}
	switch val := v.(type) {
	case float64:
		if val == float64(int64(val)) {
			return fmt.Sprintf("%d", int64(val))
		}
		return fmt.Sprintf("%.4f", val)
	case string:
		return val
	case bool:
		if val {
			return "true"
		}
		return "false"
	default:
		return fmt.Sprintf("%v", val)
	}
}
