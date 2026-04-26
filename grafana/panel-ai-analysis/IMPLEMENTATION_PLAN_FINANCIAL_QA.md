# Financial Q&A Mode — Implementation Plan

## Overview

Extend the existing `panel-ai-analysis` plugin with a **Financial Q&A mode** that lets users ask natural-language questions about their stock market data directly from a Grafana panel. The backend generates Flux queries, executes them against InfluxDB, and returns AI-formatted answers — the same pipeline as `ollama-financial-analyst`, but embedded in Grafana.

### How it differs from the existing "Analyze" mode

| | Analyze (existing) | Ask (new) |
|---|---|---|
| **Input** | Panel's `props.data` (pre-fetched DataFrames) | Free-form natural-language question |
| **Data source** | Frontend sends data to backend | Backend queries InfluxDB directly |
| **LLM calls** | 1 (analyze data) | 2 (generate Flux + format results) |
| **InfluxDB access** | None (backend is data-agnostic) | Backend needs InfluxDB credentials |
| **UI** | "Analyze" button | Chat-style text input + conversation history |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Grafana Dashboard                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │      Panel AI Analysis Plugin (React Frontend)                 │  │
│  │                                                                │  │
│  │  Mode toggle: [ Analyze | Ask ]                                │  │
│  │                                                                │  │
│  │  ┌─ Analyze mode (existing) ─────────────────────────────┐    │  │
│  │  │ Reads props.data → POST /resources/analyze             │    │  │
│  │  └────────────────────────────────────────────────────────┘    │  │
│  │                                                                │  │
│  │  ┌─ Ask mode (new) ──────────────────────────────────────┐    │  │
│  │  │ User types question → POST /resources/ask              │    │  │
│  │  │ Displays AI answer (markdown) + generated Flux query   │    │  │
│  │  │ Conversation history within session                    │    │  │
│  │  └────────────────────────────────────────────────────────┘    │  │
│  └───────────────────────────┬────────────────────────────────────┘  │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
                               ▼
               ┌───────────────────────────────┐
               │   Backend (Go)                │
               │  /resources/ask handler:      │
               │                               │
               │  1. Load InfluxDB schema      │
               │  2. Build Flux system prompt   │
               │  3. LLM → generate Flux query │
               │  4. Execute Flux vs InfluxDB   │
               │  5. LLM → format results      │
               │  6. Return answer + query      │
               └───────────────┬───────────────┘
                               │
                     ┌─────────┼─────────┐
                     ▼         ▼         ▼
         ┌──────────────┐ ┌────────┐ ┌────────────────┐
         │ Google Gemini│ │ Ollama │ │ OpenAI-compat  │
         └──────────────┘ └────────┘ └────────────────┘
                               │
                     ┌─────────┴─────────┐
                     ▼                   ▼
              ┌────────────┐     ┌──────────────┐
              │  InfluxDB   │     │ AI-formatted │
              │  (Flux)     │     │ markdown     │
              └────────────┘     └──────────────┘
