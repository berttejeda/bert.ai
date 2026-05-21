# llama.cpp Server Init

Cross-platform scripts to install, configure, and launch a [llama.cpp](https://github.com/ggml-org/llama.cpp) inference server.

## Files

| File | Description |
|------|-------------|
| `init.sh` | Bash script for macOS, Linux, and Windows (Git Bash / MSYS2 / WSL) |
| `init.ps1` | Native Windows PowerShell script |
| `models.ini` | Sample multi-model preset configuration |

## Prerequisites

- A GGUF model file stored under `~/.ai/models/` (or set `LLAMA_MODEL` explicitly)
- **macOS** — [Homebrew](https://brew.sh)
- **Linux** — `apt`, `dnf`, or `pacman` (cmake & build tools for compiling from source)
- **Windows** — `winget` or `scoop`; alternatively download a release binary

## Quick Start

```bash
# macOS / Linux
./init.sh

# Windows (PowerShell)
.\init.ps1
```

The script will:

1. Install `llama-server` if it isn't already on `PATH`
2. Create `~/.ai/models/` if it doesn't exist
3. Auto-discover the first `.gguf` file under `~/.ai/models/`
4. Start the server in a detached session (`screen` → `tmux` → `nohup` fallback)
5. Poll `/health` until the server is ready

## Environment Variables

All settings can be overridden via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `LLAMA_MODEL` | *(auto-detected)* | Absolute path to the `.gguf` model file |
| `LLAMA_HOST` | `http://127.0.0.1:11434` | Base URL used for health checks |
| `LLAMA_PORT` | `11434` | Port the server listens on |
| `LLAMA_BIND_HOST` | `127.0.0.1` | Bind address (`0.0.0.0` to expose on LAN) |
| `LLAMA_CTX` | `4096` | Context window size |
| `LLAMA_GPU_LAYERS` | `99` | Number of layers to offload to GPU |
| `LLAMA_FLASH_ATTN` | `0` | Set to `1` to enable flash attention |
| `LLAMA_CACHE_TYPE_K` | *(none)* | KV cache quantization for keys (e.g. `q8_0`) |
| `LLAMA_CACHE_TYPE_V` | *(none)* | KV cache quantization for values |
| `LLAMA_MODELS_PRESET` | *(none)* | Path to a `models.ini` file for `--models-preset` |
| `AI_HOME` | `~/.ai` | Base directory for models and config |
| `EXTRA_MODEL_URL` | *(none)* | URL to download an additional GGUF model after start |

### Example

```bash
LLAMA_BIND_HOST=0.0.0.0 \
LLAMA_PORT=11434 \
LLAMA_CTX=65536 \
LLAMA_GPU_LAYERS=99 \
LLAMA_MODELS_PRESET=~/.ai/models.ini \
LLAMA_MODEL=~/.ai/models/Qwen3-30B-A3B-Q4_K_S/Qwen3-30B-A3B-Q4_K_S.gguf \
./init.sh
```

## Models Preset (`models.ini`)

The `--models-preset` flag lets you expose multiple models behind named aliases on a single server instance. The included `models.ini` is a starting template:

```ini
[*]
# Global settings applied to all models
n_ctx = 4096
n_gpu_layers = -1

[my-model-alias]
model = /path/to/your/models/some-model.gguf
chat_template = "{% for message in messages %}{{ message['role'] }}: {{ message['content'] }}\n{% endfor %}"
```

Place your customized version at `~/.ai/models.ini` (or any path) and point to it with `LLAMA_MODELS_PRESET`.

## Directory Structure

```
~/.ai/
├── models/
│   ├── SomeModel-Q4_K_S/
│   │   └── SomeModel-Q4_K_S.gguf
│   └── AnotherModel-Q8_0/
│       └── AnotherModel-Q8_0.gguf
└── models.ini
```

## Vision / Multimodal

If a file matching `*mmproj*` exists in the same directory as the selected model, it will automatically be loaded via `--mmproj` for multimodal (vision) support.

## Troubleshooting

- **Server doesn't start** — Check the log file at `init.sh.log` (or `init.ps1.log`) in the script directory.
- **Model not found** — Ensure your `.gguf` file is under `$AI_HOME/models/` or set `LLAMA_MODEL` explicitly.
- **Port conflict** — Change `LLAMA_PORT` to an available port.
- **GPU issues** — Lower `LLAMA_GPU_LAYERS` or set to `0` for CPU-only inference.
