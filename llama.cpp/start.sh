#!/usr/bin/env bash

# Cross-platform llama.cpp server initializer (macOS / Linux / Windows via Git Bash, MSYS2, or WSL)

set -euo pipefail

# Execution context
script_dir=$(cd "$(dirname "$0")" && pwd)
script_name=${0##*/}
script_log="${script_dir}/${script_name}.log"

# Optional env-style settings file (e.g. ~/.ai/llama-server.env)
LLAMA_ENV_FILE="${LLAMA_ENV_FILE:-${HOME}/.ai/llama-server.env}"
if [[ -f "${LLAMA_ENV_FILE}" ]]; then
    # shellcheck source=/dev/null
    source "${LLAMA_ENV_FILE}"
    echo "Loaded settings from ${LLAMA_ENV_FILE}" | tee -a "${script_log}"
fi

# Defaults (override via environment)
LLAMA_HOST="${LLAMA_HOST:-http://127.0.0.1:11434}"
LLAMA_PORT="${LLAMA_PORT:-11434}"
LLAMA_BIND_HOST="${LLAMA_BIND_HOST:-127.0.0.1}"
LLAMA_CTX="${LLAMA_CTX:-4096}"
LLAMA_GPU_LAYERS="${LLAMA_GPU_LAYERS:-99}"
LLAMA_FLASH_ATTN="${LLAMA_FLASH_ATTN:-0}"
LLAMA_CACHE_TYPE_K="${LLAMA_CACHE_TYPE_K:-}"
LLAMA_CACHE_TYPE_V="${LLAMA_CACHE_TYPE_V:-}"
LLAMA_ROPE_SCALING="${LLAMA_ROPE_SCALING:-}"
LLAMA_ROPE_SCALE="${LLAMA_ROPE_SCALE:-}"
LLAMA_YARN_ORIG_CTX="${LLAMA_YARN_ORIG_CTX:-}"
LLAMA_YARN_EXT_FACTOR="${LLAMA_YARN_EXT_FACTOR:-}"
LLAMA_YARN_ATTN_FACTOR="${LLAMA_YARN_ATTN_FACTOR:-}"
LLAMA_YARN_BETA_FAST="${LLAMA_YARN_BETA_FAST:-}"
LLAMA_YARN_BETA_SLOW="${LLAMA_YARN_BETA_SLOW:-}"
LLAMA_IMAGE_MIN_TOKENS="${LLAMA_IMAGE_MIN_TOKENS:-}"
LLAMA_MODELS_PRESET="${LLAMA_MODELS_PRESET:-}"
LLAMA_TOOLS="${LLAMA_TOOLS:-}"
LLAMA_WEBUI_MCP_PROXY="${LLAMA_WEBUI_MCP_PROXY:-0}"
LLAMA_SCREEN_NAME="${LLAMA_SCREEN_NAME:-llamacpp}"

# Resolve home directory portably
AI_HOME="${AI_HOME:-${HOME}/.ai}"
LLAMA_MCP_BASE_DIR="${LLAMA_MCP_BASE_DIR:-${AI_HOME}/mcp-servers}"

# ── CLI argument parsing ───────────────────────────────────────────────────────
USE_SCREEN=0
declare -a LLAMA_TOOLS_LIST=()
if [[ -n "${LLAMA_TOOLS:-}" ]]; then
    IFS=',' read -r -a LLAMA_TOOLS_LIST <<< "${LLAMA_TOOLS}"
fi

usage() {
    cat <<EOF
Usage: ${script_name} [OPTIONS]

Options:
  --screen                         Start the server inside a named screen session (default: ${LLAMA_SCREEN_NAME})
  --enable-all-tools               Enable all built-in llama-server tools
  --enable-<tool>                  Enable a specific built-in tool (e.g. --enable-exec-shell-command)
  --enable-webui-mcp-proxy         Enable the WebUI MCP CORS proxy
  --ui-mcp-proxy=MCPName        Enable proxy and install/start an MCP server (e.g. chartrambiz/diaMCP)
  --help, -h                       Show this help message
EOF
}

ensure_docker_host() {
    if [[ -n "${DOCKER_HOST:-}" ]]; then
        return
    fi

    if command -v podman &>/dev/null; then
        local podman_socket
        podman_socket=$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>/dev/null || true)
        if [[ -n "${podman_socket}" && -S "${podman_socket}" ]]; then
            export DOCKER_HOST="unix://${podman_socket}"
            echo "Using Podman socket for DOCKER_HOST: ${DOCKER_HOST}" | tee -a "${script_log}" >&2
            return
        fi
    fi

    if command -v docker &>/dev/null && ! docker info &>/dev/null; then
        echo "Warning: docker is installed but the Docker daemon is not reachable. MCP setup may fail." | tee -a "${script_log}" >&2
    fi
}

