# Changelog

## 1.3.0

### Features
- **Externalized prompt configuration**: All LLM prompts and few-shot examples are now loaded from `prompts.yaml` at startup, allowing prompt tuning without recompiling the backend binary
- **Query retry with error feedback**: When a generated Flux query fails execution, the error is automatically fed back to the LLM for self-correction (up to 2 retries)
- **Common pitfalls in system prompt**: Added Flux-specific pitfalls (schema collisions, type mixing, pivot vs rename patterns) to reduce query generation errors
- **`--version` flag**: The backend binary now supports `--version` / `-v` to print the version, injected at build time from `package.json`
- **Flux comment sanitization**: `#` comments (invalid Flux syntax) in LLM-generated queries are automatically converted to `//` comments

### Configuration
- **`PROMPTS_CONFIG_PATH`** environment variable to specify a custom path to `prompts.yaml`
- **`INFLUXDB_TIMEOUT`** environment variable and panel option to configure InfluxDB HTTP client and query execution timeout (default 60s, range 5–600s)
- Prompt templates support Go `text/template` variables (`{{.Schema}}`, `{{.Bucket}}`)

### Build
- Magefile reads version from `package.json` and injects it via `-ldflags -X main.Version=...`
- Webpack config copies `prompts.yaml` into `dist/` during build

### Bug Fixes
- Fixed `context deadline exceeded` errors on InfluxDB queries by making the HTTP timeout configurable (was hardcoded to 20s client / 30s execution)
- Fixed Flux compilation errors caused by LLM-generated `#` comments

## 1.2.0

### Features
- **Ask mode**: Chat-style financial Q&A — natural-language questions against InfluxDB stock data
- **InfluxDB schema discovery**: Auto-discovers measurements, tags, and fields with TTL caching
- **Two-step LLM pipeline**: Question → Flux query generation → InfluxDB execution → AI-formatted answer
- **Dashboard context awareness**: Automatically reads all panels and queries from the current dashboard for richer LLM context
- **Chat UI**: Conversation history, suggested questions, Flux query toggle, copy support
- **`GenerateWithSystem` LLM method**: System/user message separation for all providers (Gemini, Ollama, OpenAI-compatible)

### API
- `POST /ask` — Financial Q&A pipeline endpoint
- `GET /schema` — Debug endpoint for discovered InfluxDB schema
- `POST /schema/refresh` — Invalidate cached schema

### Configuration
- InfluxDB connection via environment variables (`INFLUXDB_HOST`, `INFLUXDB_TOKEN`, `INFLUXDB_ORG`, `INFLUXDB_BUCKET`) or per-panel options
- Panel option for mode selection (Analyze / Ask)

## 1.0.0

- Initial release
- Multi-LLM provider support: Google Gemini, Ollama, OpenAI-compatible
- Panel query data serialization with sampling for large datasets
- Custom prompt editor with dashboard persistence
- Template variable resolution (raw targets + resolved values)
- Markdown rendering of AI analysis results
