#!/usr/bin/env bash

# Cross-platform llama.cpp server initializer (macOS / Linux / Windows via Git Bash, MSYS2, or WSL)

set -euo pipefail

# Execution context
script_dir=$(cd "$(dirname "$0")" && pwd)
script_name=${0##*/}
script_log="${script_dir}/${script_name}.log"

# Defaults (override via environment)
LLAMA_HOST="${LLAMA_HOST:-http://127.0.0.1:11434}"
LLAMA_PORT="${LLAMA_PORT:-11434}"
LLAMA_BIND_HOST="${LLAMA_BIND_HOST:-127.0.0.1}"
LLAMA_CTX="${LLAMA_CTX:-4096}"
LLAMA_GPU_LAYERS="${LLAMA_GPU_LAYERS:-99}"
LLAMA_FLASH_ATTN="${LLAMA_FLASH_ATTN:-0}"
LLAMA_CACHE_TYPE_K="${LLAMA_CACHE_TYPE_K:-}"
LLAMA_CACHE_TYPE_V="${LLAMA_CACHE_TYPE_V:-}"
LLAMA_MODELS_PRESET="${LLAMA_MODELS_PRESET:-}"

# Resolve home directory portably
AI_HOME="${AI_HOME:-${HOME}/.ai}"

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
    LLAMA_MODEL=$(find "${AI_HOME}/models" -name "*.gguf" -type f 2>/dev/null | head -1)
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

# If a multimodal projector exists alongside the model, load it (for vision support)
MODEL_DIR=$(dirname "${LLAMA_MODEL}")
MMPROJ=$(find "${MODEL_DIR}" -name "*mmproj*" -type f 2>/dev/null | head -1)
if [[ -n "${MMPROJ:-}" ]]; then
    echo "Vision projector found: ${MMPROJ}" | tee -a "${script_log}"
    SERVER_CMD="${SERVER_CMD} --mmproj ${MMPROJ}"
fi

# ── Start the server ───────────────────────────────────────────────────────────
echo "Starting llama-server on ${LLAMA_BIND_HOST}:${LLAMA_PORT}" | tee -a "${script_log}"

case "${OS}" in
    macos|linux)
        if command -v screen &>/dev/null; then
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
        if command -v screen &>/dev/null; then
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