setup_mcp_server() {
    local mcp_name="$1"
    local mcp_base_dir="${LLAMA_MCP_BASE_DIR:-${AI_HOME}/mcp-servers}"
    local repo_dir

    ensure_docker_host

    echo "Setting up MCP server: ${mcp_name}" | tee -a "${script_log}" >&2

    case "${mcp_name}" in
        chartrambiz/diaMCP)
            repo_dir="${mcp_base_dir}/diaMCP"
            if [[ -d "${repo_dir}/.git" && -f "${repo_dir}/docker-compose.yml" ]]; then
                echo "diaMCP already installed; updating/restarting..." | tee -a "${script_log}" >&2
                ( cd "${repo_dir}" && curl -fsSL "https://raw.githubusercontent.com/chartrambiz/diaMCP/master/install.sh" | sh )
            else
                mkdir -p "${mcp_base_dir}"
                ( cd "${mcp_base_dir}" && curl -fsSL "https://raw.githubusercontent.com/chartrambiz/diaMCP/master/install.sh" | sh )
            fi

            # Pin mcp to v1.x to avoid the FastMCP removal in mcp 2.0
            if [[ -f "${repo_dir}/requirements.txt" ]]; then
                if grep -qE '^mcp\[cli\]>=1\.0\.0(\s*)$' "${repo_dir}/requirements.txt"; then
                    sed -i.bak -E 's/^mcp\[cli\]>=1\.0\.0(\s*)$/mcp[cli]>=1.0.0,<2.0.0\1/' "${repo_dir}/requirements.txt"
                    echo "Patched mcp dependency to v1.x; rebuilding container..." | tee -a "${script_log}" >&2
                    ( cd "${repo_dir}" && docker compose up --build -d )
                fi
            fi
            ;;
        *)
            echo "MCP server '${mcp_name}' is not supported by this script yet." | tee -a "${script_log}" >&2
            exit 1
            ;;
    esac
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --screen)
            USE_SCREEN=1
            shift
            ;;
        --enable-all-tools)
            LLAMA_TOOLS_LIST=("all")
            shift
            ;;
        --enable-webui-mcp-proxy|--enable-mcp-proxy)
            LLAMA_WEBUI_MCP_PROXY=1
            shift
            ;;
        --ui-mcp-proxy=*)
            mcp_name="${1#--ui-mcp-proxy=}"
            setup_mcp_server "${mcp_name}"
            LLAMA_WEBUI_MCP_PROXY=1
            shift
            ;;
        --enable-*)
            tool_name="${1#--enable-}"
            tool_name="${tool_name//-/_}"
            LLAMA_TOOLS_LIST+=("${tool_name}")
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" | tee -a "${script_log}" >&2
            usage
            exit 1
            ;;
    esac
done

# ── OS Detection ───────────────────────────────────────────────────────────────
detect_os() {
    case "$(uname -s)" in
        Darwin*)  echo "macos"  ;;
        Linux*)   echo "linux"  ;;
        CYGWIN*|MINGW*|MSYS*) echo "windows" ;;
        *)        echo "unknown" ;;
    esac
}

OS="$(detect_os)"
echo "$(date +%H:%M:%S) Initializing on ${OS} ..." | tee "${script_log}"

