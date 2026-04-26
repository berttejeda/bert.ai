# Grafana Panel AI Analysis

A Grafana **panel plugin** that analyzes panel query data using AI. Instead of screenshots, it sends the actual query results and panel metadata to an LLM for analysis.

## Features

- **Multi-LLM support**: Google Gemini, Ollama (local), or any OpenAI-compatible endpoint
- **Data-driven analysis**: Operates on actual query results (DataFrames), not rendered images
- **Custom prompts**: Override the default analysis prompt; persisted with dashboard save
- **Template variable awareness**: Includes both raw queries ($variable placeholders) and resolved values
- **Markdown rendering**: AI responses rendered with full Markdown support (tables, code, lists)

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

## Plugin ID

`bertai-panel-ai-analysis`

To allow loading as unsigned:
```ini
[plugins]
allow_loading_unsigned_plugins = bertai-panel-ai-analysis
```
