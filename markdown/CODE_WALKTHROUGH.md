# Code Walkthrough: `render_md.py`

This document is a technical reference for the internal architecture of `render_md.py`. Read this if you want to understand how the pieces connect or if you plan to extend the system.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        render_md.py                         │
│                                                             │
│  ┌──────────┐   build()   ┌───────────────────────────────┐ │
│  │ CLI args │────────────▶│  frontmatter.load()           │ │
│  │ -e vars  │             │  Jinja2 interpolation         │ │
│  └──────────┘             │  markdown.Markdown + hooks    │ │
│                           │  → ai_formatter() per block   │ │
│                           │  → write OUTPUT_FILE          │ │
│                           └───────────────────────────────┘ │
│                                          │                  │
│                                          ▼                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              FastAPI (uvicorn, port 5500)            │   │
│  │                                                      │   │
│  │  GET  /rendered_md.html  ← StaticFiles               │   │
│  │  POST /execute           ← execute_block(hash)       │   │
│  │  GET  /events            ← SSE reload stream         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Startup & CLI Parsing

`render_md.py` is invoked from the command line. `argparse` handles these flags:

| Flag | Default | Effect |
|---|---|---|
| `file` | `hello-world-python.md` | Source Markdown file |
| `--watch` / `-w` | `False` | Enable live-reload on file change |
| `--execute-codeblocks-on-startup` | `False` | Execute blocks immediately vs. on click |
| `--extra-vars` / `-e` | `[]` | `key=value` pairs overriding frontmatter |
| `--timeout` | (from `ai.timeout`) | Override LLM request timeout in seconds |
| `--debug` / `-d` | `False` | Print templated source before execution |
| `--port` | `5500` | HTTP server port |

`-e` flags are parsed into a `dict` by splitting on the first `=`. This dict is passed as `extra_vars` into `build()`.

---

## 2. The `build()` Function — Two-Pass Rendering

`build()` is the central engine. It has two modes controlled by `is_background`:

### Fast Pass (`is_background=False`)
Runs immediately on startup. It renders the document and, for each code block:
- If `--execute-codeblocks-on-startup` is **False**: emits an **Execute button card** (no execution happens).
- If `--execute-codeblocks-on-startup` is **True**: emits a **loading spinner card** and sets `md._needs_background_pass = True`.

After the fast pass completes and `OUTPUT_FILE` is written, if any spinners were emitted, a background thread is spawned for the slow pass.

### Slow Pass (`is_background=True`)
Runs in a daemon `threading.Thread`. Executes all code blocks, calls the LLM if needed, writes the final `OUTPUT_FILE`, then (in `--watch` mode) calls `trigger_reload()` to push a browser refresh via SSE.

### Document Parsing

```python
document = frontmatter.load(f)
global_vars = document.metadata.get("vars", {})
```

`python-frontmatter` strips the YAML header and returns `global_vars` (a plain dict) and `markdown_text` (the remaining body). CLI `extra_vars` are then merged **on top** of frontmatter vars, giving them higher priority.

### Jinja2 Interpolation

```python
env = jinja2.Environment(undefined=PassThroughUndefined)
markdown_text = env.from_string(markdown_text).render(**global_vars)
```

`PassThroughUndefined` is a custom Jinja2 `Undefined` subclass that returns `{{ varname }}` literally instead of raising an error. This means undefined variables are preserved as-is in the document rather than crashing the render.

---

## 3. The `ai_formatter` Hook

`ai_formatter` is registered as a custom fence handler via `pymdownx.superfences` for the `python`, `bash`, and `sh` languages. It is called once per code block during `md.convert()`.

### A. Shared Session

```python
options["session"] = "ai-shared-session"
```

All code blocks share the same `markdown-exec` session key. This makes the execution context behave like a REPL notebook — imports and variables from earlier blocks are visible in later blocks.

### B. Comment Parsing

The formatter scans the raw source line-by-line for two special comment patterns:

- `# Prompt: <text>` — extracts the LLM prompt.
- `# vars:` followed by indented `#   key: value` lines — extracts block-local YAML.

Both are stripped from the source before execution so they don't appear as code.

### C. Variable Merging & Jinja2 Interpolation

Block-local vars are parsed via `yaml.safe_load` and merged over the global vars dict. The merged set is then used to Jinja2-interpolate both the prompt string and the code source.

### D. Variable Injection (Python & Bash)

Rather than trying to manipulate `locals()`, variables are injected by prepending generated assignment statements to the source:

**Python:**
```python
ticker = __import__('json').loads('"GME"')
ai = __import__('json').loads('{"base_url": "..."}')
```

**Bash:**
```bash
export ticker='GME'
export ai='...'
```

This guarantees every variable is available as a native name in the execution scope.

### E. Block Registry

Before deciding what to render, every code block is written to the global `block_registry` dict keyed by its MD5 hash:

```python
source_hash = hashlib.md5((final_source + str(prompt_line)).encode()).hexdigest()
block_registry[source_hash] = { ... all block state ... }
```