```

---

## What we're porting from `ollama-financial-analyst`

The Python CLI has a clean three-step pipeline we'll replicate in Go:

| Python module | Go equivalent | Purpose |
|---|---|---|
| `lib/influx_query.py` → `InfluxQuerier` | `pkg/influx/client.go` | Connect to InfluxDB, execute Flux, return rows |
| `lib/influx_query.py` → `get_schema_description()` | `pkg/influx/schema.go` | Discover measurements, tags, fields |
| `lib/query_processor.py` → `QueryProcessor` | `pkg/financial/processor.go` | Question → Flux → execute → format pipeline |
| `lib/query_processor.py` → `_build_flux_system_prompt()` | `pkg/financial/prompts.go` | Financial-domain system prompt with schema |
| `lib/ollama_client.py` | Already exists: `pkg/provider/` | LLM provider abstraction (Gemini, Ollama, OpenAI) |

---

## Data available in InfluxDB

Based on the `bert.finance/exporter` pipeline and EODHD plugin, the following measurements exist:

### Core (from `exporter`)
- **`stock_data`** — Latest snapshot: current_price, market_cap, pe_ratio, rsi, macd, piotroski_score, fscore, ma_50/100/150/200, iv, bollinger, etc. Tags: ticker, industry, bollinger_signal
- **`price_history`** — Daily close + indicator series: close, ma_50, ma_100, ma_150, ma_200, rsi, macd, macd_signal, macd_histogram, vroc. Tags: ticker
- **`price_intraday`** — 1-minute OHLCV bars. Tags: ticker

### EODHD Plugin
- **`eodhd_fundamentals`** — Snapshot: market_cap, pe_ratio, eps, dividend_yield, profit_margin, beta, analyst ratings, short interest, etc. Tags: ticker, exchange, sector, industry, type
- **`eodhd_financials`** — Quarterly/annual statements: totalRevenue, ebitda, netIncome, etc. Tags: ticker, period, statement
- **`eodhd_earnings`** — EPS actual vs estimate, surprise %. Tags: ticker

### Example questions the plugin should handle

From the README:
- "Which stocks currently have RSI below 30 (oversold)?"
- "Show me trailing P/E, forward P/E, P/B, P/S, and PEG ratio for all stocks in a table"
- "Which stocks have the highest analyst target price upside vs current price?"
- "Find stocks with Piotroski score >= 7, RSI < 50, and positive quarterly earnings growth"
- "Show me the EPS actual vs estimate history for NVDA"

---

## Phase 1: Backend — InfluxDB Client

### 1.1 New package: `pkg/influx/client.go`

Port `InfluxQuerier` from Python to Go. Use the official `github.com/influxdata/influxdb-client-go/v2` SDK.

```go
package influx

type Client struct {
    client influxdb2.Client
    org    string
    bucket string
}

// New creates a client from InfluxDB config.
func New(url, token, org, bucket string) (*Client, error)

// Execute runs a Flux query and returns rows as []map[string]interface{}.
func (c *Client) Execute(ctx context.Context, flux string) ([]map[string]interface{}, error)

// Close releases resources.
func (c *Client) Close()
```

- Environment variables: `INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_ORG`, `INFLUXDB_BUCKET`
- Panel-level overrides via `AskRequest.influxdb` (optional)

### 1.2 Schema discovery: `pkg/influx/schema.go`

Port `get_schema_description()` from Python. Discover measurements, tag keys, and field keys using the `influxdata/influxdb/schema` package functions.

```go
// GetSchema returns a text description of the bucket's measurements, tags, and fields.
func (c *Client) GetSchema(ctx context.Context) (string, error)
```

- Cache the schema in memory with a configurable TTL (default 5 minutes) to avoid repeated introspection queries.
- Fallback to hardcoded schema if introspection fails (same as the Python implementation).

---

## Phase 2: Backend — Financial Q&A Pipeline

### 2.1 Prompts: `pkg/financial/prompts.go`

Port `_build_flux_system_prompt()` from `query_processor.py`. The system prompt tells the LLM:
- The InfluxDB schema (dynamically discovered)
- The bucket name
- Key measurement descriptions and their purpose
- Flux query conventions and constraints
- Example question → Flux pairs

Two prompts needed:

**Flux generation prompt** (step 1):
```
You are an expert at writing InfluxDB Flux queries for financial data analysis.

# InfluxDB Schema
{dynamic schema from introspection}

The bucket name is "{bucket}".

# Key measurements and their purpose:
- **stock_data**: Latest snapshot per ticker — current_price, market_cap, pe_ratio, rsi, ...
- **price_history**: Daily close prices with indicator time series — close, ma_50, ...
- **price_intraday**: 1-minute OHLCV bars — close, open, high, low, volume
- **eodhd_fundamentals**: Fundamental data — trailing_pe, forward_pe, profit_margin, beta, ...
- **eodhd_financials**: Quarterly/annual financial statements
- **eodhd_earnings**: Earnings history — epsActual, epsEstimate, ...

