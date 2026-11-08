# AI RAG Table — Grafana Panel Plugin

A Grafana panel plugin that combines an interactive table with
Retrieval-Augmented Generation (RAG) AI analysis.

## Features

- **Live column/row filtering** — multi-filter bar with AND/OR logic,
  operators (contains, =, ≠, >, >=, <, <=, regex), matching the
  interactive cost-model filtering pattern.
- **RAG AI analysis** — filtered rows become the LLM context.  The AI
  reasons only over the data the user can currently see, giving focused
  and relevant insights.
- **Multi-provider LLM support** — Google Gemini, Ollama (local), or
  any OpenAI-compatible endpoint (GPT-4o, Azure OpenAI, LM Studio, etc.).
- **Auto-analyze** — optionally re-runs analysis whenever data or
  filters change.
- **Configurable context window** — tune how many filtered rows are
  sent to the LLM.

## Quick Start

### 1. Copy environment variables

```bash
cp .env.example .env
# Edit .env and set at least one LLM provider
```

### 2. Bootstrap the Grafana plugin tooling

The `.config/` directory is managed by `@grafana/create-plugin`.
Run this once to generate it:

```bash
npx @grafana/create-plugin@latest bootstrap --force
npm install
```

### 3. Build the plugin

```bash
# Frontend
npm run build

# Backend (requires Go >= 1.21)
cd pkg && go mod tidy && cd ..
go build -o dist/gpx_bertai-panel-ai-rag-table ./pkg
```

### 4. Start Grafana

```bash
docker compose up
```

Grafana will be available at <http://localhost:3000>.

## Architecture

```
User drags filter sliders / adds filter rows
        ↓
FilterBar (React) → filterEngine.ts
        ↓  (filtered rows)
DataTable (rendered locally — no backend call)
        ↓  (user clicks "Analyze")
AnalysisPanel → POST /api/plugins/.../resources/rag-analyze
        ↓
Go backend (resources.go)
  ├── buildRAGPrompt()          ← filtered rows + schema + active filters
  └── rag.Analyze()             ← calls LLM provider
        ↓
LLM (Gemini / Ollama / OpenAI-compat)
        ↓
Markdown analysis rendered in AnalysisPanel
```

### RAG Technique

The plugin implements **in-context RAG** without a vector store:

1. **Retrieve** — the user's filter expressions narrow the full dataset
   to a relevant subset (e.g. "provider = openai AND cost > 1000").
2. **Augment** — the filtered rows, the full dataset schema, active
   filter conditions, and any Grafana template variables are embedded
   into a structured Markdown prompt.
3. **Generate** — the LLM reasons over only the relevant context,
   producing focused analysis instead of summarising thousands of rows.

## Panel Options

| Category | Option | Description |
|---|---|---|
| Filters | Show filter bar | Toggle the filter bar |
| Filters | Filter logic | AND / OR |
| AI Analysis | Show AI analysis panel | Toggle the analysis section |
| AI Analysis | Analysis panel height | Pixel height |
| AI Analysis | Analysis prompt | Custom prompt template |
| AI Analysis | Auto-analyze | Re-run on data/filter change |
| AI Analysis | RAG context rows | Max filtered rows in LLM context |
| LLM Provider | Provider | gemini / ollama / openai-compatible |
| LLM Provider | Endpoint URL | Leave blank for env default |
| LLM Provider | Model | Leave blank for env default |
| LLM Provider | API Key | Leave blank for env variable |

## Environment Variables

| Variable | Description |
|---|---|
| `LLM_PROVIDER` | `gemini`, `ollama`, or `openai-compatible` |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `GEMINI_MODEL` | Default: `gemini-2.0-flash-exp` |
| `OLLAMA_ENDPOINT` | Default: `http://localhost:11434` |
| `OLLAMA_MODEL` | Default: `llama3.1` |
| `OPENAI_COMPAT_ENDPOINT` | Base URL (e.g. `https://api.openai.com/v1`) |
| `OPENAI_COMPAT_API_KEY` | API key |
| `OPENAI_COMPAT_MODEL` | Model name (required) |