This registry is what makes on-demand (button-click) execution possible — the FastAPI `/execute` endpoint looks up the hash and calls `execute_block(source_hash)` to run it later.

### F. Source Caching

```python
if source_hash in source_cache:
    return source_cache[source_hash]
```

If the exact same block (same code + same prompt) has already been executed in this session, the cached HTML result is returned immediately, skipping re-execution and LLM calls.

### G. Rendering Modes

| Condition | Output |
|---|---|
| Source already cached | Returns cached HTML immediately |
| `execute_on_startup=False` | Returns **Execute button** card; block registered for on-demand execution |
| Fast pass + `execute_on_startup=True` | Returns **spinner** card; sets `_needs_background_pass = True` |
| Background pass | Calls `execute_block()` → runs code → optionally calls LLM → returns HTML |

---

## 4. `execute_block()` — The Actual Runner

`execute_block(source_hash)` is called either by the background thread or by the FastAPI `/execute` endpoint. It:

1. Looks up the block state from `block_registry`.
2. Runs the source via `_run_python()` or `_run_bash()` (internal `markdown-exec` functions that return raw stdout).
3. If a `prompt_line` exists, computes an LLM payload hash (MD5 of prompt + stdout) and checks `llm_cache` before calling `ask_llm()`.
4. Renders the LLM's Markdown response to HTML, or falls back to `_format_python()` / `_format_bash()` for display-only execution.
5. Stores the result in `source_cache` and returns the HTML fragment.

---

## 5. `ask_llm()` — LLM Integration

Sends a structured prompt to any OpenAI-compatible `/v1/chat/completions` endpoint:

```
You are a helpful assistant.

The following is the output of an executed script:
```text
<raw_stdout>
```

Based on the output above, please address the following prompt:
<prompt>

Please respond using Markdown. Only output the final markdown response.
```

Config is read from the `ai` key in `merged_vars` (sourced from frontmatter or `-e` overrides):

| Key | Default | Description |
|---|---|---|
| `base_url` | `http://localhost:11434` | API base URL |
| `model` | `llama3` | Model name |
| `timeout` | `30s` | Request timeout (e.g. `120s` or `60`) |
| `verify_ssl` | `true` | SSL certificate verification |

---

## 6. The FastAPI Server

`start_server(port)` mounts `StaticFiles` (serving the temp directory containing `rendered_md.html`) and then starts `uvicorn` in a daemon thread:

```python
_api_app.mount("/", StaticFiles(directory=..., html=True), name="static")
threading.Thread(target=lambda: uvicorn.run(_api_app, ...), daemon=True).start()
```

> **Important:** `StaticFiles` must be mounted **after** all `@_api_app.post/get` routes are defined, otherwise the catch-all `/` mount intercepts everything.

### `/execute` — On-Demand Code Execution

```
POST /execute
Body: { "source_hash": "<md5>" }
Returns: text/html fragment
```

The browser's Execute button calls this endpoint. FastAPI looks up the hash in `block_registry`, calls `execute_block()`, and returns the rendered HTML. The browser replaces the card's `outerHTML` with the result.

### `/events` — SSE Live Reload

```
GET /events
Content-Type: text/event-stream
```

An `asyncio.Queue` is created per connection and appended to `_sse_queues`. When `trigger_reload()` is called from any background thread, it uses `asyncio.run_coroutine_threadsafe()` to safely enqueue a `"reload"` message into every active queue. The browser's `EventSource` listener calls `window.location.reload()` when it receives this message.

The event loop reference is captured at uvicorn startup:
```python
@_api_app.on_event("startup")
async def _capture_event_loop():
    global _event_loop
    _event_loop = asyncio.get_event_loop()
```

---

## 7. `serve_live()` — Watch Mode

```
start_server(port)
build(...)                    # initial render
threading.Thread(_watch)      # polls mtime every second
webbrowser.open(html_url)
while True: sleep(1)          # keep main thread alive
```

The `_watch` thread compares `os.path.getmtime(target_path)` every second. On change: calls `build()` (which overwrites `OUTPUT_FILE`), then `trigger_reload()` (which pushes SSE to all connected browsers).

---

## 8. HTML Output & Theming

The rendered HTML is a self-contained document with:

- **Roboto** font via Google Fonts.
- **github-markdown-css** for body typography.
- **Material Design CSS tokens** using `light-dark()` for automatic system-level dark/dark mode switching.
- **`@media (prefers-color-scheme: dark)`** fallback for older browsers.
- Inline `executeBlock(hash)` JS for button-triggered execution.
- Inline `EventSource('/events')` JS for SSE-based auto-reload.

---

## 9. Caching Summary

| Cache | Key | Stores | Cleared |
|---|---|---|---|
| `source_cache` | MD5(final_source + prompt) | Rendered HTML fragment | Never (per process) |
| `llm_cache` | MD5(prompt + raw_stdout) | LLM text response | Never (per process) |
| `block_registry` | MD5(final_source + prompt) | Full block state dict | Overwritten on each build |
| `_sessions_globals` | `"ai-shared-session"` | Python/bash exec globals | Cleared at start of each `build()` |
