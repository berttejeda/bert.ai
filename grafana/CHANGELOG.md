# Changelog

## 1.1.0 (Unreleased)

### Planned
- Financial Q&A mode — natural-language questions against InfluxDB stock data via `/ask` endpoint
- Chat-style UI with conversation history, suggested questions, and Flux query toggle
- Backend InfluxDB client with schema discovery and caching
- Two-step LLM pipeline: question → Flux query → execute → AI-formatted answer

## 1.0.0

### Features
- **Multi-LLM provider support**: Google Gemini, Ollama (local), and any OpenAI-compatible endpoint
- **Data-driven analysis**: Operates on actual panel query results (DataFrames), not rendered images
- **Panel query data serialization** with intelligent sampling for large datasets
- **Custom prompt editor** with dashboard persistence (saved on dashboard save)
- **Template variable resolution**: Raw query targets (`$variable` placeholders) and resolved values included in LLM context
- **Markdown rendering** of AI analysis results (tables, code blocks, lists)
- **Server default provider**: `LLM_PROVIDER` env var fallback when no provider is selected in panel options
- **`/providers` endpoint**: Returns configured providers and server default config to the frontend
- **Auto-analyze toggle**: Optionally re-run analysis when panel data refreshes (debounced)
- **Health check**: Verifies at least one LLM provider is configured via environment variables

### Backend
- Go backend using Grafana Plugin SDK (`backend.Serve`)
- `pkg/app.go` — App lifecycle, health check, resource routing (`/analyze`, `/providers`)
- `pkg/resources.go` — HTTP handlers with request validation and JSON error responses
- `pkg/prompt.go` — Full prompt builder combining user prompt, panel config, template variables, raw queries, and query results as Markdown tables
- `pkg/provider/provider.go` — LLM provider interface, factory with env-var resolution, `ServerDefault()` for frontend display
- `pkg/provider/gemini.go` — Google Gemini implementation
- `pkg/provider/openai_compat.go` — OpenAI-compatible implementation (also used for Ollama via `/v1/chat/completions`)

### Frontend
- `AnalysisPanel.tsx` — Main panel component: data serialization, API call, server default status banner
- `AnalysisResult.tsx` — Markdown rendering of AI responses
- `PromptEditor.tsx` — Editable prompt textarea with save-to-dashboard
- `module.ts` — Panel options: prompt, auto-analyze toggle, LLM provider selector (with "Server default" option), endpoint, model, API key
- `dataSerializer.ts` — DataFrame → JSON serialization with head/tail sampling for large datasets
- `panelConfig.ts` — Extract panel config, raw targets, and template variables from Grafana runtime

### Deployment
- `Dockerfile.dist` — Lightweight busybox image for Kubernetes init container deployment
- Helm values example for kube-prometheus-stack with init container, volume mounts, and env vars
- `.env.example` with all supported environment variables
- `docker-compose.yaml` for local development
