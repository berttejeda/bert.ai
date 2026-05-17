"""
AI-Enabled Markdown Renderer

This script reads a Markdown file, executes its Python code blocks, and uses an LLM 
to process the code and its execution output based on embedded prompts. It supports 
both global and block-level variables via YAML frontmatter, maintains a persistent 
Python execution session across the document, and finally renders everything into 
a beautiful HTML file that automatically opens in your browser.

Dependencies:
    pip install markdown pymdown-extensions "markdown-exec[ansi]" python-frontmatter pyyaml requests
"""
import sys
import os
import re
import json
import yaml
import tempfile
import webbrowser
import frontmatter
import markdown
import requests
import hashlib
import argparse
import shlex
import jinja2
import threading
import html
import traceback

import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

class PassThroughUndefined(jinja2.Undefined):
    def __str__(self):
        return f"{{{{ {self._undefined_name} }}}}"

os.environ["MARKDOWN_EXEC_AUTO"] = "python,bash,sh"

from markdown_exec._internal.main import validator
from markdown_exec._internal.formatters.python import _format_python, _run_python, _sessions_globals
from markdown_exec._internal.formatters.bash import _format_bash, _run_bash

OUTPUT_FILE = os.path.join(tempfile.gettempdir(), 'rendered_md.html')
llm_cache = {}
source_cache = {}
block_registry = {}

def execute_block(source_hash):
    block = block_registry.get(source_hash)
    if not block:
        return "<div class='mui-card-content' style='color: red;'>Block not found in registry.</div>"
        
    language = block["language"]
    final_source = block["final_source"]
    prompt_line = block["prompt_line"]
    clean_source_str = block["clean_source"]
    merged_vars = block["merged_vars"]
    cli_timeout = block["cli_timeout"]
    options = block["options"]
    md = block["md"]
    debug = block["debug"]

    if debug:
        print("\n" + "="*40)
        print(f"DEBUG: Executing {language} code block")
        print("="*40)
        print(final_source)
        print("="*40 + "\n")

    try:
        if language == "python":
            raw_stdout = _run_python(code=final_source, session=options.get("session"), id=options.get("id"))
        elif language in ("bash", "sh"):
            raw_stdout = _run_bash(code=final_source, session=options.get("session"), id=options.get("id"))
        else:
            raw_stdout = ""
    except Exception as e:
        raw_stdout = f"Execution Error: {e}"
        
    if prompt_line:
        payload = prompt_line + raw_stdout
        payload_hash = hashlib.md5(payload.encode('utf-8')).hexdigest()
        
        if payload_hash in llm_cache:
            llm_response = llm_cache[payload_hash]
        else:
            llm_response = ask_llm(
                prompt=prompt_line,
                code=clean_source_str,
                raw_stdout=raw_stdout,
                ai_config=merged_vars.get("ai", {}),
                cli_timeout=cli_timeout
            )
            llm_cache[payload_hash] = llm_response
            
        final_html = markdown.markdown(llm_response, extensions=["fenced_code", "tables"])
    else:
        if language == "python":
            final_html = _format_python(code=final_source, md=md, **options)
        elif language in ("bash", "sh"):
            final_html = _format_bash(code=final_source, md=md, **options)
        else:
            final_html = ""
            
    source_cache[source_hash] = final_html
    return final_html

# ---------------------------------------------------------------------------
# FastAPI unified server – serves /execute, /events (SSE), and static HTML
# all on one port, eliminating any CORS concerns.
# ---------------------------------------------------------------------------
import asyncio
_api_app = FastAPI(title="render_md")
_sse_queues: list = []
_event_loop: asyncio.AbstractEventLoop | None = None

class ExecuteRequest(BaseModel):
    source_hash: str

@_api_app.post("/execute", response_class=HTMLResponse)
def api_execute(req: ExecuteRequest):
    if req.source_hash not in block_registry:
        raise HTTPException(status_code=404, detail="Block not found")
    try:
        return HTMLResponse(content=execute_block(req.source_hash))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@_api_app.get("/events")
async def sse_events():
    """Server-Sent Events stream used by --watch mode for live page reloads."""
    q: asyncio.Queue = asyncio.Queue()
    _sse_queues.append(q)
    async def stream():
        try:
            yield "data: connected\n\n"
            while True:
                msg = await q.get()
                yield f"data: {msg}\n\n"
        finally:
            _sse_queues.remove(q)
    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@_api_app.on_event("startup")
