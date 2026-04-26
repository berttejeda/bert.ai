# Grafana AI Analysis — Panel Plugin Suite

![Grafana](https://img.shields.io/badge/Grafana-10.4%2B-orange)
![Go](https://img.shields.io/badge/Go-1.24%2B-blue)
![React](https://img.shields.io/badge/React-18-blue)
![License](https://img.shields.io/badge/license-Apache%202.0-green)

> A Grafana panel plugin that uses AI (Google Gemini, Ollama, or any OpenAI-compatible endpoint) to analyze panel query data and provide insights — no screenshots, just real data.

## Overview

This repository contains the **Panel AI Analysis** plugin (`bertai-panel-ai-analysis`). It operates on the actual DataFrames returned by panel queries, serializes them, and sends them alongside panel metadata and template variable context to an LLM for analysis.

### Key Features

- **Multi-LLM support** — Google Gemini, Ollama (local), or any OpenAI-compatible endpoint
- **Data-driven analysis** — Sends actual query results (DataFrames), not rendered images
- **Custom prompts** — Override the default analysis prompt per panel; persisted with dashboard save
- **Template variable awareness** — Includes both raw queries (`$variable` placeholders) and resolved values
- **Markdown rendering** — AI responses rendered with full Markdown support (tables, code, lists)
- **Server default provider** — Set `LLM_PROVIDER` env var; panels fall back to it unless overridden
- **Auto-analyze** — Optional toggle to re-run analysis automatically when panel data refreshes
- **Kubernetes-ready** — Includes `Dockerfile.dist` for init container deployment

### Planned: Financial Q&A Mode

A **Financial Q&A mode** is planned (see [`panel-ai-analysis/IMPLEMENTATION_PLAN_FINANCIAL_QA.md`](panel-ai-analysis/IMPLEMENTATION_PLAN_FINANCIAL_QA.md)) that will let users ask natural-language questions about stock market data. The backend will generate Flux queries, execute them against InfluxDB, and return AI-formatted answers — the same pipeline as the companion `ollama-financial-analyst` CLI, but embedded in Grafana.

## Quick Start

### Prerequisites

- Node.js >= 22
- Go >= 1.24
- Grafana >= 10.4.0
- At least one LLM provider configured (see below)

### Setup

```bash
cd panel-ai-analysis

# Install frontend dependencies
npm install

# Build frontend
npm run build

# Build backend (Linux example)
mage -v build:linux

# Copy .env.example and configure
cp .env.example .env

# Start Grafana with Docker
npm run server
```

### LLM Provider Configuration

Set environment variables in `.env` (or via systemd / Kubernetes):

**Google Gemini** (cloud):
```
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash-exp
```

**Ollama** (local):
```
LLM_PROVIDER=ollama
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

**OpenAI-compatible** (any endpoint):
```
LLM_PROVIDER=openai-compatible
OPENAI_COMPAT_ENDPOINT=https://api.openai.com/v1
OPENAI_COMPAT_API_KEY=your_key_here
OPENAI_COMPAT_MODEL=gpt-4o
```

Panel-level options can override these defaults per panel.

### Local Ollama with Docker

```bash
docker compose --profile local-llm up --build
```

This starts both Grafana and an Ollama container.

## Architecture

```
Frontend (React)                    Backend (Go)
┌─────────────────┐               ┌─────────────────┐
│ AnalysisPanel    │──POST ───────▶│ /analyze         │
│  - props.data    │  AnalyzeReq   │  - provider.New()│
│  - serialize()   │               │  - buildPrompt() │
│  - PromptEditor  │◀─── JSON ────│  - Generate()    │
│  - AnalysisResult│  {analysis}   └────────┬────────┘
└─────────────────┘                         │
                                  ┌─────────┼─────────┐
                                  ▼         ▼         ▼
                              Gemini    Ollama    OpenAI
```

### Frontend Components

| Component | Purpose |
|---|---|
| `AnalysisPanel.tsx` | Main panel — serializes data, calls `/analyze`, renders result |
| `AnalysisResult.tsx` | Markdown renderer for AI responses |
| `PromptEditor.tsx` | Editable prompt textarea with save-to-dashboard |

### Backend Packages

| Package / File | Purpose |
|---|---|
| `pkg/main.go` | Plugin entry point (`backend.Serve`) |
| `pkg/app.go` | App struct, health check, resource routing (`/analyze`, `/providers`) |
| `pkg/resources.go` | HTTP handlers, request/response types, JSON marshaling |
| `pkg/prompt.go` | Builds the full LLM prompt from panel config, variables, and query data |
| `pkg/provider/provider.go` | LLM provider interface, factory, env-var resolution, server default |
| `pkg/provider/gemini.go` | Google Gemini implementation |
| `pkg/provider/openai_compat.go` | OpenAI-compatible implementation (also used for Ollama) |

### Backend Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/resources/analyze` | POST | Analyze panel query data with AI |
| `/resources/providers` | GET | List configured providers and server default |

## Plugin ID

`bertai-panel-ai-analysis`

To allow loading as unsigned:
```ini
[plugins]
allow_loading_unsigned_plugins = bertai-panel-ai-analysis
```

Or via environment variable:
```
GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=bertai-panel-ai-analysis
```

## Kubernetes Deployment

A `Dockerfile.dist` is provided to build a lightweight image containing only the built plugin artifacts. Use it as an init container to copy the plugin into Grafana's plugin directory:

```bash
# Build the plugin first
npm run build && mage -v build:linux

# Build the dist image
docker build -f Dockerfile.dist -t your-registry/bertai-panel-ai-analysis:latest .
```

In your Helm values (e.g., kube-prometheus-stack):

```yaml
grafana:
  env:
    GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS: bertai-panel-ai-analysis
    LLM_PROVIDER: ollama
    OLLAMA_ENDPOINT: http://ollama.default.svc:11434
    OLLAMA_MODEL: llama3.1
  initContainers:
    - name: install-ai-panel
      image: your-registry/bertai-panel-ai-analysis:latest
      command: ['sh', '-c', 'cp -r /plugin/* /grafana-plugins/bertai-panel-ai-analysis/']
      volumeMounts:
        - name: ai-panel-plugin
          mountPath: /grafana-plugins/bertai-panel-ai-analysis
  extraVolumeMounts:
    - name: ai-panel-plugin
      mountPath: /var/lib/grafana/plugins/bertai-panel-ai-analysis
  extraVolumes:
    - name: ai-panel-plugin
      emptyDir: {}
```

## Development

```bash
cd panel-ai-analysis

# Frontend dev mode (watch)
npm run dev

# Backend rebuild
mage -v build:linux

# Run tests
npm run test:ci

# Lint
npm run lint
```

## Project Structure

```
panel-ai-analysis/
├── src/
│   ├── module.ts                  # Panel options (prompt, auto-analyze, LLM provider)
│   ├── plugin.json                # Plugin metadata
│   ├── types.ts                   # TypeScript types (LLMConfig, AnalyzeRequest, etc.)
│   ├── constants.ts               # Default prompt, plugin ID, sampling limits
│   ├── components/
│   │   ├── AnalysisPanel.tsx      # Main panel: data serialization + API call
│   │   ├── AnalysisResult.tsx     # Markdown rendering of AI response
│   │   └── PromptEditor.tsx       # Prompt editor with save-to-dashboard
│   ├── utils/
│   │   ├── dataSerializer.ts      # DataFrame → JSON serialization with sampling
│   │   └── panelConfig.ts         # Extract panel config, raw targets, template vars
│   └── img/
│       └── logo.svg
├── pkg/
│   ├── main.go                    # Plugin entry point
│   ├── app.go                     # App lifecycle, health check, route dispatch
│   ├── resources.go               # /analyze + /providers handlers
│   ├── prompt.go                  # Full prompt builder (config + variables + data)
│   └── provider/
│       ├── provider.go            # LLM interface, factory, server default
│       ├── gemini.go              # Google Gemini provider
│       └── openai_compat.go       # OpenAI-compatible provider (Ollama, OpenAI, etc.)
├── provisioning/                  # Grafana provisioning for local dev
├── .env.example                   # Environment variable template
├── Dockerfile.dist                # Lightweight image for K8s init container
├── docker-compose.yaml            # Local dev with Docker
├── go.mod / go.sum                # Go dependencies
├── package.json                   # Node dependencies + scripts
├── CHANGELOG.md
├── LICENSE                        # Apache 2.0
├── README.md
└── IMPLEMENTATION_PLAN_FINANCIAL_QA.md  # Planned Financial Q&A mode
```

## Security

- API keys stored as environment variables — never hardcoded
- `.env` files excluded from Git
- Backend validates all inputs before processing
- Panel-level API keys are optional overrides; server defaults are preferred

## Troubleshooting

### Plugin not loading
- Verify `allow_loading_unsigned_plugins` includes `bertai-panel-ai-analysis`
- Check Grafana logs: `sudo journalctl -u grafana-server -f`

### "No LLM provider configured" health check error
- Set `LLM_PROVIDER` env var to one of: `gemini`, `ollama`, `openai-compatible`
- Set the corresponding provider env vars (see LLM Provider Configuration above)

### Analysis returns empty or errors
- Ensure the panel has a configured datasource with query results
- Check backend logs for LLM provider errors
- Verify API keys and endpoints are correct

## Roadmap

- [x] Multi-LLM provider support (Gemini, Ollama, OpenAI-compatible)
- [x] Data-driven analysis (DataFrames, not screenshots)
- [x] Custom prompts with dashboard persistence
- [x] Template variable resolution
- [x] Server default provider via `LLM_PROVIDER` env var
- [x] Kubernetes init container deployment (`Dockerfile.dist`)
- [ ] Financial Q&A mode — natural-language queries against InfluxDB stock data
- [ ] Conversation history and follow-up questions
- [ ] Streaming LLM responses
- [ ] Scheduled / automated analysis

## License

Apache License 2.0 — see [LICENSE](panel-ai-analysis/LICENSE).

---

Built with [Grafana Plugin SDK](https://github.com/grafana/grafana-plugin-sdk-go) | Powered by Gemini, Ollama, and OpenAI
