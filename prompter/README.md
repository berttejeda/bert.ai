# Prompter

A command-line AI prompt interface that supports multiple LLM providers. Process text through configurable tasks (translate, summarize, rewrite, root-cause analysis, etc.) via local or cloud AI backends.

## Supported Providers

| Provider | Auth | Description |
|---|---|---|
| `ollama` | None | Local Ollama server (OpenAI-compatible) |
| `llama_cpp` | None | Local llama.cpp server (OpenAI-compatible) |
| `openai` | API key | OpenAI API (GPT-4o, etc.) |
| `anthropic` | API key | Anthropic Claude API |
| `gemini` | API key | Google Gemini API |
| `openai_oauth` | OAuth client credentials | Enterprise OAuth-protected OpenAI-compatible gateway |

## Installation

```bash
pip install -r requirements.txt
```

## Configuration

Configuration is loaded from `config.yaml` (or a path specified via `--config` / `AI_CONFIG_FILE` env var). The file is templatized — environment variables like `${AI_API_URL}` are resolved at load time.

### Ollama

```yaml
ai:
  provider: 'ollama'
  api_url: 'http://127.0.0.1:11434'
  model: 'llama3'
```

### llama.cpp

```yaml
ai:
  provider: 'llama_cpp'
  api_url: 'http://127.0.0.1:8080'
  model: 'my-model'
```

### OpenAI

```yaml
ai:
  provider: 'openai'
  # api_url auto-detected as https://api.openai.com
  model: 'gpt-4o-mini'
  api_key: "${OPENAI_API_KEY}"
```

### Anthropic

```yaml
ai:
  provider: 'anthropic'
  # api_url auto-detected as https://api.anthropic.com
  model: 'claude-sonnet-4-20250514'
  api_key: "${ANTHROPIC_API_KEY}"
  max_tokens: 4096  # optional, default: 4096
```

### Gemini

```yaml
ai:
  provider: 'gemini'
  # api_url auto-detected as https://generativelanguage.googleapis.com
  model: 'gemini-2.5-flash'
  api_key: "${GEMINI_API_KEY}"
```

### Enterprise OAuth gateway (openai_oauth)

```yaml
ai:
  provider: 'openai_oauth'
  api_url: 'https://your-enterprise-gateway.example.com'
  model: 'gpt-4o-mini'
  token_url: 'https://auth.example.com/oauth/token'
auth:
  CLIENT_ID: "${AI_CLIENT_ID}"
  CLIENT_SECRET: "${AI_CLIENT_SECRET}"
  APPKEY: "${AI_APPKEY}"
```

### Key config fields

| Field | Description |
|---|---|
| `ai.provider` | Provider name (see table above) |
| `ai.api_url` | API base URL (auto-detected for cloud providers if omitted) |
| `ai.model` | Model name to use |
| `ai.api_key` | API key (required for `openai`, `anthropic`, `gemini`) |
| `ai.max_tokens` | Max tokens for response (Anthropic only, default: 4096) |
| `ai.verify_tls` | Enable/disable TLS verification (default: true) |
| `ai.tasks.<name>.context` | System context for the task |
| `ai.tasks.<name>.prompt` | Instruction prompt for the task |

## Environment Variables

| Variable | Description |
|---|---|
| `AI_API_URL` | AI API base URL |
| `AI_MODEL` | Default model name |
| `AI_CONFIG_FILE` | Path to config file |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `AI_API_KEY` | Generic fallback API key (any provider) |

API key resolution order: `--api-key` CLI arg > `ai.api_key` in config > provider-specific env var > `AI_API_KEY` env var.

## Usage

### Basic CLI

```bash
# Text via argument
prompter.py --provider ollama --task summary --text "Your text here"

# Text via file
prompter.py --provider openai --task rewrite --text-file ./input.txt

# Text via stdin (pipe)
cat logs.txt | prompter.py --provider anthropic --task k8s.pod.logs.rca

# Output to file
prompter.py --task translate --text "Hola mundo" --output result.txt
```

### Provider-specific examples

```bash
# Ollama (local, no auth)
prompter.py --provider ollama --ai-api-url http://localhost:11434 \
  --ai-model llama3 --task summary --text "Some text"

# llama.cpp (local, no auth)
prompter.py --provider llama_cpp --ai-api-url http://localhost:8080 \
  --ai-model my-model --task rewrite --text "Some text"

# OpenAI
prompter.py --provider openai --api-key sk-... \
  --ai-model gpt-4o-mini --task summary --text "Some text"

# Anthropic
ANTHROPIC_API_KEY=sk-ant-... prompter.py --provider anthropic \
  --ai-model claude-sonnet-4-20250514 --task summary --text "Some text"

# Gemini
prompter.py --provider gemini --api-key AIza... \
  --ai-model gemini-2.5-flash --task translate --text "Some text"

# Enterprise OAuth gateway
prompter.py --provider openai_oauth --task summary --text "Some text"
```

### Webhook mode

Run as a FastAPI server that accepts POST requests:

```bash
prompter.py --webhook-mode --webhook-port 2048
```

Endpoint: `POST /api/v1/prompt`

Request body:

```json
{
  "task": "summary",
  "messages": [
    {"timestamp": "2024-01-01T00:00:00Z", "trackingId": "abc123", "message": "Log line content"}
  ]
}
```

Response:

```json
{
  "ok": true,
  "response": "AI-generated summary..."
}
```

## CLI Arguments

| Argument | Description |
|---|---|
| `--text`, `-t` | Input text (also accepts piped stdin) |
| `--text-file`, `-f` | File containing input text |
| `--config`, `-c` | Config file path |
| `--task` | Task to perform (required in CLI mode) |
| `--prompt-context`, `-x` | Custom prompt context override |
| `--provider` | AI provider name |
| `--ai-api-url` | API base URL |
| `--ai-model` | Model name |
| `--api-key` | API key for cloud providers |
| `--output`, `-o` | Output file path (default: stdout) |
| `--extra-vars`, `-e` | Extra template variables as `key=value` |
| `--webhook-mode` | Run as FastAPI webhook server |
| `--webhook-port` | Webhook server port (default: 2048) |
| `--token-url` | OAuth token URL (openai_oauth only) |
| `--client-id` | OAuth Client ID (openai_oauth only) |
| `--client-secret` | OAuth Client Secret (openai_oauth only) |
| `--app-key` | Application Key (openai_oauth only) |
| `--no-verify-tls` | Disable TLS certificate verification |
| `--debug`, `-D` | Enable debug logging |
| `--verbose`, `-v` | Enable verbose output |
| `--version` | Show version and exit |

## Built-in Tasks

| Task | Description |
|---|---|
| `translate` | Translate text to English with technical clarity |
| `summary` | Create a concise summary under 10 words |
| `rewrite` | Rewrite text clearly and concisely |
| `jenkins.job.rca` | Root-cause analysis of Jenkins job failures |
| `k8s.events.rca` | Root-cause analysis of Kubernetes events |
| `k8s.pod.logs.rca` | Root-cause analysis of pod logs |
| `k8s.pod.logs.rca.frigate` | RCA for Frigate service pod logs |
| `howto` | Simplify complex documents into step-by-step instructions |

Custom tasks can be added to `config.yaml` under `ai.tasks`.

## .env File

Create a `.env` file in the prompter directory for local development:

```env
AI_API_URL=http://127.0.0.1:11434
AI_MODEL=llama3
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GEMINI_API_KEY=AIza...
```

The `.env` file is loaded automatically via `python-dotenv` and is gitignored.
