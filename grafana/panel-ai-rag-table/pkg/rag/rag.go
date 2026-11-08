// Package rag implements the Retrieval-Augmented Generation pipeline for the
// AI RAG Table panel plugin.
//
// The RAG approach here:
//  1. The frontend materialises and filters all Grafana DataFrames into rows.
//  2. The filtered rows (the "retrieved" context) plus the full dataset schema
//     are embedded into a structured prompt (built in resources.go).
//  3. That prompt is sent to the configured LLM for generation.
//
// This keeps the backend stateless — there is no vector store.  The relevance
// filtering is done client-side by the user's own filter expressions, which
// mirrors how the cost-model HTML uses live sliders/dropdowns to narrow data
// before presenting it.  The LLM then reasons over only the relevant subset.
package rag

import (
	"context"
	"fmt"

	"bertai-panel-ai-rag-table/pkg/provider"
)

// Analyze sends the pre-built RAG prompt to the LLM and returns the analysis.
func Analyze(ctx context.Context, llm provider.LLMProvider, prompt string) (string, error) {
	if llm == nil {
		return "", fmt.Errorf("no LLM provider available")
	}
	if prompt == "" {
		return "", fmt.Errorf("empty prompt")
	}
	return llm.Generate(ctx, prompt)
}