# Flux query conventions:
- Always start with `from(bucket: "{bucket}")`
- Use `|> range(start: ...)` — default to `-30d`
- Use `|> group(columns: ["ticker", "_field"]) |> last()` for latest snapshot data
- Use `|> pivot(...)` for wide format comparisons
- Use `|> limit(n: 25)` as default row limit, max 100

# CONSTRAINTS:
- Respond ONLY with the Flux query, wrapped in ```flux ... ``` code fences
- The query must be valid Flux syntax

# Examples:
[... curated examples covering stock_data, price_history, eodhd_fundamentals, eodhd_earnings, multi-measurement joins ...]
```

**Result formatting prompt** (step 2):
```
You are a financial analyst assistant. Format and summarize the following
Flux query results in markdown.

Include:
- A brief summary of the findings
- A markdown table with the key data (max ~25 rows)
- Any relevant insights or patterns

Keep the response concise and focused on answering the user's question.
Do not include the raw Flux query unless the user asks for it.
```

### 2.2 Processor: `pkg/financial/processor.go`

Port `QueryProcessor.process()` — the three-step pipeline:

```go
package financial

type Processor struct {
    influx      *influx.Client
    schemaCache string
    schemaTTL   time.Duration
    bucket      string
}

type AskResult struct {
    Answer    string `json:"answer"`
    FluxQuery string `json:"fluxQuery"`
    RowCount  int    `json:"rowCount"`
}

// Ask runs the full pipeline: question → Flux → execute → format.
func (p *Processor) Ask(ctx context.Context, llm provider.LLMProvider, question string) (*AskResult, error) {
    // 1. Get/refresh schema
    schema := p.getSchema(ctx)

    // 2. Build system prompt with schema
    systemPrompt := buildFluxSystemPrompt(schema, p.bucket)

    // 3. LLM call #1: generate Flux query
    fluxRaw := llm.Generate(ctx, systemPrompt + "\n\nConvert this question to a Flux query: " + question)
    fluxQuery := extractFlux(fluxRaw)

    // 4. Execute Flux query against InfluxDB
    rows, err := p.influx.Execute(ctx, fluxQuery)

    // 5. LLM call #2: format results
    resultJSON := marshalRows(rows, maxRows=100, maxChars=20000)
    formatPrompt := buildFormatPrompt()
    answer := llm.Generate(ctx, formatPrompt + "\n\nOriginal question: " + question + "\n\nResults:\n" + resultJSON)

    return &AskResult{Answer: answer, FluxQuery: fluxQuery, RowCount: len(rows)}, nil
}
```

Error handling mirrors the Python version:
- If Flux execution fails → return the generated query + error message
- If no results → return the generated query + "no data" message
- Truncate large result sets to stay within LLM context limits

### 2.3 Update `pkg/provider/provider.go`

The `LLMProvider.Generate()` interface currently takes a single prompt. For the Q&A pipeline, we need **system + user message separation** to match how the Python `OllamaClient.send()` works:

```go
// GenerateWithSystem sends a system prompt + user message (for chat-style APIs).
// Falls back to concatenation for APIs that don't support system messages.
GenerateWithSystem(ctx context.Context, systemPrompt, userMessage string) (string, error)
```

Add this method to `openai_compat.go` and `gemini.go`. For `openai_compat.go`, this maps directly to the `messages` array with `role: "system"` and `role: "user"`.

---

## Phase 3: Backend — New `/ask` Endpoint

### 3.1 Request/Response types in `pkg/resources.go`

```go
type askRequest struct {
    Question string          `json:"question"`
    LLM      provider.Config `json:"llm"`
    InfluxDB *influxConfig   `json:"influxdb,omitempty"` // optional per-panel override
}

type influxConfig struct {
    URL    string `json:"url"`
    Token  string `json:"token"`
    Org    string `json:"org"`
    Bucket string `json:"bucket"`
}

