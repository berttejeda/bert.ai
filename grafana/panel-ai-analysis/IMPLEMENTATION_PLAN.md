# Grafana Panel AI Analysis - Implementation Plan

## Overview

A Grafana **panel plugin** that analyzes the data behind a specific panel by:

1. Parsing the dashboard JSON for the panel to which it is assigned
2. Reading and executing the panel's query against its datasource
3. Sending the query results + panel metadata to the configured LLM (Google Gemini, Ollama, or any OpenAI-compatible endpoint)
4. Returning the AI analysis to the user, with a prompt that can be overridden and **persisted via dashboard/panel save**

This differs from the existing `LLM Engineer 2` plugin (screenshot-based visual analysis) by operating on **actual query data** rather than a rendered image, and by supporting **multiple LLM backends** including fully local inference via Ollama.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Grafana Dashboard                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │      Panel AI Analysis Plugin (React Frontend)                 │  │
│  │                                                                │  │
│  │  1. Reads props.data (DataFrame[] from Grafana query engine)   │  │
│  │  2. Reads panel JSON config from dashboard model               │  │
│  │  3. Serializes data + config + user prompt                     │  │
│  │  4. POSTs to backend /resources/analyze                        │  │
│  │  5. Displays AI analysis result with Markdown rendering        │  │
│  └───────────────────────────┬────────────────────────────────────┘  │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
                               ▼
               ┌───────────────────────────────┐
               │   Backend (Go)                │
               │  - Receives serialized data   │
               │  - Selects LLM provider       │
               │  - Builds prompt              │
               │  - Calls provider API         │
               │  - Returns analysis text      │
               └───────────────┬───────────────┘
                               │
                     ┌─────────┼─────────┐
                     ▼         ▼         ▼
         ┌──────────────┐ ┌────────┐ ┌────────────────┐
         │ Google Gemini│ │ Ollama │ │ OpenAI-compat  │
         │ (cloud)      │ │ (local)│ │ (any endpoint) │
         └──────────────┘ └────────┘ └────────────────┘
                               │
                               ▼
                       Returns AI Analysis
                               │
                               ▼
               ┌───────────────────────────────┐
               │   Display in Panel (Markdown) │
               └───────────────────────────────┘