# ── Platform-specific installation ─────────────────────────────────────────────
install_packages() {
    case "${OS}" in
        macos)
            if ! command -v brew &>/dev/null; then
                echo "Error: Homebrew is required on macOS. Install from https://brew.sh" | tee -a "${script_log}"
                exit 1
            fi
            brew install llama.cpp
            ;;
        linux)
            if command -v apt-get &>/dev/null; then
                # Debian / Ubuntu — llama.cpp may need to be built from source or installed via snap
                echo "Attempting to install llama.cpp via apt ..." | tee -a "${script_log}"
                sudo apt-get update && sudo apt-get install -y cmake build-essential curl
                if ! command -v llama-server &>/dev/null; then
                    echo "llama-server not found. Please build llama.cpp from source:" | tee -a "${script_log}"
                    echo "  git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp && cmake -B build && cmake --build build --config Release -j" | tee -a "${script_log}"
                    exit 1
                fi
            elif command -v dnf &>/dev/null; then
                sudo dnf install -y cmake gcc-c++ curl
                if ! command -v llama-server &>/dev/null; then
                    echo "llama-server not found. Please build llama.cpp from source." | tee -a "${script_log}"
                    exit 1
                fi
            elif command -v pacman &>/dev/null; then
                sudo pacman -Sy --noconfirm cmake base-devel curl
                if ! command -v llama-server &>/dev/null; then
                    echo "llama-server not found. Please build llama.cpp from source." | tee -a "${script_log}"
                    exit 1
                fi
            else
                echo "Unsupported Linux package manager. Please install llama.cpp manually." | tee -a "${script_log}"
                exit 1
            fi
            ;;
        windows)
            # Git Bash / MSYS2 on Windows
            if command -v winget &>/dev/null; then
                echo "Attempting install via winget ..." | tee -a "${script_log}"
                winget install --id=ggml-org.llama.cpp -e --accept-source-agreements --accept-package-agreements 2>/dev/null || true
            elif command -v scoop &>/dev/null; then
                scoop install llama.cpp 2>/dev/null || true
            fi
            if ! command -v llama-server &>/dev/null; then
                echo "llama-server not found. Please install llama.cpp manually:" | tee -a "${script_log}"
                echo "  https://github.com/ggml-org/llama.cpp/releases" | tee -a "${script_log}"
                exit 1
            fi
            ;;
        *)
            echo "Unsupported OS. Please install llama.cpp manually." | tee -a "${script_log}"
            exit 1
            ;;
    esac
}

# Only install if llama-server is not already available
if ! command -v llama-server &>/dev/null; then
    install_packages
fi

# Create directory structure for AI models
mkdir -p "${AI_HOME}/models"

# ── Model selection ────────────────────────────────────────────────────────────
# Priority: LLAMA_MODEL env var > first .gguf found in $AI_HOME/models
if [[ -z "${LLAMA_MODEL:-}" ]]; then
    LLAMA_MODEL=$(find "${AI_HOME}/models" -name "*.gguf" -type f ! -iname "*mmproj*" 2>/dev/null | head -1)
fi

if [[ -z "${LLAMA_MODEL:-}" ]]; then
    echo "No GGUF model found. Set LLAMA_MODEL=/path/to/model.gguf" | tee -a "${script_log}"
    exit 1
fi

echo "Model: ${LLAMA_MODEL}" | tee -a "${script_log}"

# ── Build server command ───────────────────────────────────────────────────────
SERVER_CMD="llama-server --model ${LLAMA_MODEL} --host ${LLAMA_BIND_HOST} --port ${LLAMA_PORT} --ctx-size ${LLAMA_CTX} --n-gpu-layers ${LLAMA_GPU_LAYERS}"

# Models preset file (multi-model aliases)
if [[ -n "${LLAMA_MODELS_PRESET}" ]]; then
    if [[ -f "${LLAMA_MODELS_PRESET}" ]]; then
        SERVER_CMD="${SERVER_CMD} --models-preset ${LLAMA_MODELS_PRESET}"
        echo "Models preset: ${LLAMA_MODELS_PRESET}" | tee -a "${script_log}"
    else
        echo "Warning: models preset file not found: ${LLAMA_MODELS_PRESET}" | tee -a "${script_log}"
    fi
fi

