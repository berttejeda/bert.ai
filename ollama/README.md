# Ollama Voice Assistant

A local voice assistant that leverages [Ollama](https://ollama.com/) for LLM inference, [Whisper](https://github.com/openai/whisper) for speech-to-text, and [Piper](https://github.com/rhasspy/piper) for neural text-to-speech.

Everything runs locally — no cloud APIs required.

## How It Works

1. **Listen** — Captures audio from your microphone and transcribes it using OpenAI Whisper (running locally).
2. **Think** — Sends the transcribed prompt to a local Ollama instance via its OpenAI-compatible API.
3. **Speak** — Renders the response as Markdown in the terminal and reads it aloud using Piper neural TTS.

## Prerequisites

- Python 3.10+
- A running [Ollama](https://ollama.com/) instance (default: `http://localhost:11434`)
- A Piper ONNX voice model (default: `~/.local/share/piper/en_US-lessac-medium.onnx`)
- A working microphone
- PortAudio (required by PyAudio)

### Installing PortAudio

**macOS:**

```shell
brew install portaudio
```

**Debian/Ubuntu:**

```shell
sudo apt-get install portaudio19-dev
```

### Downloading a Piper Voice Model

```shell
mkdir -p ~/.local/share/piper
curl -L -o ~/.local/share/piper/en_US-lessac-medium.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
curl -L -o ~/.local/share/piper/en_US-lessac-medium.onnx.json \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

## Installation

```shell
pip install -r requirements.txt
```

## Usage

Make sure Ollama is running and has the desired model pulled:

```shell
ollama pull gemma-4-E2B-it-uncensored-Q8_0
```

Then run the assistant:

```shell
python voice-assistant.py
```

The assistant will calibrate for ambient noise, then wait for you to speak. Pause for ~2 seconds to signal the end of your prompt.

## Configuration

The following constants at the top of `voice-assistant.py` can be adjusted:

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | Ollama API endpoint |
| `OLLAMA_MODEL` | `gemma-4-E2B-it-uncensored-Q8_0` | Model to use for inference |
| `WHISPER_MODEL` | `base` | Whisper model size (`tiny`, `base`, `small`, `medium`, `large`) |
| `PIPER_MODEL` | `~/.local/share/piper/en_US-lessac-medium.onnx` | Path to Piper ONNX voice model |

## Docker (Optional)

The `docker/` directory contains a Docker Compose project that provides an optional method for deploying [Open WebUI](https://github.com/open-webui/open-webui) (openclaw) alongside Ollama in a full-featured containerized CLI environment.

See [`docker/README.md`](docker/README.md) for details on building and running the container.
