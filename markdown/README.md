# AI-Enabled Markdown Renderer

`render_md.py` converts Markdown files into interactive, AI-augmented HTML documents. Code blocks (`python`, `bash`, `sh`) are executed locally, their output can be piped to an LLM, and the rendered page updates live — all served from a single built-in HTTP server with no external dependencies beyond Python.

## Key Features

| Feature | Description |
|---|---|
| **Executable Code Blocks** | `python`, `bash`, and `sh` fences are executed in-process |
| **LLM Integration** | Any OpenAI-compatible API (Ollama, llama.cpp, remote) can post-process output |
| **Jinja2 Templating** | Variables from frontmatter and CLI are interpolated in the document *and* inside code blocks before execution |
| **On-Demand Execution** | By default, code blocks render with an **Execute** button; execution only happens when clicked |
| **Auto-Execute Mode** | Pass `--execute-codeblocks-on-startup` to execute all blocks on load |
| **Two-Pass Async Rendering** | Fast initial render (instant page load) followed by a background pass that executes blocks and refreshes via SSE |
| **Source & LLM Caching** | MD5-based caching skips re-execution and redundant LLM calls when inputs haven't changed |
| **Live Watch Mode** | `--watch` polls the source file for changes, rebuilds, and pushes an SSE reload to all connected browsers |
| **Extra Variables (CLI)** | `-e key=value` pairs override frontmatter vars at runtime (e.g. secrets, tickers, tokens) |
| **Material Design UI** | Adaptive light/dark theme using CSS `light-dark()` and Material Design tokens |
| **Single-Port Server** | FastAPI serves the HTML *and* the `/execute` API on one port — no CORS complications |

---

## Installation

```bash
pip install -r requirements.txt
```

Or manually:

```bash
pip install "fastapi[standard]" uvicorn markdown pymdown-extensions \
  "markdown-exec[ansi]" python-frontmatter pyyaml requests jinja2
```

---

## Usage

### Basic render (open in browser, click Execute to run blocks)
```bash
python render_md.py my_document.md
```

### Auto-execute all code blocks on load
```bash
python render_md.py my_document.md --execute-codeblocks-on-startup
```

### Watch mode (rebuilds and reloads browser on file save)
```bash
python render_md.py my_document.md --watch
```

### Inject runtime variables (override frontmatter)
```bash
python render_md.py my_document.md \
  -e token=glsa_abc123 \
  -e ticker=TSLA
```
Multiple `-e` flags are supported. Values take priority over anything defined in the YAML frontmatter.

### Custom port
```bash
python render_md.py my_document.md --port 8080
```

### Debug mode (prints the exact code sent to execution)
```bash
python render_md.py my_document.md --debug
```

### Override LLM timeout
```bash
python render_md.py my_document.md --timeout 60
```

---

## Writing Your Markdown File

### 1. YAML Frontmatter — Global Variables & AI Config

Place a YAML block at the very top of your `.md` file:

```yaml
---
vars:
  ticker: "GME"
  myvar: "some value"
  ai:
    base_url: "https://ai.example.com"
    model: "llama3"
    timeout: 120s
    verify_ssl: true
---
```

All keys under `vars` become available as Jinja2 template variables throughout the document and as native variables injected into every code block's execution scope.

### 2. Jinja2 Templating in the Document Body

Use `{{ variable }}` syntax anywhere in headings, paragraphs, or code blocks:

```markdown
## Price Analysis for {{ ticker }}
```

If a variable is not defined, it is left as a literal `{{ variable }}` string rather than raising an error.

### 3. AI-Enabled Code Blocks

Add a `# Prompt:` comment at the top of any `python`, `bash`, or `sh` fence:

````markdown
```bash
# Prompt: Summarize the moving average trend for {{ ticker }}.
grafana-query --token {{ token }} -q stocksDashboard.prma -e ticker={{ ticker }}
```
````

For multiline prompts, wrap the prompt in `# BeginPrompt` and `# EndPrompt` markers:

````markdown
```bash
# BeginPrompt
# Review the {{ ticker }} price moving averages and make a statement about the price.
# Is this a good time to buy or sell?
# EndPrompt
grafana-query --token {{ token }} -q stocksDashboard.prma -e ticker={{ ticker }}
```
````

When executed, the script will:
1. Interpolate all `{{ }}` variables.
2. Run the code and capture stdout.
3. Send the prompt + output to the LLM.
4. Replace the code block in the HTML with the LLM's Markdown response.

### 4. Global-Scope Blocks

Wrap a code block in a `<span data-scope="global">` to make it a **global-scope block**. When executed, the block gathers the raw stdout **and** LLM responses from every previously executed block and includes them as prior context in its prompt:

````markdown
<span data-scope="global" class="prompt-code-block">

```bash
# BeginPrompt
# Summarize all findings from the document.
# EndPrompt
```

</span>
````

By default, a global block **requires all prior blocks to have been executed first**. To relax this, add `data-require-prior="false"`:

````markdown
<span data-scope="global" data-require-prior="false" class="prompt-code-block">

```bash
# Prompt: Give a partial summary based on whatever data is available so far.
```

</span>
````

### 5. Block-Level Variable Overrides

Override or add variables for a single block using `# vars:` YAML comments:

````markdown
```python
# Prompt: Analyze these results.
# vars:
#   endpoint: "https://api.example.com/v2/data"
import requests
print(requests.get(endpoint).json())
```
````

Block-level vars are merged on top of global vars, scoped to that block only.

---

## Server Endpoints

When `render_md.py` is running, the following endpoints are available at `http://localhost:5500` (or your configured `--port`):

| Endpoint | Method | Description |
|---|---|---|
| `/rendered_md.html` | `GET` | The rendered document |
| `/execute` | `POST` | Execute a code block by `source_hash`; returns HTML |
| `/events` | `GET` | SSE stream — browser reloads on `reload` message |
| `/docs` | `GET` | FastAPI auto-generated Swagger UI for the API |

---

## How It Works

See [`CODE_WALKTHROUGH.md`](CODE_WALKTHROUGH.md) for a deep-dive into the internal architecture.