# Built-in tools
if [[ ${#LLAMA_TOOLS_LIST[@]} -gt 0 ]]; then
    if printf '%s\n' "${LLAMA_TOOLS_LIST[@]}" | grep -qx 'all'; then
        LLAMA_TOOLS_ARG="all"
    else
        LLAMA_TOOLS_ARG=$(IFS=','; echo "${LLAMA_TOOLS_LIST[*]}")
    fi
    SERVER_CMD="${SERVER_CMD} --tools ${LLAMA_TOOLS_ARG}"
    echo "Enabled tools: ${LLAMA_TOOLS_ARG}" | tee -a "${script_log}"
fi

# WebUI MCP proxy
if [[ "${LLAMA_WEBUI_MCP_PROXY}" -eq 1 ]]; then
    SERVER_CMD="${SERVER_CMD} --ui-mcp-proxy"
    echo "WebUI MCP proxy enabled" | tee -a "${script_log}"
fi

# Flash attention (set LLAMA_FLASH_ATTN=1 to enable)
if [[ "${LLAMA_FLASH_ATTN}" -eq 1 ]]; then
    SERVER_CMD="${SERVER_CMD} --flash-attn"
fi

# KV cache quantization (e.g. LLAMA_CACHE_TYPE_K=q8_0 LLAMA_CACHE_TYPE_V=q8_0)
if [[ -n "${LLAMA_CACHE_TYPE_K}" ]]; then
    SERVER_CMD="${SERVER_CMD} --cache-type-k ${LLAMA_CACHE_TYPE_K}"
fi
if [[ -n "${LLAMA_CACHE_TYPE_V}" ]]; then
    SERVER_CMD="${SERVER_CMD} --cache-type-v ${LLAMA_CACHE_TYPE_V}"
fi

# RoPE scaling / YaRN (needed to extend context beyond a model's native trained length)
if [[ -n "${LLAMA_ROPE_SCALING}" ]]; then
    SERVER_CMD="${SERVER_CMD} --rope-scaling ${LLAMA_ROPE_SCALING}"
    echo "RoPE scaling: ${LLAMA_ROPE_SCALING}" | tee -a "${script_log}"
fi
if [[ -n "${LLAMA_ROPE_SCALE}" ]]; then
    SERVER_CMD="${SERVER_CMD} --rope-scale ${LLAMA_ROPE_SCALE}"
fi
if [[ -n "${LLAMA_YARN_ORIG_CTX}" ]]; then
    SERVER_CMD="${SERVER_CMD} --yarn-orig-ctx ${LLAMA_YARN_ORIG_CTX}"
fi
if [[ -n "${LLAMA_YARN_EXT_FACTOR}" ]]; then
    SERVER_CMD="${SERVER_CMD} --yarn-ext-factor ${LLAMA_YARN_EXT_FACTOR}"
fi
if [[ -n "${LLAMA_YARN_ATTN_FACTOR}" ]]; then
    SERVER_CMD="${SERVER_CMD} --yarn-attn-factor ${LLAMA_YARN_ATTN_FACTOR}"
fi
if [[ -n "${LLAMA_YARN_BETA_FAST}" ]]; then
    SERVER_CMD="${SERVER_CMD} --yarn-beta-fast ${LLAMA_YARN_BETA_FAST}"
fi
if [[ -n "${LLAMA_YARN_BETA_SLOW}" ]]; then
    SERVER_CMD="${SERVER_CMD} --yarn-beta-slow ${LLAMA_YARN_BETA_SLOW}"
fi

# If a multimodal projector exists alongside the model, load it (for vision support)
MODEL_DIR=$(dirname "${LLAMA_MODEL}")
MMPROJ=$(find "${MODEL_DIR}" -name "*mmproj*" -type f 2>/dev/null | head -1)
if [[ -n "${MMPROJ:-}" ]]; then
    echo "Vision projector found: ${MMPROJ}" | tee -a "${script_log}"
    SERVER_CMD="${SERVER_CMD} --mmproj ${MMPROJ}"
    if [[ -n "${LLAMA_IMAGE_MIN_TOKENS}" ]]; then
        SERVER_CMD="${SERVER_CMD} --image-min-tokens ${LLAMA_IMAGE_MIN_TOKENS}"
    fi
fi

# ── Start the server ───────────────────────────────────────────────────────────
echo "Starting llama-server on ${LLAMA_BIND_HOST}:${LLAMA_PORT}" | tee -a "${script_log}"

case "${OS}" in
    macos|linux)
        if [[ "${USE_SCREEN}" -eq 1 ]]; then
            if ! command -v screen &>/dev/null; then
                echo "Error: --screen requested but screen is not installed." | tee -a "${script_log}" >&2
                exit 1
            fi
            screen -dm -S "${LLAMA_SCREEN_NAME}" bash -c "${SERVER_CMD}"
            echo "Started screen session: ${LLAMA_SCREEN_NAME}" | tee -a "${script_log}"
        elif command -v screen &>/dev/null; then
            screen -dm bash -c "${SERVER_CMD}"
        elif command -v tmux &>/dev/null; then
            tmux new-session -d -s llamacpp "${SERVER_CMD}"
        else
            # Fallback: run in background
            nohup bash -c "${SERVER_CMD}" >> "${script_log}" 2>&1 &
            echo "PID: $!" | tee -a "${script_log}"
        fi
        ;;
    windows)
        # On Git Bash / MSYS2, start the server in the background
        if [[ "${USE_SCREEN}" -eq 1 ]]; then
            if ! command -v screen &>/dev/null; then
                echo "Error: --screen requested but screen is not installed." | tee -a "${script_log}" >&2
                exit 1
            fi
            screen -dm -S "${LLAMA_SCREEN_NAME}" bash -c "${SERVER_CMD}"
            echo "Started screen session: ${LLAMA_SCREEN_NAME}" | tee -a "${script_log}"
        elif command -v screen &>/dev/null; then
            screen -dm bash -c "${SERVER_CMD}"
        else
            bash -c "${SERVER_CMD}" >> "${script_log}" 2>&1 &
            echo "PID: $!" | tee -a "${script_log}"
        fi
        ;;
esac

# ── Wait for server readiness ─────────────────────────────────────────────────
MAX_RETRIES=60
RETRY_DELAY=1
echo "Waiting for llama-server to be ready..." | tee -a "${script_log}"
for ((i=1; i<=MAX_RETRIES; i++)); do
    if curl --output /dev/null --silent --fail "${LLAMA_HOST}/health"; then
        echo "llama-server is ready (attempt $i)" | tee -a "${script_log}"
        break
    else
        echo "Attempt $i/$MAX_RETRIES — retrying in ${RETRY_DELAY}s ..." | tee -a "${script_log}"
        sleep $RETRY_DELAY
    fi

    if [ "$i" -eq "$MAX_RETRIES" ]; then
        echo "llama-server failed to start after $MAX_RETRIES attempts." | tee -a "${script_log}"
        exit 1
    fi
done

# ── Optional: download an extra model ─────────────────────────────────────────
if [[ -n "${EXTRA_MODEL_URL:-}" ]]; then
    echo "$(date +%H:%M:%S) Downloading extra model: ${EXTRA_MODEL_URL}" | tee -a "${script_log}"
    if command -v curl &>/dev/null; then
        curl -L -o "${AI_HOME}/models/$(basename "${EXTRA_MODEL_URL}")" "${EXTRA_MODEL_URL}" \
            && echo "$(date +%H:%M:%S) Successfully downloaded extra model" | tee -a "${script_log}" \
            || echo "$(date +%H:%M:%S) Failed to download extra model" | tee -a "${script_log}"
    elif command -v wget &>/dev/null; then
        wget -O "${AI_HOME}/models/$(basename "${EXTRA_MODEL_URL}")" "${EXTRA_MODEL_URL}" \
            && echo "$(date +%H:%M:%S) Successfully downloaded extra model" | tee -a "${script_log}" \
            || echo "$(date +%H:%M:%S) Failed to download extra model" | tee -a "${script_log}"
    else
        echo "Neither curl nor wget found. Cannot download extra model." | tee -a "${script_log}"
    fi
fi

echo "$(date +%H:%M:%S) Done. API available at ${LLAMA_HOST}/v1" | tee -a "${script_log}"