```

### Key Design Decision: Frontend-Driven Data Collection

Grafana's panel rendering pipeline **already executes the panel's queries** and delivers the results to the panel component via `props.data` (`PanelData` containing `DataFrame[]`). This means:

- **No need to re-execute queries from the backend** -- the frontend already has the data.
- The frontend serializes the `DataFrame` results + panel metadata and sends them to the Go backend.
- The backend's sole responsibility is prompt construction and LLM API interaction.

This avoids the complexity of the backend needing datasource credentials, query language knowledge, or Grafana API access.

---

## Project Structure

```
panel-ai-analysis/
├── src/
│   ├── module.ts                  # Plugin entry point, registers panel + options
│   ├── plugin.json                # Plugin metadata (id, type, backend flag, etc.)
│   ├── types.ts                   # TypeScript interfaces (options, request/response)
│   ├── constants.ts               # Default prompt text
│   ├── components/
│   │   ├── AnalysisPanel.tsx      # Main panel component
│   │   ├── AnalysisResult.tsx     # Markdown-rendered analysis display
│   │   └── PromptEditor.tsx       # Optional prompt override textarea
│   ├── utils/
│   │   ├── dataSerializer.ts      # Converts DataFrame[] to JSON for backend
│   │   └── panelConfig.ts         # Extracts panel JSON config from dashboard model
│   └── img/
│       └── logo.svg               # Plugin icon
├── pkg/
│   ├── main.go                    # Go entrypoint, serves plugin
│   ├── app.go                     # App struct, health check, provider registry
│   ├── resources.go               # /analyze + /providers resource handlers
│   ├── prompt.go                  # Default prompt template + builder
│   └── provider/
│       ├── provider.go            # LLMProvider interface definition
│       ├── gemini.go              # Google Gemini implementation
│       └── openai_compat.go       # OpenAI-compatible impl (covers Ollama, OpenAI, etc.)
├── go.mod
├── go.sum
├── Magefile.go                    # Cross-platform Go builds
├── package.json
├── tsconfig.json
├── docker-compose.yaml
├── .env.example
├── grafana-plugin-config.ini
├── webpack.config.ts
├── jest.config.js
├── eslint.config.mjs
├── .gitignore
├── .nvmrc
├── IMPLEMENTATION_PLAN.md         # (this file)
└── README.md
```

---

## Phase 1: Scaffold & Configuration

### 1.1 Initialize the plugin project

- Copy shared config files from the existing `LLM Engineer 2` plugin:
  - `.config/` (webpack base configs)
  - `tsconfig.json`, `jest.config.js`, `eslint.config.mjs`, `.prettierrc.js`, `.nvmrc`
  - `docker-compose.yaml` (point to `.config/docker-compose-base.yaml`)
  - `Magefile.go`
- Create `package.json` with updated name `grafana-panel-ai-analysis` and same dependency set, **minus** `html2canvas` (not needed).
- Add `react-markdown` + `remark-gfm` dependencies for rendering the AI response.

### 1.2 Plugin metadata (`src/plugin.json`)

```json
{
  "$schema": "https://raw.githubusercontent.com/grafana/grafana/main/docs/sources/developers/plugins/plugin.schema.json",
  "type": "panel",
  "name": "Panel AI Analysis",
  "id": "bertai-panel-ai-analysis",
  "backend": true,
  "executable": "gpx_bertai-panel-ai-analysis",
  "info": {
    "keywords": ["panel", "ai", "analysis", "gemini", "llm"],
    "description": "AI-powered analysis of panel query data using Google Gemini",
    "author": { "name": "bert.ai" },
    "logos": {
      "small": "img/logo.svg",
      "large": "img/logo.svg"
    },
    "version": "1.0.0"
  },
  "dependencies": {
    "grafanaDependency": ">=10.4.0",
    "plugins": []
  }
}
```

### 1.3 Environment & Docker

- `.env.example`:
  ```bash
  # LLM Provider: "gemini", "ollama", or "openai-compatible"
  LLM_PROVIDER=gemini

  # Gemini settings
  GEMINI_API_KEY=your_gemini_api_key_here
  GEMINI_MODEL=gemini-2.0-flash-exp

  # Ollama settings (no API key needed for local)
  OLLAMA_ENDPOINT=http://localhost:11434
  OLLAMA_MODEL=llama3.1

  # OpenAI-compatible settings (for any provider exposing the OpenAI chat API)
  OPENAI_COMPAT_ENDPOINT=http://localhost:11434/v1
  OPENAI_COMPAT_API_KEY=
  OPENAI_COMPAT_MODEL=llama3.1
  ```
- `grafana-plugin-config.ini` -- `allow_loading_unsigned_plugins = bertai-panel-ai-analysis`
- Update `docker-compose.yaml` to pass all provider env vars and mount the plugin dist.
- Environment variables serve as **defaults**. Panel-level options can override provider, endpoint, model, and API key per panel.

---

## Phase 2: Frontend Implementation

### 2.1 Types (`src/types.ts`)

All fields under `PanelAIOptions` are **persisted as part of the panel JSON** when the user saves the dashboard. This is the standard Grafana panel options mechanism -- any value set via `setPanelOptions` in `module.ts` is written into the dashboard model under `panels[n].options` and survives dashboard save/load/export.

```ts
// ---------- LLM Provider Types ----------

export type LLMProvider = 'gemini' | 'ollama' | 'openai-compatible';

export interface LLMConfig {
  provider: LLMProvider;    // Which backend to use
  endpoint: string;         // API endpoint URL (blank = use env default)
  model: string;            // Model name (blank = use env default)
  apiKey: string;           // API key (blank = use env default; not needed for Ollama)
}

// ---------- Panel Options (persisted on dashboard save) ----------

export interface PanelAIOptions {
  prompt: string;           // User-overridable prompt; blank = use DEFAULT_PROMPT
  autoAnalyze: boolean;     // Auto-run on data refresh vs. manual button click
  llm: LLMConfig;           // LLM provider settings (all persisted)
}

// ---------- Request / Response ----------

// Payload sent to the Go backend
export interface AnalyzeRequest {
  panelJson: Record<string, unknown>;        // Panel config from dashboard model
  rawTargets: Record<string, unknown>[];     // Raw query definitions with $variable placeholders
  resolvedVariables: TemplateVariableInfo[];  // Current template variable values
  queryResults: SerializedDataFrame[];        // Resolved query results (DataFrames)
  prompt: string;                             // Prompt (resolved: user override or default)
  llm: LLMConfig;                             // Provider config for this request
}

export interface TemplateVariableInfo {
  name: string;           // Variable name (e.g., "instance")
  label?: string;         // Display label
  current: string;        // Currently selected value(s)
  type: string;           // Variable type (query, custom, constant, etc.)
}

