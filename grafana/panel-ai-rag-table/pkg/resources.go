package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"bertai-panel-ai-rag-table/pkg/provider"
	"bertai-panel-ai-rag-table/pkg/rag"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// ---------- Request / response types ----------

type serializedField struct {
	Name   string            `json:"name"`
	Type   string            `json:"type"`
	Values []interface{}     `json:"values"`
	Labels map[string]string `json:"labels,omitempty"`
}

type serializedDataFrame struct {
	Name           string            `json:"name"`
	Fields         []serializedField `json:"fields"`
	Length         int               `json:"length"`
	Sampled        bool              `json:"sampled,omitempty"`
	OriginalLength int               `json:"originalLength,omitempty"`
}

type columnFilter struct {
	Column   string `json:"column"`
	Operator string `json:"operator"`
	Value    string `json:"value"`
}

type templateVariableInfo struct {
	Name    string `json:"name"`
	Label   string `json:"label,omitempty"`
	Current string `json:"current"`
	Type    string `json:"type"`
}

type ragAnalyzeRequest struct {
	QueryResults      []serializedDataFrame    `json:"queryResults"`
	FilteredRows      []map[string]interface{} `json:"filteredRows"`
	ActiveFilters     []columnFilter           `json:"activeFilters"`
	FilterLogic       string                   `json:"filterLogic"`
	Prompt            string                   `json:"prompt"`
	LLM               provider.Config          `json:"llm"`
	ResolvedVariables []templateVariableInfo   `json:"resolvedVariables"`
}

type ragAnalyzeResponse struct {
	Analysis          string `json:"analysis"`
	ContextRows       int    `json:"contextRows"`
	TotalFilteredRows int    `json:"totalFilteredRows"`
}

type errorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

type providersResponse struct {
	Providers     []provider.ProviderInfo `json:"providers"`
	ServerDefault provider.DefaultConfig  `json:"serverDefault"`
}

// ---------- Handler: RAG analyze ----------

func (a *App) handleRagAnalyze(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	if req.Method != http.MethodPost {
		return sendJSON(sender, http.StatusMethodNotAllowed, errorResponse{Error: "method_not_allowed", Message: "Only POST is accepted"})
	}

	var request ragAnalyzeRequest
	if err := json.Unmarshal(req.Body, &request); err != nil {
		a.logger.Error("Failed to unmarshal rag-analyze request", "error", err)
		return sendJSON(sender, http.StatusBadRequest, errorResponse{Error: "invalid_request", Message: fmt.Sprintf("Failed to parse request body: %v", err)})
	}

	if len(request.QueryResults) == 0 && len(request.FilteredRows) == 0 {
		return sendJSON(sender, http.StatusBadRequest, errorResponse{Error: "no_data", Message: "No query results provided."})
	}

	// Build the full RAG prompt
	prompt := buildRAGPrompt(request)

	// Resolve LLM provider
	llmProvider, err := provider.New(request.LLM)
	if err != nil {
		a.logger.Error("Failed to create LLM provider", "error", err)
		return sendJSON(sender, http.StatusBadRequest, errorResponse{Error: "provider_error", Message: fmt.Sprintf("Failed to initialize LLM provider: %v", err)})
	}

	// Run the RAG pipeline
	a.logger.Debug("Running RAG analysis", "filteredRows", len(request.FilteredRows), "provider", request.LLM.Provider)
	result, err := rag.Analyze(ctx, llmProvider, prompt)
	if err != nil {
		a.logger.Error("RAG analysis failed", "error", err)
		return sendJSON(sender, http.StatusInternalServerError, errorResponse{Error: "llm_error", Message: fmt.Sprintf("RAG analysis failed: %v", err)})
	}

	return sendJSON(sender, http.StatusOK, ragAnalyzeResponse{
		Analysis:          result,
		ContextRows:       len(request.FilteredRows),
		TotalFilteredRows: len(request.FilteredRows),
	})
}

// ---------- Prompt builder ----------

func buildRAGPrompt(req ragAnalyzeRequest) string {
	var sb strings.Builder

	// System / user prompt
	userPrompt := strings.TrimSpace(req.Prompt)
	if userPrompt == "" {
		userPrompt = defaultRAGPrompt
	}
	sb.WriteString(userPrompt)
	sb.WriteString("\n\n")

	// Active filters section
	if len(req.ActiveFilters) > 0 {
		sb.WriteString("## Active Filters\n")
		sb.WriteString(fmt.Sprintf("Logic: %s\n\n", req.FilterLogic))
		for _, f := range req.ActiveFilters {
			sb.WriteString(fmt.Sprintf("- Column `%s` %s `%s`\n", f.Column, f.Operator, f.Value))
		}
		sb.WriteString("\n")
	}

	// Template variables
	if len(req.ResolvedVariables) > 0 {
		sb.WriteString("## Dashboard Variables\n")
		for _, v := range req.ResolvedVariables {
			sb.WriteString(fmt.Sprintf("- $%s = %q\n", v.Name, v.Current))
		}
		sb.WriteString("\n")
	}

	// Full table schema (from all frames)
	if len(req.QueryResults) > 0 {
		sb.WriteString("## Full Dataset Schema\n")
		for _, frame := range req.QueryResults {
			sb.WriteString(fmt.Sprintf("Series: **%s** (%d total rows)\n", frame.Name, frame.Length))
			if len(frame.Fields) > 0 {
				cols := make([]string, len(frame.Fields))
				for i, f := range frame.Fields {
					cols[i] = fmt.Sprintf("%s (%s)", f.Name, f.Type)
				}
				sb.WriteString("Columns: " + strings.Join(cols, ", ") + "\n")
			}
		}
		sb.WriteString("\n")
	}

	// Filtered rows as a Markdown table (RAG context)
	if len(req.FilteredRows) > 0 {
		sb.WriteString(fmt.Sprintf("## Filtered Rows (%d rows in context)\n", len(req.FilteredRows)))
		sb.WriteString("These are the rows that match the active filters:\n\n")

		// Collect column order from first row
		firstRow := req.FilteredRows[0]
		columns := make([]string, 0, len(firstRow))
		for k := range firstRow {
			columns = append(columns, k)
		}

		// Table header
		sb.WriteString("| " + strings.Join(columns, " | ") + " |\n")
		sb.WriteString("|" + strings.Repeat("---|", len(columns)) + "\n")

		// Table rows
		for _, row := range req.FilteredRows {
			cells := make([]string, len(columns))
			for i, col := range columns {
				v := row[col]
				if v == nil {
					cells[i] = ""
				} else {
					cells[i] = fmt.Sprintf("%v", v)
				}
			}
			sb.WriteString("| " + strings.Join(cells, " | ") + " |\n")
		}
		sb.WriteString("\n")
	} else {
		sb.WriteString("## Filtered Rows\nNo rows matched the active filters.\n\n")
	}

	return sb.String()
}

const defaultRAGPrompt = `You are an expert data analyst reviewing a filtered Grafana table.

The table data below has been filtered by the user. Based on the visible rows:
1. Summarize what the filtered data shows
2. Identify key patterns, trends, or outliers
3. Note anything the filter criteria reveal about the dataset
4. Provide actionable insights

Be concise. Use bullet points for clarity.`

// ---------- JSON helper ----------

func sendJSON(sender backend.CallResourceResponseSender, status int, payload interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusInternalServerError,
			Body:   []byte(`{"error":"internal","message":"Failed to marshal response"}`),
		})
	}
	return sender.Send(&backend.CallResourceResponse{
		Status:  status,
		Headers: map[string][]string{"Content-Type": {"application/json"}},
		Body:    body,
	})
}
