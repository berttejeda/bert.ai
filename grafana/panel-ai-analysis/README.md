# Grafana Panel AI Analysis

A Grafana **panel plugin** that analyzes panel query data using AI. It supports two modes:

- **Analyze mode**: Sends actual query results and panel metadata to an LLM for analysis
- **Ask mode**: Chat-style financial Q&A — the LLM generates Flux queries, executes them against InfluxDB, and formats the results

## Features

- **Multi-LLM support**: Google Gemini, Ollama (local), or any OpenAI-compatible endpoint
- **Analyze mode**: Data-driven analysis of existing panel query results (DataFrames)
- **Ask mode**: Natural-language financial Q&A with automatic Flux query generation
- **InfluxDB schema awareness**: Auto-discovers measurements, tags, and fields for accurate queries
- **Custom prompts**: Override the default analysis prompt; persisted with dashboard save
- **Template variable awareness**: Includes both raw queries ($variable placeholders) and resolved values
- **Dashboard context awareness**: Ask mode automatically reads all panels and queries from the current dashboard, giving the LLM full understanding of the dashboard's intent
- **Chat UI**: Suggested questions, conversation history, copy/show-query support
- **Markdown rendering**: AI responses rendered with full Markdown support (tables, code, lists)
- **Externalized prompts**: All LLM prompts loaded from `prompts.yaml` — tune without recompiling
- **Query retry with error feedback**: Failed Flux queries are automatically fed back to the LLM for self-correction (up to 2 retries)
- **Configurable InfluxDB timeout**: Adjustable via environment variable or panel option
- **`--version` flag**: Backend binary reports its version at the command line

## Quick Start

### Prerequisites

- Node.js >= 22
- Go >= 1.24
- Grafana >= 10.4.0
- At least one LLM provider configured (see below)

### Setup

```bash
# Install frontend dependencies
npm install

# Build frontend
npm run build

# Build backend (all platforms)
mage -v build:linux

# Copy .env.example and configure
cp .env.example .env

# Start Grafana with Docker
npm run server
```

### LLM Provider Configuration

Set environment variables in `.env`:

**Google Gemini** (cloud):
```
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash-exp
```

**Ollama** (local):
```
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

**OpenAI-compatible** (any endpoint):
```
OPENAI_COMPAT_ENDPOINT=https://api.openai.com/v1
OPENAI_COMPAT_API_KEY=your_key_here
OPENAI_COMPAT_MODEL=gpt-4o
```

Panel-level options can override these defaults per panel.

### InfluxDB Configuration (Ask mode)

Required only if you want to use the **Ask (Financial Q&A)** mode:

```
INFLUXDB_HOST=http://localhost:8086
INFLUXDB_TOKEN=your_influxdb_token_here
INFLUXDB_ORG=your_org
INFLUXDB_BUCKET=stocks
```

These can also be overridden per-panel in the panel options under **InfluxDB (Ask mode)**.

#### InfluxDB Timeout

The HTTP client and query execution timeout defaults to **60 seconds**. Override via:

```
INFLUXDB_TIMEOUT=120
```

Or set it per-panel in the panel options (range: 5–600 seconds). Panel option takes priority over the environment variable.

### Prompt Configuration

All LLM prompts and few-shot examples are stored in `prompts.yaml`. The file is searched for at startup in this order:

1. Path specified by `PROMPTS_CONFIG_PATH` environment variable
2. The plugin executable's directory (where Grafana unpacks the plugin)
3. The current working directory

If `prompts.yaml` is not found, compiled-in defaults are used.

The YAML supports Go `text/template` variables:
- `{{.Schema}}` — the auto-discovered InfluxDB schema
- `{{.Bucket}}` — the configured bucket name

Edit `prompts.yaml` and restart Grafana to apply changes — no recompile needed.

### Local Ollama with Docker

```bash
docker compose --profile local-llm up --build
```

This starts both Grafana and an Ollama container.

## Development

```bash
# Frontend dev mode (watch)
npm run dev

# Backend rebuild
mage -v build:linux

# Run tests
npm run test:ci

# Lint
npm run lint
```

### Version Management

The backend binary version is read from `package.json` at build time and injected via `-ldflags`. Keep `package.json` and `src/plugin.json` versions in sync.

```bash
# Check the compiled version
./dist/gpx_bertai-panel-ai-analysis_linux_amd64 --version
```

## Architecture

```
Frontend (React)                    Backend (Go)

Analyze mode:
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

Ask mode:
┌─────────────────┐               ┌─────────────────┐
│ ChatPanel        │──POST ───────▶│ /ask             │
│  - fetchDashboard│  AskReq +     │  1. schema cache │
│    Context()     │  dashboard    │  2. LLM → Flux   │
│  - SuggestedQ's  │  context      │  3. InfluxDB exec │
│  - ChatMessage   │◀─── JSON ────│  4. LLM → format  │
│  - input box     │  {answer,     │                   │
│                  │   fluxQuery}  └────────┬────────┘
└─────────────────┘                  InfluxDB + LLM
```

### API Endpoints

| Method | Path              | Description                            |
|--------|-------------------|----------------------------------------|
| POST   | `/analyze`        | Analyze mode — panel data analysis     |
| POST   | `/ask`            | Ask mode — financial Q&A pipeline      |
| GET    | `/providers`      | List configured LLM providers          |
| GET    | `/schema`         | Debug — show discovered InfluxDB schema|
| POST   | `/schema/refresh` | Invalidate cached schema               |

## Dashboard Context Awareness (Ask mode)

When running in **Ask mode**, the plugin automatically fetches the full dashboard model from Grafana's API on every panel mount. This gives the LLM complete awareness of:

- The **dashboard title and description**
- Every **panel's title and visualization type** (stat, timeseries, table, etc.)
- The **Flux queries** each panel uses, including which measurements, fields, and filters are in play

This context is appended to the LLM's system prompt so it understands what the dashboard is monitoring and can tailor its answers accordingly.

### How it works

1. `ChatPanel` mounts and calls `fetchDashboardContext()`, which extracts the dashboard UID from the current URL
2. The utility fetches `/api/dashboards/uid/:uid` via Grafana's backend service
3. All panels (including those inside collapsed rows) are flattened and their queries extracted
4. The compact summary is sent with every `/ask` request as `dashboardContext`
5. The backend formats it into a concise text block and appends it to the LLM's system prompt

### Notes

- The dashboard is fetched **live** — any recently saved changes to panels or queries will be reflected immediately
- **Unsaved** dashboard edits are not included; you must save the dashboard first
- The context is supplementary — if the API call fails (e.g., permissions), the plugin continues without it
- Query text is compacted to ~200 characters per query to stay within token limits

## Query Retry & Self-Correction

When Ask mode generates a Flux query that fails execution (e.g., schema collisions, syntax errors), the pipeline automatically:

1. Sends the **failed query + InfluxDB error message** back to the LLM
2. The LLM generates a corrected query
3. The corrected query is executed (up to **2 retries**, 3 total attempts)
4. Stops early if the LLM produces an identical query or the LLM call itself fails

Additionally, the system prompt includes a **Common Pitfalls** section that warns the LLM about frequent Flux mistakes (mixing field types, incorrect join patterns, `#` vs `//` comments).

LLM-generated `#` comments (invalid Flux syntax) are automatically sanitized to `//` comments before execution.

## Plugin ID

`bertai-panel-ai-analysis`

To allow loading as unsigned:
```ini
[plugins]
allow_loading_unsigned_plugins = bertai-panel-ai-analysis
```