export interface SerializedDataFrame {
  name: string;
  fields: SerializedField[];
  length: number;
}

export interface SerializedField {
  name: string;
  type: string;          // 'number' | 'string' | 'time' | 'boolean' | 'other'
  values: unknown[];     // Raw values array
  labels?: Record<string, string>;
}

export interface AnalyzeResponse {
  analysis: string;
}
```

### 2.2 Data Serializer (`src/utils/dataSerializer.ts`)

Converts Grafana `DataFrame[]` (from `props.data.series`) into a compact JSON-serializable format:

- For each `DataFrame`, extract field names, types, labels, and values.
- **Truncation strategy**: if a field has > 500 data points, sample down (keep first 50, last 50, and evenly-spaced middle points) to avoid exceeding LLM context limits (especially important for smaller local models via Ollama). Include a note in the payload about sampling.
- Include the `DataFrame.name` (often the query refId or metric name).

### 2.3 Panel Config Extractor (`src/utils/panelConfig.ts`)

Use `@grafana/runtime`'s `getTemplateSrv()` and the dashboard model to extract:

- Panel title, description, type
- Datasource name/uid
- **Raw query targets** -- the original query definitions with `$variable` placeholders intact (from `props.data.request.targets`)
- **Resolved variable values** -- use `getTemplateSrv().getVariables()` to capture the current variable names and their resolved values, so the LLM understands what `$instance` or `$namespace` actually resolved to
- Field overrides, thresholds, mappings
- Time range (from `props.data.request.range`)

Access paths:
- `props.data.request.targets` -- raw query definitions (unresolved `$variable` placeholders)
- `props.data.series` -- the resolved query results (DataFrames with actual data after variable substitution)
- `getTemplateSrv().getVariables()` -- current template variable names + selected values

Both the raw targets and the resolved data are included in the payload so the LLM can understand the query intent (raw) and the actual results (resolved).

### 2.4 Default Prompt (`src/constants.ts`)

```ts
export const DEFAULT_PROMPT = `You are an expert data analyst reviewing Grafana panel data.

Given the panel configuration and query results below, provide:
1. A summary of what metrics/data are being displayed
2. Key trends or patterns in the data
3. Any anomalies or notable observations
4. Actionable insights or recommendations

Be concise but thorough. Use bullet points for clarity.`;
```

### 2.5 Main Panel Component (`src/components/AnalysisPanel.tsx`)

Props received from Grafana: `PanelProps<PanelAIOptions>` which includes:
- `data` -- `PanelData` (contains `series: DataFrame[]`, `request`, `state`, `timeRange`)
- `options` -- `PanelAIOptions` (user-configured prompt + autoAnalyze flag)
- `width`, `height` -- panel dimensions
- `fieldConfig` -- field overrides
- `id` -- panel ID

Component behavior:
1. On mount (or on button click), serialize `props.data.series` via `dataSerializer`.
2. Extract panel config from `props.data.request` -- include both **raw targets** (with `$variable` placeholders) and **resolved variable values** (via `getTemplateSrv().getVariables()`).
3. POST to `/api/plugins/bertai-panel-ai-analysis/resources/analyze` with `AnalyzeRequest`.
4. Render the response in `<AnalysisResult>`.
5. Show a loading spinner during the API call.
6. If `autoAnalyze` is enabled, re-trigger analysis when `props.data` changes (with debounce).

### 2.6 Plugin Options Editor (`src/module.ts`)

All options registered here are **automatically persisted** by Grafana into the dashboard JSON (`panels[n].options`) when the user clicks **Save dashboard**. This is the standard mechanism -- no custom persistence logic is needed.

```ts
import { PanelPlugin } from '@grafana/data';
import { PanelAIOptions } from './types';
import { AnalysisPanel } from './components/AnalysisPanel';
import { DEFAULT_PROMPT } from './constants';