type askResponse struct {
    Answer    string `json:"answer"`
    FluxQuery string `json:"fluxQuery,omitempty"`
    RowCount  int    `json:"rowCount"`
    Error     string `json:"error,omitempty"`
}
```

### 3.2 Handler: `handleAsk()`

```go
func (a *App) handleAsk(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
    // 1. Parse request
    // 2. Resolve InfluxDB config (request override > env vars)
    // 3. Create or reuse InfluxDB client (cache per unique config)
    // 4. Create LLM provider
    // 5. Run financial.Processor.Ask()
    // 6. Return askResponse
}
```

### 3.3 Route registration in `app.go`

```go
func (a *App) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
    switch req.Path {
    case "analyze":
        return a.handleAnalyze(ctx, req, sender)
    case "ask":                                    // NEW
        return a.handleAsk(ctx, req, sender)
    case "providers":
        return a.handleListProviders(ctx, req, sender)
    case "schema":                                 // NEW — debug endpoint
        return a.handleGetSchema(ctx, req, sender)
    default:
        return sender.Send(&backend.CallResourceResponse{Status: http.StatusNotFound})
    }
}
```

### 3.4 InfluxDB client lifecycle

- The `App` struct holds a cached `*influx.Client` initialized lazily on first `/ask` request.
- If the `askRequest` includes `influxdb` overrides, create a separate client for that request.
- Add a `/schema` debug endpoint that returns the discovered schema (useful for troubleshooting).

### 3.5 Update `.env.example`

Add InfluxDB variables:
```bash
# InfluxDB connection (for Financial Q&A mode)
INFLUXDB_HOST=http://localhost:8086
INFLUXDB_TOKEN=your-influxdb-token
INFLUXDB_ORG=your-org
INFLUXDB_BUCKET=stocks
```

### 3.6 Update `docker-compose.yaml`

Pass InfluxDB env vars into the Grafana container:
```yaml
environment:
  INFLUXDB_HOST: ${INFLUXDB_HOST:-http://influxdb:8086}
  INFLUXDB_TOKEN: ${INFLUXDB_TOKEN:-}
  INFLUXDB_ORG: ${INFLUXDB_ORG:-}
  INFLUXDB_BUCKET: ${INFLUXDB_BUCKET:-stocks}
```

### 3.7 Update `go.mod`

Add dependency:
```
github.com/influxdata/influxdb-client-go/v2 v2.14.0
```

---

## Phase 4: Frontend — Chat UI

### 4.1 New types in `src/types.ts`

```ts
// ---------- Ask Mode Types ----------

export interface AskRequest {
  question: string;
  llm: LLMConfig;
  influxdb?: InfluxDBConfig;
}

export interface InfluxDBConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
}

export interface AskResponse {
  answer: string;
  fluxQuery?: string;
  rowCount: number;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fluxQuery?: string;
  rowCount?: number;
  timestamp: Date;
}

// ---------- Updated Panel Options ----------

export type PanelMode = 'analyze' | 'ask';