async def _capture_event_loop():
    global _event_loop
    _event_loop = asyncio.get_event_loop()

def trigger_reload():
    """Signal all connected SSE clients to reload the page (called from a background thread)."""
    if _event_loop and _sse_queues:
        for q in list(_sse_queues):
            asyncio.run_coroutine_threadsafe(q.put("reload"), _event_loop)

def start_server(port: int = 5500):
    """Start the unified FastAPI server (static files + API) in a background daemon thread."""
    # StaticFiles must be mounted AFTER all routes are defined
    _api_app.mount("/", StaticFiles(directory=os.path.dirname(OUTPUT_FILE), html=True), name="static")
    def _run():
        uvicorn.run(_api_app, host="0.0.0.0", port=port, log_level="warning")
    threading.Thread(target=_run, daemon=True).start()
    # Small grace period so the server is ready before the browser opens
    time.sleep(0.8)
    print(f"Server running at http://localhost:{port}")


def ask_llm(prompt, code, raw_stdout, ai_config, cli_timeout=None):
    """Sends the prompt, code, and stdout to the configured LLM API (Ollama by default)."""
    base_url = ai_config.get("base_url", "http://localhost:11434").rstrip("/")
    model = ai_config.get("model", "llama3")
    verify_ssl = ai_config.get("verify_ssl", True)
    
    if cli_timeout is not None:
        timeout_sec = float(cli_timeout)
    else:
        timeout = ai_config.get("timeout", "30s")
        timeout_sec = 30
        if isinstance(timeout, str) and timeout.endswith("s"):
            timeout_sec = int(timeout[:-1])
        elif isinstance(timeout, (int, float)):
            timeout_sec = float(timeout)

    # Build the full prompt
    full_prompt = f"""You are a helpful assistant. 

The following is the output of an executed script:
```text
{raw_stdout}
```

Based on the output above, please address the following prompt:
{prompt}

Please respond using Markdown. Only output the final markdown response.
"""

    print(f"--> Sending request to LLM ({model}) at {base_url}...")
    try:
        response = requests.post(
            f"{base_url}/v1/chat/completions",
            headers={"Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "user", "content": full_prompt}
                ]
            },
            verify=verify_ssl,
            timeout=timeout_sec
        )
        response.raise_for_status()
        result = response.json()
        print("<-- Received response from LLM")
        return result["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"Error communicating with LLM: {e}", file=sys.stderr)
        return f"**Error from LLM:** `{e}`"


def build(md_file_path, cli_timeout=None, debug=False, is_background=False, execute_on_startup=False, extra_vars=None):
    """
    Reads a Markdown file, processes it with custom extensions, and renders it as HTML.
    
    Args:
        md_file_path (str): The absolute or relative path to the Markdown file.
        cli_timeout (int, optional): Override LLM API timeout.
        debug (bool): If True, prints extra debugging information like the executed code.
        is_background (bool): If True, it performs the slow execution pass.
        execute_on_startup (bool): If False, codeblocks require a manual button click to run.
        extra_vars (dict, optional): Extra variables passed via -e key=value on the CLI.
                                     These take priority over frontmatter vars.
    """
    if is_background:
        print(f"Running background processing for {md_file_path}...")
    else:
        print(f"Rebuilding {md_file_path} (fast pass)...")
    
    # Clear the shared session so variables from the previous build don't leak into the new one
    _sessions_globals.pop("ai-shared-session", None)
    
    with open(md_file_path, "r", encoding="utf-8") as f:
        document = frontmatter.load(f)

    global_vars = document.metadata.get("vars", {})
    
    # CLI extra_vars override frontmatter vars
    if extra_vars:
        global_vars.update(extra_vars)
        if debug:
            print(f"DEBUG: Merged extra_vars into global_vars: {extra_vars}")

    markdown_text = document.content

    # Interpolate global variables into the markdown text
    env = jinja2.Environment(undefined=PassThroughUndefined)
    markdown_text = env.from_string(markdown_text).render(**global_vars)

    def ai_formatter(source, language, css_class, options, md, **kwargs):
        """
        Custom formatter hook for markdown-exec.
        
        Intercepts Python code blocks to:
        1. Parse block-level variables and AI prompts from comments.
        2. Merge block variables with global variables.
        3. Inject variables directly into the Python execution scope.
        4. Execute the code to capture standard output.
        5. Invoke the LLM if a prompt is found, replacing the block with the LLM's response.
        """
        # Enforce global persistent state across all code blocks so variables/imports are shared
        options["session"] = "ai-shared-session"
        
        local_vars_yaml = ""
        prompt_line = None
        clean_source = []
        
        in_vars = False
        for line in source.split("\n"):
            if line.startswith("# Prompt:"):
                prompt_line = line.replace("# Prompt:", "").strip()
            elif line.startswith("# vars:"):
                in_vars = True
                local_vars_yaml += line.strip("# ") + "\n"
            elif in_vars and line.startswith("#   "):
                local_vars_yaml += line.strip("# ") + "\n"
            elif in_vars and not line.startswith("#"):
                in_vars = False
                clean_source.append(line)
            else:
                clean_source.append(line)
                
        # Merge variables
        print(f"Parsed prompt line: {prompt_line}")
        merged_vars = global_vars.copy()
        if local_vars_yaml:
            try:
                local_vars = yaml.safe_load(local_vars_yaml).get("vars", {})
                if local_vars:
                    merged_vars.update(local_vars)
            except Exception as e:
                print(f"Warning: Failed to parse local vars: {e}", file=sys.stderr)

        # Interpolate variables into prompt and code
        env = jinja2.Environment(undefined=PassThroughUndefined)
        if prompt_line:
            prompt_line = env.from_string(prompt_line).render(**merged_vars)
            
        clean_source_str = "\n".join(clean_source)
        clean_source_str = env.from_string(clean_source_str).render(**merged_vars)
        clean_source = clean_source_str.split("\n")

        # Inject variables as Python code or bash exports at the top of the executed script
        injected_code = ""
        for k, v in merged_vars.items():
            if language == "python":
                val_json = json.dumps(v)
                injected_code += f"{k} = __import__('json').loads('{val_json}')\n"
            elif language in ("bash", "sh"):
                val_sh = shlex.quote(str(v))
                injected_code += f"export {k}={val_sh}\n"
            
        final_source = injected_code + "\n".join(clean_source)
        
        if debug and not is_background:
            print("\n" + "="*40)
            print(f"DEBUG: Executing {language} code block")
            print("="*40)
            print(final_source)
            print("="*40 + "\n")
            
        source_hash = hashlib.md5((final_source + str(prompt_line)).encode('utf-8')).hexdigest()
        
        block_registry[source_hash] = {
            "source": source,
            "language": language,
            "final_source": final_source,
            "prompt_line": prompt_line,
            "clean_source": clean_source_str,
            "merged_vars": merged_vars,
            "cli_timeout": cli_timeout,
            "options": options,
            "md": md,
            "debug": debug
        }
        
        if source_hash in source_cache:
            return source_cache[source_hash]
            
        if not execute_on_startup:
            code_html = f"<pre><code class=\"language-{language}\">{html.escape(source)}</code></pre>"
            return f"""
            <div class="mui-card" id="block-{source_hash}">
                <div class="mui-card-content">
                    <span class="mui-card-title">Pending Execution</span>
                    {code_html}
                </div>
                <div class="mui-card-actions">
                    <button class="mui-btn mui-btn-primary" onclick="executeBlock('{source_hash}')">
                        EXECUTE
                    </button>
                </div>
            </div>
            """
            
        if not is_background:
            md._needs_background_pass = True
            return f"""
            <div class="mui-card loading" id="block-{source_hash}">
                <div class="mui-card-content" style="display: flex; align-items: center;">
                    <div class="mui-spinner"></div>
                    <strong style="margin-left: 15px;">Executing code and generating insights...</strong>
                </div>
            </div>
            """
            
        return execute_block(source_hash)

    # Initialize markdown with our custom formatter
    md = markdown.Markdown(
        extensions=["pymdownx.superfences", "tables"],
        extension_configs={
            "pymdownx.superfences": {
                "custom_fences": [
                    {
                        "name": "python",
                        "class": "python",
                        "validator": validator,
                        "format": ai_formatter,
                    },
                    {
                        "name": "bash",
                        "class": "bash",
                        "validator": validator,
                        "format": ai_formatter,
                    },
                    {
                        "name": "sh",
                        "class": "sh",
                        "validator": validator,
                        "format": ai_formatter,
                    }
                ]
            }
        }
    )

    md._needs_background_pass = False

    print("Converting Markdown to HTML and executing code blocks...")
    html_body = md.convert(markdown_text)

    # Wrap it in a beautiful HTML skeleton
    html_document = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="color-scheme" content="light dark"> 
        <title>AI Executable Markdown</title>
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.2.0/github-markdown.min.css">
        <style>
            :root {{
                /* Material Design 2/3 Color Tokens */
                --primary: #6200ee;
                --on-primary: #ffffff;
                
                /* light-dark(light_value, dark_value) handles the switch automatically */
                --background: light-dark(#fafafa, #121212);
                --surface: light-dark(#ffffff, #1e1e1e);
                --on-surface: light-dark(#000000, #e1e1e1);
                --elevation-1: light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.05));
                --elevation-card: light-dark(rgba(0,0,0,0.12), rgba(0,0,0,0.3));
                --border-color: light-dark(rgba(0,0,0,0.12), rgba(255,255,255,0.12));
            }}

            /* Fallback for older browsers without light-dark() support */
            @media (prefers-color-scheme: dark) {{
                :root {{
                    --background: #121212;
                    --surface: #1e1e1e;
                    --on-surface: #e1e1e1;
                    --elevation-1: rgba(255,255,255,0.05);
                    --elevation-card: rgba(0,0,0,0.3);
                    --border-color: rgba(255,255,255,0.12);
                }}
            }}

            @keyframes spin {{
                0% {{ transform: rotate(0deg); }}
                100% {{ transform: rotate(360deg); }}
            }}
            body {{
                font-family: 'Roboto', system-ui, sans-serif;
                box-sizing: border-box;
                min-width: 200px;
                max-width: 980px;
                margin: 0 auto;
                padding: 45px;
                background-color: var(--background);
                color: var(--on-surface);
                transition: background-color 0.3s ease;
            }}
            .markdown-body {{
                background: var(--surface);
                color: var(--on-surface);
                padding: 45px;
                border-radius: 4px;
                box-shadow: 0 1px 3px var(--elevation-card), 0 1px 2px var(--elevation-card);
            }}
            .mui-card {{
                background-color: var(--surface);
                border-radius: 12px;
                box-shadow: 0 4px 6px var(--elevation-card);
                margin: 20px 0;
                overflow: hidden;
            }}
            .mui-card-content {{
                padding: 16px;
            }}
            .mui-card-title {{
                font-size: 1.25rem;
                font-weight: 500;
                margin-bottom: 12px;
                display: block;
                color: var(--primary);
            }}
            .mui-card-actions {{
                padding: 8px;
                border-top: 1px solid var(--border-color);
                display: flex;
                justify-content: flex-end;
            }}
            .mui-btn {{
                background-color: var(--primary);
                color: var(--on-primary);
                padding: 0.75rem 1.5rem;
                font-size: 0.875rem;
                min-width: 64px;
                box-sizing: border-box;
                font-weight: 500;
                border-radius: 8px;
                text-transform: uppercase;
                letter-spacing: 1px;
                cursor: pointer;
                border: none;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                transition: filter 0.3s ease, box-shadow 0.3s ease;
            }}
            .mui-btn-primary:hover {{
                filter: brightness(1.1);
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            }}
            .mui-spinner {{
                border: 3px solid rgba(98, 0, 238, 0.2);
                border-top: 3px solid var(--primary);
                border-radius: 50%;
                width: 24px;
                height: 24px;
                animation: spin 1s linear infinite;
            }}
            @media (max-width: 767px) {{
                .markdown-body {{
                    padding: 15px;
                }}
            }}
            .prompt-code-block {{
                border-left: 4px solid var(--primary);
                padding-left: 10px;
                display: block;
            }}
        </style>
        <script>
        async function executeBlock(sourceHash) {{
            const blockEl = document.getElementById(`block-${{sourceHash}}`);
            if (!blockEl) return;
            
            blockEl.innerHTML = `
                <div class="mui-card-content" style="display: flex; align-items: center;">
                    <div class="mui-spinner"></div>
                    <strong style="margin-left: 15px;">Executing code and generating insights...</strong>
                </div>
            `;
            
            try {{
                const response = await fetch('/execute', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({{ source_hash: sourceHash }})
                }});
                
                if (response.ok) {{
                    const html = await response.text();
                    blockEl.outerHTML = html;
                }} else {{
                    blockEl.innerHTML = `<div class="mui-card-content" style="color: red;">Execution failed.</div>`;
                }}
            }} catch (e) {{
                blockEl.innerHTML = `<div class="mui-card-content" style="color: red;">Error: ${{e.message}}. Is the API server running?</div>`;
            }}
        }}
        </script>
        <script>
        // SSE-based live-reload (active when running with --watch)
        const _evtSrc = new EventSource('/events');
        _evtSrc.onmessage = (e) => {{ if (e.data === 'reload') window.location.reload(); }};
        </script>
    </head>
    <body class="markdown-body">
        {html_body}
    </body>
    </html>
    """

    # Save the file
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(html_document)
    print(f"Build complete. Saved to {OUTPUT_FILE}")
    
    if not is_background and getattr(md, '_needs_background_pass', False):
        print("Starting background execution pass...")
        threading.Thread(target=build, args=(md_file_path, cli_timeout, debug, True, execute_on_startup, extra_vars), daemon=True).start()

def serve_live(target_path, cli_timeout=None, debug=False, execute_on_startup=False, extra_vars=None, port=5500):
    """
    Starts the unified server, performs an initial build, then watches the
    source Markdown file for changes and triggers a browser reload via SSE.
    """
    start_server(port)
    build(target_path, cli_timeout, debug, execute_on_startup=execute_on_startup, extra_vars=extra_vars)

    def _watch():
        last_mtime = os.path.getmtime(target_path)
        while True:
            time.sleep(1)
            try:
                mtime = os.path.getmtime(target_path)
                if mtime != last_mtime:
                    last_mtime = mtime
                    build(target_path, cli_timeout, debug, execute_on_startup=execute_on_startup, extra_vars=extra_vars)
                    trigger_reload()
            except Exception as e:
                print(f"Watch error: {e}", file=sys.stderr)

    threading.Thread(target=_watch, daemon=True).start()
    html_url = f"http://localhost:{port}/rendered_md.html"
    print(f"Watching {target_path} — {html_url} (Ctrl+C to quit)")
    webbrowser.open(html_url)
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Render Markdown with AI Insights and Live-Reload.")
    parser.add_argument("file", nargs="?", default="hello-world-python.md", help="The Markdown file to render (default: hello-world-python.md).")
    parser.add_argument("--watch", "-w", action="store_true", help="Enable live-reload server to automatically rebuild on file changes.")
    parser.add_argument("--timeout", type=int, help="Override LLM API timeout in seconds.")
    parser.add_argument("--debug", "-d", action="store_true", help="Print debug information like the executed code blocks.")
    parser.add_argument("--execute-codeblocks-on-startup", action="store_true", help="Execute codeblocks automatically on startup")
    parser.add_argument("--extra-vars", "-e", action="append", metavar="KEY=VALUE",
                        help="Extra variables to inject (overrides frontmatter), e.g. -e token=abc -e ticker=GME",
                        default=[])
    parser.add_argument("--port", type=int, default=5500, help="Port for the HTTP server (default: 5500).")
    
    args = parser.parse_args()

    # Parse -e key=value pairs into a dict
    extra_vars = {}
    for item in args.extra_vars:
        if "=" in item:
            k, v = item.split("=", 1)
            extra_vars[k.strip()] = v.strip()
        else:
            print(f"Warning: ignoring malformed --extra-vars entry '{item}' (expected key=value)", file=sys.stderr)

    target_path = os.path.abspath(args.file)
    if not os.path.exists(target_path):
        print(f"Error: Could not find file {target_path}", file=sys.stderr)
        sys.exit(1)
        
    if args.watch:
        serve_live(target_path, args.timeout, args.debug, args.execute_codeblocks_on_startup,
                   extra_vars=extra_vars, port=args.port)
    else:
        start_server(args.port)
        build(target_path, args.timeout, args.debug, execute_on_startup=args.execute_codeblocks_on_startup, extra_vars=extra_vars)
        html_url = f"http://localhost:{args.port}/rendered_md.html"
        print(f"Serving at {html_url} (Ctrl+C to quit)")
        webbrowser.open(html_url)
        try:
            while True: time.sleep(1)
        except KeyboardInterrupt:
            pass