export const plugin = new PanelPlugin<PanelAIOptions>(AnalysisPanel)
  .setPanelOptions((builder) => {
    builder
      // ── Prompt (persisted on dashboard save) ──
      .addTextInput({
        path: 'prompt',
        name: 'Analysis Prompt',
        description:
          'Custom prompt sent to the AI model. Leave blank to use the built-in default. ' +
          'This value is saved with the dashboard.',
        defaultValue: DEFAULT_PROMPT,
        settings: { useTextarea: true, rows: 6 },
        category: ['Prompt'],
      })

      // ── Auto-analyze toggle ──
      .addBooleanSwitch({
        path: 'autoAnalyze',
        name: 'Auto-analyze on data refresh',
        description: 'Automatically re-run analysis when panel data changes',
        defaultValue: false,
        category: ['Behavior'],
      })

      // ── LLM Provider ──
      .addSelect({
        path: 'llm.provider',
        name: 'LLM Provider',
        description:
          'Select which LLM backend to use. Environment variables supply defaults ' +
          'for endpoint, model, and API key; values set here override them.',
        defaultValue: 'gemini',
        settings: {
          options: [
            { value: 'gemini', label: 'Google Gemini' },
            { value: 'ollama', label: 'Ollama (local)' },
            { value: 'openai-compatible', label: 'OpenAI-compatible endpoint' },
          ],
        },
        category: ['LLM Provider'],
      })
      .addTextInput({
        path: 'llm.endpoint',
        name: 'Endpoint URL',
        description:
          'API endpoint. Leave blank to use the environment default. ' +
          'For Ollama: http://localhost:11434 | For OpenAI: https://api.openai.com/v1',
        defaultValue: '',
        category: ['LLM Provider'],
      })
      .addTextInput({
        path: 'llm.model',
        name: 'Model',
        description:
          'Model name. Leave blank for the environment default. ' +
          'Examples: gemini-2.0-flash-exp, llama3.1, gpt-4o',
        defaultValue: '',
        category: ['LLM Provider'],
      })
      .addTextInput({
        path: 'llm.apiKey',
        name: 'API Key',
        description:
          'API key for the provider. Not required for Ollama. ' +
          'Leave blank to use the environment variable.',
        defaultValue: '',
        category: ['LLM Provider'],
      });
  });
```

**Persistence behavior**: When a user edits any of these fields (prompt, provider, model, etc.) in the panel options sidebar, the values live in `panel.options` in memory. They are written to the dashboard JSON when the user clicks **Save dashboard** (or Ctrl+S). On reload, Grafana deserializes them back into `props.options` and passes them to the panel component. No additional persistence layer is needed.

### 2.7 Analysis Result Component (`src/components/AnalysisResult.tsx`)

- Renders the AI response as Markdown using `react-markdown` + `remark-gfm`.
- Styled with a dark background, scrollable container, and monospace font for code blocks.
- Includes a "Copy" button to copy the analysis text to clipboard.

### 2.8 Prompt Editor Component (`src/components/PromptEditor.tsx`)

- An inline textarea within the panel (collapsed by default) that lets the user tweak the prompt for a **single ad-hoc run** without changing the saved panel option.
- "Reset to saved" button restores the prompt from `props.options.prompt` (the persisted value).
- "Save as default" button calls `props.onOptionsChange(...)` to write the current text back into the panel options, so the next dashboard save will persist it.
- This provides two tiers of override:
  1. **Persisted** -- edit the prompt in the panel options sidebar, save dashboard. Available on every reload.
  2. **Ephemeral** -- expand the inline editor, tweak the prompt, click Analyze. Discarded on panel reload unless explicitly saved.

---

## Phase 3: Backend Implementation

### 3.1 LLM Provider Interface (`pkg/provider/provider.go`)

Define a common interface so the backend is LLM-agnostic:

```go
package provider

import "context"

// Config carries per-request provider settings.
// Values may come from panel options (preferred) or fall back to env vars.
type Config struct {
    Provider string // "gemini" | "ollama" | "openai-compatible"
    Endpoint string // API base URL (empty = env default)
    Model    string // Model name   (empty = env default)
    APIKey   string // API key      (empty = env default; not needed for Ollama)
}

// LLMProvider generates a text completion given a prompt.
type LLMProvider interface {
    Generate(ctx context.Context, prompt string) (string, error)
}

// New returns the appropriate provider for the given config.
func New(cfg Config) (LLMProvider, error) { ... }
```

`New()` resolves blank fields from environment variables before constructing the provider.

### 3.2 Gemini Provider (`pkg/provider/gemini.go`)

- Uses `github.com/google/generative-ai-go/genai`.
- Creates a `genai.Client` per request (lightweight; or cache with `sync.Pool` if needed).
- Sends a **text-only** prompt (no image data).
- Default model: `gemini-2.0-flash-exp` (env `GEMINI_MODEL`).

### 3.3 OpenAI-Compatible Provider (`pkg/provider/openai_compat.go`)

A single implementation that covers **Ollama, OpenAI, and any other provider** exposing the OpenAI Chat Completions API.

- **Ollama** exposes an OpenAI-compatible API at `http://<host>:11434/v1/chat/completions`.
- The provider POSTs to `{endpoint}/chat/completions` with the standard request body:

```json
{
  "model": "<model>",
  "messages": [
    { "role": "user", "content": "<prompt>" }
  ],
  "stream": false
}
```

- If `provider == "ollama"` and `endpoint` is bare (e.g., `http://localhost:11434`), the code appends `/v1` automatically.
- No external Go SDK needed -- plain `net/http` + JSON marshal/unmarshal.
- Supports optional `Authorization: Bearer <apiKey>` header (required for OpenAI, ignored for Ollama).
- Default env vars: `OLLAMA_ENDPOINT`, `OLLAMA_MODEL`, `OPENAI_COMPAT_ENDPOINT`, `OPENAI_COMPAT_MODEL`, `OPENAI_COMPAT_API_KEY`.

### 3.4 App Initialization (`pkg/app.go`)

- **No longer initializes a single LLM client at startup.** Instead, the provider is constructed per-request based on the `LLMConfig` in the request body (with env-var fallbacks).
- Still reads env vars at init time to validate that at least one provider is configured.
- Implements `CheckHealthHandler` (verifies env config) and `CallResourceHandler`.

### 3.5 Resource Handler (`pkg/resources.go`)

Two routes:

```go
func (a *App) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
    switch req.Path {
    case "analyze":
        return a.handleAnalyze(ctx, req, sender)
    case "providers":
        return a.handleListProviders(ctx, req, sender)
    default:
        return sender.Send(&backend.CallResourceResponse{Status: http.StatusNotFound})
    }
}
```

**`/analyze`**:
1. Unmarshal request body into `AnalyzeRequest` struct (includes `LLMConfig`).
2. Resolve config: merge panel-level overrides with env-var defaults.
3. Instantiate the appropriate `LLMProvider` via `provider.New(cfg)`.
4. Build the full prompt using `prompt.go` helpers.
5. Call `provider.Generate(ctx, prompt)`.
6. Return `{"analysis": "..."}` as JSON.

**`/providers`** (GET):
Returns which providers are available based on configured env vars, so the frontend can show/disable options intelligently:
```json
{
  "providers": [
    { "id": "gemini", "name": "Google Gemini", "configured": true },
    { "id": "ollama", "name": "Ollama (local)", "configured": true },
    { "id": "openai-compatible", "name": "OpenAI-compatible", "configured": false }
  ]
}
```

### 3.6 Prompt Builder (`pkg/prompt.go`)

Constructs the full prompt sent to the LLM:

```
[User prompt OR DEFAULT_PROMPT]

## Panel Configuration
- Title: {title}
- Datasource: {datasource}
- Time Range: {from} to {to}

## Template Variables
- $instance = "web-server-01"
- $namespace = "production"
[... for each resolved variable]

## Raw Query Definitions
These are the original queries with template variable placeholders:
### Query A
```json
{raw target JSON with $variable placeholders}
```
[Repeat for each target]

## Query Results (Resolved Data)
The following tables contain the actual data returned after variable substitution:
### Series: {series_name}
| timestamp | field1 | field2 | ... |
|-----------|--------|--------|-----|
| ...       | ...    | ...    | ... |

[Repeat for each DataFrame]
```

- Format numeric data as a Markdown table for readability by the LLM.
- Include raw targets so the LLM understands the query intent; include resolved variable values so it can map placeholders to actual values.
- If data is large, include a note about sampling.

### 3.7 Go Module (`go.mod`)

```
module bertai-panel-ai-analysis

go 1.24.6

require (
    github.com/google/generative-ai-go v0.15.0
    github.com/grafana/grafana-plugin-sdk-go v0.281.0
    google.golang.org/api v0.254.0
)
```

No additional SDK needed for Ollama/OpenAI-compatible -- the `openai_compat.go` provider uses only `net/http`.

---

## Phase 4: Testing

### 4.1 Frontend Tests

- **`dataSerializer.test.ts`** -- verify serialization handles empty frames, large datasets (truncation), various field types.
- **`AnalysisPanel.test.tsx`** -- mock `getBackendSrv().post()`, verify loading/error/result states.
- **`PromptEditor.test.tsx`** -- verify prompt override and reset behavior.

### 4.2 Backend Tests