export interface PanelAIOptions {
  mode: PanelMode;              // NEW: toggle between modes
  prompt: string;               // Analyze mode prompt
  autoAnalyze: boolean;
  llm: LLMConfig;
  influxdb?: InfluxDBConfig;    // NEW: optional per-panel InfluxDB override
}
```

### 4.2 New component: `src/components/ChatPanel.tsx`

A chat-style UI for the "Ask" mode:

```
┌──────────────────────────────────────────┐
│  ┌────────────────────────────────────┐  │
│  │ Conversation history (scrollable)  │  │
│  │                                    │  │
│  │ User: Which stocks have RSI < 30?  │  │
│  │                                    │  │
│  │ AI: Based on the latest data...    │  │
│  │ | Ticker | RSI   |                 │  │
│  │ | GME    | 28.4  |                 │  │
│  │ | PFE    | 29.1  |                 │  │
│  │                                    │  │
│  │ [Show Flux query ▼]               │  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────┐ [Send]   │
│  │ Ask a question...          │          │
│  └────────────────────────────┘          │
│                                          │
│  Suggested: RSI oversold | Top P/E | ... │
└──────────────────────────────────────────┘
```

Features:
- **Text input** with Enter-to-send and a Send button
- **Conversation history** — messages persist within the panel session (not across reloads unless we add persistence later)
- **Markdown rendering** — reuse existing `AnalysisResult` component for AI responses
- **Collapsible Flux query** — each answer can show the generated Flux (collapsed by default)
- **Suggested questions** — show a few clickable quick-start prompts (from the README list)
- **Loading state** — spinner while waiting for the two-step LLM pipeline
- **Error display** — show query execution errors with the generated Flux for debugging

### 4.3 New component: `src/components/ChatMessage.tsx`

Renders a single message (user or assistant):
- User messages: right-aligned, themed bubble
- Assistant messages: left-aligned, markdown-rendered, with optional Flux query toggle and row count badge

### 4.4 New component: `src/components/SuggestedQuestions.tsx`

Shows clickable example questions when the conversation is empty:

```ts
const SUGGESTED_QUESTIONS = [
  "Which stocks currently have RSI below 30 (oversold)?",
  "Show me the analyst consensus for all stocks",
  "Which stocks have the highest profit margin?",
  "Compare trailing P/E and forward P/E for all stocks",
  "Find stocks with Piotroski score >= 7 and positive earnings growth",
  "What is the average implied volatility by industry?",
];
```

### 4.5 Update `src/components/AnalysisPanel.tsx`

Add mode switching. When `options.mode === 'ask'`, render `<ChatPanel>` instead of the existing analyze UI:

```tsx
export const AnalysisPanel: React.FC<Props> = (props) => {
  const { options } = props;

  if (options.mode === 'ask') {
    return <ChatPanel {...props} />;
  }

  // Existing analyze mode UI...
};
```

### 4.6 Update `src/module.ts`

Add panel options for the new mode:

```ts
// ── Mode Toggle ──
.addSelect({
  path: 'mode',
  name: 'Panel Mode',
  description: 'Analyze: AI analyzes panel query data. Ask: chat with AI about your stock data.',
  defaultValue: 'ask',
  settings: {
    options: [
      { value: 'analyze', label: 'Analyze panel data' },
      { value: 'ask', label: 'Ask questions (Financial Q&A)' },
    ],
  },
  category: ['Mode'],
})

// ── InfluxDB (for Ask mode) ──
.addTextInput({
  path: 'influxdb.url',
  name: 'InfluxDB URL',
  description: 'Leave blank to use server default (INFLUXDB_HOST env var)',
  defaultValue: '',
  category: ['InfluxDB (Ask mode)'],
  showIf: (options) => options.mode === 'ask',
})
// ... token, org, bucket fields similarly
```

---

## Phase 5: Prompt Engineering

### 5.1 Financial-domain Flux generation prompt

The system prompt is critical for quality. Key improvements over the basic `ollama-financial-analyst` version:

1. **Full EODHD schema** — include `eodhd_fundamentals`, `eodhd_financials`, `eodhd_earnings` measurements with their fields and tags
2. **More examples** — especially multi-measurement joins (e.g., "analyst target vs current price" requires joining `stock_data` + `eodhd_fundamentals`)
3. **Flux `join` patterns** — show the `import "join"` + `join.inner()` pattern for cross-measurement queries
4. **Snapshot query pattern** — emphasize `|> group(columns: ["ticker", "_field"]) |> last()` for `stock_data` and `eodhd_fundamentals`
5. **Time-series pattern** — show range queries for `price_history` and `eodhd_financials`

### 5.2 Example prompt additions for EODHD data

```
User: "Which stocks have the highest analyst target price upside vs current price?"
Assistant:
```flux
import "join"

price = from(bucket: "{bucket}")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "stock_data" and r._field == "current_price")
  |> group(columns: ["ticker"]) |> last()
  |> keep(columns: ["ticker", "_value"])
  |> rename(columns: {_value: "current_price"}) |> group()

target = from(bucket: "{bucket}")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "eodhd_fundamentals" and r._field == "analyst_target_price")
  |> group(columns: ["ticker"]) |> last()
  |> keep(columns: ["ticker", "_value"])
  |> rename(columns: {_value: "target_price"}) |> group()

join.inner(left: price, right: target, on: (l, r) => l.ticker == r.ticker,
  as: (l, r) => ({
    ticker: l.ticker,
    current_price: l.current_price,
    target_price: r.target_price,
    upside_pct: (r.target_price - l.current_price) / l.current_price * 100.0
  }))
  |> sort(columns: ["upside_pct"], desc: true)
  |> limit(n: 25)
```

