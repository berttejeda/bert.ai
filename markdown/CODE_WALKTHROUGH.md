# Code Walkthrough: `render_md.py`

This document provides a technical walkthrough of how the `render_md.py` script functions internally.

## 1. Document Parsing & Global Setup

The script begins execution in the `render_markdown(md_file_path)` function.
Instead of relying on the standard Python `markdown` library to parse the raw text immediately, we use `python-frontmatter` to intercept the document.

```python
with open(md_file_path, "r", encoding="utf-8") as f:
    document = frontmatter.load(f)

global_vars = document.metadata.get("vars", {})
markdown_text = document.content
```
This cleanly strips the global YAML block (containing your `ai` settings and global vars) at the top of the file, storing it in `global_vars` and isolating the pure Markdown body into `markdown_text`.

We also force the environment variable `MARKDOWN_EXEC_AUTO = "python"` at the top of the script. This tells `markdown-exec` to bypass its strict requirement that every code block must have `exec="yes"`, enabling all Python blocks to be evaluated automatically.

## 2. Hooking into `markdown-exec`

The core magic relies on intercepting the Markdown conversion process. The Python `markdown` library supports an extension called `pymdownx.superfences`, which lets you define custom rendering logic for specific code fence languages.

```python
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
```
We register our custom function `ai_formatter` to handle all ````python```` blocks. The `validator` is the standard `markdown-exec` validator, but the `ai_formatter` is where our custom logic lives.

## 3. The `ai_formatter` Hook

Whenever the parser hits a Python code block, `ai_formatter(source, ...)` is called, where `source` is the raw Python code.

### A. Shared Sessions
```python
options["session"] = "ai-shared-session"
```
By forcing a shared session ID, `markdown-exec` will execute every Python block in the same `globals()` dictionary. This ensures that variables and functions defined in an earlier block are accessible in later blocks.

### B. Parsing Local Overrides
The formatter iterates line-by-line through the `source` code, looking for `# Prompt:` and `# vars:`. It safely strips these out so they don't interfere with standard Python execution, accumulating the local YAML variables into a string, which is then parsed via `yaml.safe_load`.

### C. Variable Injection
```python
injected_code = ""
for k, v in merged_vars.items():
    val_json = json.dumps(v)
    injected_code += f"{k} = __import__('json').loads('{val_json}')\n"
```
Instead of fighting with Python's internal `locals()` dictionaries, we dynamically generate a block of valid Python code assigning the JSON-encoded variables to their literal names. We prepend this code block directly to the user's `clean_source`. This makes all YAML variables instantly accessible within the code.

### D. Code Execution
```python
raw_stdout = _run_python(code=final_source, session=options["session"], id=options.get("id"))
```
We use `markdown-exec`'s internal `_run_python` function to evaluate the prepended source code. We use this specific internal method because it returns the raw `stdout` string of the execution, which is much cleaner to feed to the LLM than the pre-rendered HTML structure that `_format_python` typically returns.

### E. LLM Processing
If a `# Prompt:` was detected, we call the `ask_llm()` function.
```python
llm_response = ask_llm(
    prompt=prompt_line,
    code="\n".join(clean_source),
    raw_stdout=raw_stdout,
    ai_config=merged_vars.get("ai", {})
)
return markdown.markdown(llm_response, extensions=["fenced_code", "tables"])
```
The `ask_llm` function constructs a structured prompt payload and sends it to the `/v1/chat/completions` endpoint of the provided API (e.g., your local llama.cpp instance).

Crucially, the formatter **returns the recursively rendered Markdown of the LLM's response**. Because this formatter defines what HTML replaces the original ````python```` block, returning the LLM's output completely strips the original code from the final document, replacing it natively with the LLM's insights.

## 4. Final HTML Construction
Finally, `md.convert(markdown_text)` runs the entire process synchronously, block by block. The resulting `html_body` is wrapped in a clean, GitHub-styled HTML template string. We write this to a temporary file, and use the `webbrowser` library to automatically pop it open.
