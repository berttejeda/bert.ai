# llama.cpp Server Init

Cross-platform scripts to install, configure, and launch a [llama.cpp](https://github.com/ggml-org/llama.cpp) inference server.

## Files

| File | Description |
|------|-------------|
| `start.sh` | Bash script for macOS, Linux, and Windows (Git Bash / MSYS2 / WSL) |
| `init.ps1` | Native Windows PowerShell version of `start.sh` with the same flags and env vars |
| `models.ini` | Sample multi-model preset configuration for `llama-server` |

## Prerequisites

- A GGUF model file stored under `~/.ai/models/` (or set `LLAMA_MODEL` explicitly)
- **macOS** — [Homebrew](https://brew.sh)
- **Linux** — `apt`, `dnf`, or `pacman` (cmake & build tools for compiling from source)
- **Windows** — `winget` or `scoop`; alternatively download a release binary
- **MCP support** — Docker or Podman running with an API socket

## Quick Start

```bash
./start.sh
```

or with flags:

```bash
./start.sh --screen --enable-all-tools --ui-mcp-proxy=chartrambiz/diaMCP
```

The script will:

1. Optionally load settings from `~/.ai/llama-server.env`
2. Install `llama-server` if it isn’t already on `PATH`
3. Create `~/.ai/models/` if it doesn't exist
4. Auto-discover the first `.gguf` file under `~/.ai/models/` (unless `LLAMA_MODEL` is set)
5. Start the server in a detached session (`screen` → `tmux` → `nohup` fallback)
6. Poll `/health` until the server is ready

## Settings File

`start.sh` loads an optional env-style settings file before applying defaults. The default path is `~/.ai/llama-server.env`. Override it with `LLAMA_ENV_FILE`.

Example `~/.ai/llama-server.env`:

```bash
LLAMA_MODEL="${HOME}/.ai/models/gemma-4-E2B-it-uncensored-Q8_0/gemma-4-E2B-it-uncensored-Q8_0.gguf"
LLAMA_MODELS_PRESET="${HOME}/.ai/models.ini"
LLAMA_BIND_HOST="0.0.0.0"
LLAMA_PORT="11434"
LLAMA_CTX="262144"
LLAMA_GPU_LAYERS="99"
```

Then just run:

```bash
./start.sh
```

## CLI Flags

| Flag | Description |
|------|-------------|
| `--screen` | Force a named `screen` session (default name: `llamacpp`) |
| `--enable-all-tools` | Enable all built-in `llama-server` tools |
| `--enable-<tool>` | Enable a specific tool, e.g. `--enable-exec-shell-command` |
| `--enable-webui-mcp-proxy` | Enable the WebUI MCP CORS proxy |
| `--ui-mcp-proxy=MCPName` | Enable proxy and auto-install/start the specified MCP server (currently `chartrambiz/diaMCP` is supported) |
| `--help`, `-h` | Show usage |

### Examples

```bash
# All native tools in a screen session
./start.sh --screen --enable-all-tools

# Enable only get_datetime and shell execution
./start.sh --enable-get-datetime --enable-exec-shell-command

# Start with diaMCP and the WebUI proxy
./start.sh --screen --enable-all-tools --ui-mcp-proxy=chartrambiz/diaMCP
```

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
| `LLAMA_TOOLS` | *(none)* | Comma-separated list of built-in tools to enable |
| `LLAMA_WEBUI_MCP_PROXY` | `0` | Set to `1` to enable the WebUI MCP CORS proxy |
| `LLAMA_MCP_BASE_DIR` | `~/.ai/mcp-servers` | Where auto-installed MCP servers are cloned/updated |
| `LLAMA_ENV_FILE` | `~/.ai/llama-server.env` | Path to the optional env-style settings file |
| `LLAMA_SCREEN_NAME` | `llamacpp` | Name of the `screen` session when `--screen` is used |
| `AI_HOME` | `~/.ai` | Base directory for models and config |
| `EXTRA_MODEL_URL` | *(none)* | URL to download an additional GGUF model after start |

### Example

```bash
LLAMA_BIND_HOST=0.0.0.0 \
LLAMA_PORT=11434 \
LLAMA_CTX=262144 \
LLAMA_GPU_LAYERS=99 \
LLAMA_MODELS_PRESET=~/.ai/models.ini \
LLAMA_MODEL=~/.ai/models/gemma-4-E2B-it-uncensored-Q8_0/gemma-4-E2B-it-uncensored-Q8_0.gguf \
./start.sh --screen --enable-all-tools
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

## Built-in Tools

`llama-server` has built-in tools that the model can call through the WebUI:

`read_file`, `file_glob_search`, `grep_search`, `exec_shell_command`, `write_file`, `edit_file`, `apply_diff`, `get_datetime`

Enable them with `--enable-all-tools` or `--enable-<tool>`. Tool-calling models require `--jinja` (enabled by default). Note that `exec_shell_command` gives the model shell access on the host — only enable it in trusted environments and/or sandbox it.

## MCP Proxy with diaMCP

To use real `web_fetch` / `web_search` tools, connect an MCP server. The bundled `start.sh` can automatically install and start `chartrambiz/diaMCP`.

### Container Runtime

`start.sh` will use a running Podman or Docker socket automatically. If you are on macOS using Podman Machine, make sure the VM is running:

```bash
podman machine start
```

You can also set `DOCKER_HOST` manually:

```bash
export DOCKER_HOST='unix:///path/to/podman.sock'
./start.sh --screen --enable-all-tools --ui-mcp-proxy=chartrambiz/diaMCP
```

### Start diaMCP

```bash
./start.sh --screen --enable-all-tools --ui-mcp-proxy=chartrambiz/diaMCP
```

This will:

1. Detect the Podman/Docker socket and set `DOCKER_HOST` if needed
2. Download and run `https://raw.githubusercontent.com/chartrambiz/diaMCP/master/install.sh`
3. Clone or update `~/.ai/mcp-servers/diaMCP`
4. Patch `requirements.txt` to pin `mcp` to v1.x (avoids the `mcp 2.0` `FastMCP` import error)
5. Start the `diamcp` Docker/Podman container on `http://localhost:8000/mcp`
6. Enable `--ui-mcp-proxy` on `llama-server`

Verify the container is running:

```bash
docker ps | grep diamcp
```

### Connect in the llama.cpp WebUI

1. Open the llama.cpp WebUI.
2. Click **Settings** (⚙️) → **MCP**.
3. Click **Add New Server**.
4. Enter the URL: `http://localhost:8000/mcp`
5. Toggle **“Use llama-server proxy”** ON.
6. Save / Update.

The `web_fetch`, `web_search`, and other diaMCP tools will now appear in the chat.

### Sample Prompts

```text
Fetch https://example.com and summarize the main points.
```

```text
Use the web_fetch tool to get the contents of https://example.com and then summarize it.
```

```text
Search the web for "latest Mars rover news" and fetch the first result to summarize.
```

```text
Find the current price of AAPL using web_search and tell me the latest news about it.
```

A few tips:

- The model may ask for confirmation before executing a tool.
- If the page is heavily JavaScript-rendered or has anti-scraping measures, `web_fetch` may return little or no text.
- Models that are not explicitly trained for tool calling may not consistently invoke tools. If you have issues, try a model like Qwen 2.5/3.5 Instruct, Command R, or a model with a documented tool-calling template.

## Vision / Multimodal

If a file matching `*mmproj*` exists in the same directory as the selected model, it will automatically be loaded via `--mmproj` for multimodal (vision) support.

## Troubleshooting

- **Server doesn't start** — Check the log file at `start.sh.log` (or `init.ps1.log`) in the script directory.
- **Model not found** — Ensure your `.gguf` file is under `$AI_HOME/models/` or set `LLAMA_MODEL` explicitly.
- **Port conflict** — Change `LLAMA_PORT` to an available port.
- **GPU issues** — Lower `LLAMA_GPU_LAYERS` or set to `0` for CPU-only inference.
- **“Use llama-server proxy” toggle is missing in the WebUI** — Make sure `llama-server` was started with `--ui-mcp-proxy` (or `--webui-mcp-proxy` on older builds). If the toggle still does not appear, your `llama-server` build may be too old; update to a recent version that includes the MCP WebUI.
- **diaMCP fails with `ModuleNotFoundError: No module named 'mcp.server.fastmcp'`** — The `mcp` package resolved to v2.0, which removed `FastMCP`. `start.sh` now auto-patches `~/.ai/mcp-servers/diaMCP/requirements.txt` to `mcp[cli]>=1.0.0,<2.0.0` and rebuilds.
- **diaMCP container is not running** —
  ```bash
  cd ~/.ai/mcp-servers/diaMCP
  docker compose ps
  docker compose logs
  ```
- **Docker daemon not reachable on macOS** — Start Docker Desktop or Podman Machine, or set `DOCKER_HOST` to the Podman socket (e.g. `unix:///var/folders/.../podman-machine-default-api.sock`).
