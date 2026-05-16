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

from livereload import Server

os.environ["MARKDOWN_EXEC_AUTO"] = "python"

from markdown_exec._internal.main import validator
from markdown_exec._internal.formatters.python import _format_python, _run_python, _sessions_globals

OUTPUT_FILE = os.path.join(tempfile.gettempdir(), 'rendered_md.html')
llm_cache = {}

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


def build(md_file_path, cli_timeout=None):
    """
    Reads a Markdown file, processes it with custom extensions, and renders it as HTML.
    
    Args:
        md_file_path (str): The absolute or relative path to the Markdown file.
    """
    print(f"Rebuilding {md_file_path}...")
    
    # Clear the shared session so variables from the previous build don't leak into the new one
    _sessions_globals.pop("ai-shared-session", None)
    
    with open(md_file_path, "r", encoding="utf-8") as f:
        document = frontmatter.load(f)

    global_vars = document.metadata.get("vars", {})
    markdown_text = document.content

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

        # Inject variables as Python code at the top of the executed script
        injected_code = ""
        for k, v in merged_vars.items():
            val_json = json.dumps(v)
            injected_code += f"{k} = __import__('json').loads('{val_json}')\n"
            
        final_source = injected_code + "\n".join(clean_source)
        
        # We need raw stdout for the LLM!
        # _run_python gives us the raw stdout text, while _format_python returns HTML.
        try:
            raw_stdout = _run_python(code=final_source, session=options["session"], id=options.get("id"))
        except Exception as e:
            raw_stdout = f"Execution Error: {e}"
        
        if prompt_line:
            clean_source_str = "\n".join(clean_source)
            # We cache the LLM response because it's slow, whereas local python execution is fast.
            # We hash the prompt and the stdout so that changes to the Python code don't invalidate the cache if the output is identical
            payload = prompt_line + raw_stdout
            payload_hash = hashlib.md5(payload.encode('utf-8')).hexdigest()
            
            if payload_hash in llm_cache:
                llm_response = llm_cache[payload_hash]
            else:
                # Pass the merged_vars (which contains ai settings like model/url) to the LLM
                llm_response = ask_llm(
                    prompt=prompt_line,
                    code=clean_source_str,
                    raw_stdout=raw_stdout,
                    ai_config=merged_vars.get("ai", {}),
                    cli_timeout=cli_timeout
                )
                llm_cache[payload_hash] = llm_response
                
            # Render the LLM's response into HTML instead of the code block
            return markdown.markdown(llm_response, extensions=["fenced_code", "tables"])
        
        # Fallback: Just return normal HTML execution output using markdown-exec
        return _format_python(code=final_source, md=md, **options)

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
                    }
                ]
            }
        }
    )

    print("Converting Markdown to HTML and executing code blocks...")
    html_body = md.convert(markdown_text)

    # Wrap it in a beautiful HTML skeleton
    html_document = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Executable Markdown</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.2.0/github-markdown.min.css">
        <style>
            body {{
                box-sizing: border-box;
                min-width: 200px;
                max-width: 980px;
                margin: 0 auto;
                padding: 45px;
            }}
            .prompt-code-block {{
                border-left: 4px solid #0366d6;
                padding-left: 10px;
                display: block;
            }}
        </style>
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

def serve_live(target_path, cli_timeout=None):
    """
    Starts a Live-Reload server watching the target Markdown file.
    """
    # Perform initial build
    build(target_path, cli_timeout)
    
    server = Server()
    # Watch the markdown file and rebuild when it changes
    server.watch(target_path, lambda: build(target_path, cli_timeout))
    
    # Auto-open browser
    webbrowser.open("http://localhost:5500/rendered_md.html")
    
    print(f"Starting Live-Reload server at http://localhost:5500 ...")
    # Serve the temporary directory where OUTPUT_FILE resides
    # livereload will inject its refresh script automatically!
    server.serve(root=os.path.dirname(OUTPUT_FILE), port=5500)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Render Markdown with AI Insights and Live-Reload.")
    parser.add_argument("file", nargs="?", default="hello-world-python.md", help="The Markdown file to render (default: hello-world-python.md).")
    parser.add_argument("--watch", "-w", action="store_true", help="Enable live-reload server to automatically rebuild on file changes.")
    parser.add_argument("--timeout", type=int, help="Override LLM API timeout in seconds.")
    
    args = parser.parse_args()
    
    target_path = os.path.abspath(args.file)
    if not os.path.exists(target_path):
        print(f"Error: Could not find file {target_path}", file=sys.stderr)
        sys.exit(1)
        
    if args.watch:
        serve_live(target_path, args.timeout)
    else:
        build(target_path, args.timeout)
        print(f"Success! Opening {OUTPUT_FILE} in browser...")
        webbrowser.open(f"file://{OUTPUT_FILE}")