User: "Find stocks with Piotroski score >= 7, RSI < 50, and positive quarterly earnings growth"
Assistant:
```flux
import "join"

piotroski = from(bucket: "{bucket}")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "stock_data" and r._field == "piotroski_score")
  |> group(columns: ["ticker"]) |> last()
  |> filter(fn: (r) => r._value >= 7.0)
  |> keep(columns: ["ticker", "_value"])
  |> rename(columns: {_value: "piotroski_score"}) |> group()

rsi = from(bucket: "{bucket}")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "stock_data" and r._field == "rsi")
  |> group(columns: ["ticker"]) |> last()
  |> filter(fn: (r) => r._value < 50.0)
  |> keep(columns: ["ticker", "_value"])
  |> rename(columns: {_value: "rsi"}) |> group()

growth = from(bucket: "{bucket}")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "eodhd_fundamentals" and r._field == "quarterly_earnings_growth")
  |> group(columns: ["ticker"]) |> last()
  |> filter(fn: (r) => r._value > 0.0)
  |> keep(columns: ["ticker", "_value"])
  |> rename(columns: {_value: "earnings_growth"}) |> group()

j1 = join.inner(left: piotroski, right: rsi, on: (l, r) => l.ticker == r.ticker,
  as: (l, r) => ({ticker: l.ticker, piotroski_score: l.piotroski_score, rsi: r.rsi}))

join.inner(left: j1, right: growth, on: (l, r) => l.ticker == r.ticker,
  as: (l, r) => ({ticker: l.ticker, piotroski_score: l.piotroski_score, rsi: l.rsi, earnings_growth: r.earnings_growth}))
```
```

---

## Phase 6: Testing

### 6.1 Backend tests

| File | Tests |
|---|---|
| `pkg/influx/client_test.go` | Execute with mock HTTP server returning CSV; error handling |
| `pkg/influx/schema_test.go` | Schema discovery with mock; caching behavior; fallback |
| `pkg/financial/processor_test.go` | Full pipeline with mock LLM + mock InfluxDB; error paths (bad Flux, no results) |
| `pkg/financial/prompts_test.go` | Prompt construction includes schema, bucket, examples |
| `pkg/resources_test.go` | `/ask` endpoint: valid request, missing question, InfluxDB error, LLM error |

### 6.2 Frontend tests

| File | Tests |
|---|---|
| `ChatPanel.test.tsx` | Renders input, sends question, displays response, shows Flux toggle |
| `ChatMessage.test.tsx` | User vs assistant rendering, markdown, Flux query collapse |
| `SuggestedQuestions.test.tsx` | Renders suggestions, click fires callback |

### 6.3 Integration / E2E

- Provision a test dashboard with the plugin panel in "Ask" mode
- Mock InfluxDB with known data
- Ask a question, verify response renders

---

## Phase 7: Packaging & Deployment

1. `npm run build` — compile frontend
2. `mage buildAll` — compile Go backend (now includes InfluxDB client)
3. Update `docker-compose.yaml` with InfluxDB env vars
4. Update `grafana-plugin-config.ini` (no changes needed — same plugin ID)
5. Update `README.md` with:
   - New "Ask" mode documentation
   - InfluxDB configuration section
   - Example questions

---

## Updated Project Structure

```
panel-ai-analysis/
├── src/
│   ├── module.ts                  # + mode toggle, InfluxDB options
│   ├── plugin.json
│   ├── types.ts                   # + AskRequest, AskResponse, ChatMessage, PanelMode
│   ├── constants.ts               # + SUGGESTED_QUESTIONS
│   ├── components/
│   │   ├── AnalysisPanel.tsx      # + mode switch (analyze vs ask)
│   │   ├── AnalysisResult.tsx     # (unchanged — reused by ChatPanel)
│   │   ├── PromptEditor.tsx       # (unchanged — analyze mode only)
│   │   ├── ChatPanel.tsx          # NEW — main Ask mode component
│   │   ├── ChatMessage.tsx        # NEW — single message renderer
│   │   └── SuggestedQuestions.tsx  # NEW — clickable example questions
│   ├── utils/
│   │   ├── dataSerializer.ts      # (unchanged)
│   │   └── panelConfig.ts         # (unchanged)
│   └── img/
│       └── logo.svg
├── pkg/
│   ├── main.go
│   ├── app.go                     # + InfluxDB client init, /ask + /schema routes
│   ├── resources.go               # + handleAsk(), handleGetSchema()
│   ├── prompt.go                  # (unchanged — analyze mode)
│   ├── provider/                  # + GenerateWithSystem() method
│   │   ├── provider.go
│   │   ├── gemini.go
│   │   └── openai_compat.go
│   ├── influx/                    # NEW
│   │   ├── client.go              # InfluxDB Flux query executor
│   │   └── schema.go              # Schema discovery + caching
│   └── financial/                 # NEW
│       ├── processor.go           # Question → Flux → execute → format pipeline
│       └── prompts.go             # Financial-domain system prompts + examples
├── go.mod                         # + influxdb-client-go
└── ...
```

---

## Implementation Order

| # | Task | Est. |
|---|------|------|
| 1 | `pkg/influx/client.go` — InfluxDB Flux executor | 1 hr |
| 2 | `pkg/influx/schema.go` — schema discovery + caching | 1 hr |
| 3 | `pkg/financial/prompts.go` — Flux generation + formatting prompts with EODHD examples | 1.5 hr |
| 4 | `pkg/financial/processor.go` — two-step pipeline | 1.5 hr |
| 5 | Update `pkg/provider/` — add `GenerateWithSystem()` to interface + implementations | 1 hr |
| 6 | `pkg/resources.go` — `/ask` + `/schema` handlers | 1 hr |
| 7 | `pkg/app.go` — InfluxDB client lifecycle, route registration | 30 min |
| 8 | `src/types.ts` + `src/constants.ts` — new types and suggested questions | 30 min |
| 9 | `src/components/ChatMessage.tsx` | 1 hr |
| 10 | `src/components/SuggestedQuestions.tsx` | 30 min |
| 11 | `src/components/ChatPanel.tsx` — main Ask mode UI | 2 hr |
| 12 | Update `src/components/AnalysisPanel.tsx` — mode switch | 30 min |
| 13 | Update `src/module.ts` — mode toggle + InfluxDB panel options | 30 min |
| 14 | Update `.env.example`, `docker-compose.yaml`, `go.mod` | 30 min |
| 15 | Backend tests (influx, financial, resources) | 2 hr |
| 16 | Frontend tests (ChatPanel, ChatMessage, SuggestedQuestions) | 1.5 hr |
| 17 | README update | 30 min |
| **Total** | | **~16 hr** |

---

## Open Questions

1. **Conversation context** — Should previous Q&A pairs be sent as context for follow-up questions? The Python CLI doesn't do this, but it would enable "Show me the same but for AAPL" follow-ups. Trade-off: increases token usage.

2. **Query retry** — If the LLM generates invalid Flux, should the backend retry with the error message? (e.g., "Your query failed with: `undefined identifier schema`. Fix it.") This could improve success rate at the cost of latency.

3. **Streaming** — The two-step pipeline has a noticeable wait (generate Flux + execute + format). Streaming the final formatting response would improve perceived latency. Can be deferred to a future iteration.

4. **Schema refresh** — How often should the schema cache be invalidated? The exporter writes new data but doesn't change the schema. A 5-minute TTL should be sufficient. Add a "Refresh schema" button in the UI for manual invalidation.

5. **Multi-bucket support** — The exporter writes core + EODHD data to the same bucket. If a user has EODHD in a separate bucket (per config comments), the Q&A pipeline would need to query multiple buckets. Defer to a future iteration.

6. **Rate limiting** — Each question triggers 2 LLM calls + 1 InfluxDB query. Consider adding a cooldown or debounce on the frontend to prevent rapid-fire requests.