- **`resources_test.go`** -- test `handleAnalyze` with mock LLM provider; verify prompt construction, error handling for missing fields, oversized payloads.
- **`prompt_test.go`** -- test prompt builder output format, table formatting, sampling notes.
- **`provider_test.go`** -- test provider resolution (env fallback logic), test OpenAI-compat request/response marshaling against a mock HTTP server, test Gemini provider with mock client.

### 4.3 E2E Tests (Playwright)

- Provision a test dashboard with a known datasource (e.g., TestData).
- Add the Panel AI Analysis plugin.
- Click "Analyze" and verify a response is rendered.

---

## Phase 5: Packaging & Deployment

1. `npm run build` -- compile frontend to `dist/`.
2. `mage buildAll` -- compile Go backend for all platforms into `dist/`.
3. `tar -czf bertai-panel-ai-analysis.tar.gz -C dist .`
4. Install into Grafana plugins directory.
5. Configure `allow_loading_unsigned_plugins = bertai-panel-ai-analysis`.
6. Set environment variables for at least one provider:
   - Gemini: `GEMINI_API_KEY`, optionally `GEMINI_MODEL`
   - Ollama: `OLLAMA_ENDPOINT` (default `http://localhost:11434`), `OLLAMA_MODEL`
   - OpenAI-compat: `OPENAI_COMPAT_ENDPOINT`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_MODEL`
7. Restart Grafana.

---

## Implementation Order (Task Sequence)

| # | Task | Est. Effort |
|---|------|-------------|
| 1 | Scaffold project (copy configs, package.json, plugin.json, go.mod) | 1 hr |
| 2 | Implement `types.ts` + `constants.ts` | 30 min |
| 3 | Implement `dataSerializer.ts` + unit tests | 1 hr |
| 4 | Implement `panelConfig.ts` | 30 min |
| 5 | Implement Go `provider/` package (interface + gemini + openai_compat) | 2.5 hr |
| 6 | Implement Go backend (`app.go`, `main.go`, `resources.go`, `prompt.go`) | 1.5 hr |
| 7 | Implement `AnalysisPanel.tsx` + `AnalysisResult.tsx` + `PromptEditor.tsx` | 2 hr |
| 8 | Wire up `module.ts` with panel options (prompt + LLM provider fields) | 1 hr |
| 9 | Frontend unit tests | 1 hr |
| 10 | Backend unit tests (including provider tests) | 1.5 hr |
| 11 | Docker compose + provisioning for local dev (incl. Ollama sidecar) | 1 hr |
| 12 | E2E tests | 1 hr |
| 13 | README + documentation | 30 min |
| **Total** | | **~14 hr** |

---

## Open Questions / Decisions

1. **Token/context limit management**: Gemini 2.0 Flash has a ~1M token context window, but local models (e.g., Llama 3.1 8B via Ollama) may only support 8K-128K tokens. The prompt builder should be context-length-aware: truncate/sample data more aggressively for models with smaller context windows. Consider accepting an optional `maxTokens` field in `LLMConfig` or detecting the model's limit.

2. **Multi-query panels**: Some panels have multiple queries (A, B, C...). The plan serializes all `DataFrame[]` from `props.data.series`, which already includes all query results. No special handling needed.

3. **Variable interpolation**: **Decided** -- the payload includes both raw query targets (with `$variable` placeholders from `props.data.request.targets`) and the resolved data (in `queryResults` DataFrames). Additionally, `resolvedVariables` provides the current value of each template variable so the LLM can map placeholders to concrete values.

4. **Streaming responses**: Both Gemini and OpenAI-compatible APIs support streaming (`stream: true`). For a future iteration, use Server-Sent Events (SSE) to stream the response token-by-token to the panel. The Grafana plugin SDK's `CallResource` supports streaming responses via multiple `sender.Send()` calls.

5. **API key security**: Panel options are stored in the dashboard JSON, which is readable by all dashboard viewers. For shared dashboards, the `apiKey` field in panel options should be treated as an override for personal dashboards only. Production deployments should rely on environment variables (which are not exposed to the frontend). Consider adding a warning in the panel options UI when an API key is set at the panel level.

6. **Ollama Docker sidecar**: For local dev/testing, the `docker-compose.yaml` can include an Ollama container alongside Grafana. This makes it trivial to test the local-LLM path without installing Ollama on the host:
   ```yaml
   services:
     ollama:
       image: ollama/ollama:latest
       ports:
         - "11434:11434"
       volumes:
         - ollama_data:/root/.ollama
   ```
