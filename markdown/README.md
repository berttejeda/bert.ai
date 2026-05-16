# AI-Enabled Markdown Renderer

This project provides a standalone Python script (`render_md.py`) that converts Markdown files into rich HTML documents. It goes beyond standard Markdown conversion by treating Python code blocks as executable chunks and optionally sending their code and output to an LLM (Large Language Model) to generate dynamic, AI-assisted explanations and insights that seamlessly replace the code blocks in the final output.

## Key Features
- **Executable Code Blocks:** Python code blocks are executed locally, and their outputs can be displayed or piped into an LLM prompt.
- **LLM Integration:** Automatically contact a local or remote OpenAI-compatible API (such as `llama.cpp` or Ollama) to summarize, refactor, or explain code and its output.
- **Global & Local YAML Configuration:** Define variables natively in your Markdown document's YAML frontmatter, and dynamically override them via YAML-formatted comments directly inside your Python code blocks.
- **Variable Injection:** All YAML variables are automatically injected as native Python variables into the code's execution scope.
- **Persistent Global State:** Variables, imports, and function definitions persist across multiple code blocks within the same document, simulating an interactive notebook/REPL experience.
- **Beautiful HTML Output:** Automatically renders to a GitHub-styled HTML file and opens it natively in your default browser.

## Installation

Ensure you have Python installed, then install the required dependencies:

```bash
pip install markdown pymdown-extensions "markdown-exec[ansi]" python-frontmatter pyyaml requests
```

## Usage

Run the script by passing your target Markdown file as an argument:

```bash
python render_md.py my_document.md
```

### Writing Your Markdown File

The system expects standard Markdown, but it uses specific YAML patterns to provide context to the LLM and the Python environment.

#### 1. Global YAML Frontmatter
At the very top of your `.md` file, define your LLM settings and any global variables you want accessible by your code blocks:

```markdown
---
vars:
  my_global_variable: "Some value"
  ai:
    base_url: "https://ai.***REMOVED***"
    model: "gemma-4-E2B-it-uncensored-Q8_0:latest"
    timeout: 30s
    verify_ssl: true
---

# My Document
...
```

#### 2. AI-Enabled Code Blocks
To trigger the AI on a specific code block, start your Python block with a `# Prompt:` comment. You can also define local block-specific variables using a `# vars:` block.

```python
# Prompt: Analyze the JSON output and tell me the most active user.
# vars:
#   users_endpoint: "https://api.example.com/users"
import requests

# 'users_endpoint' and 'my_global_variable' are automatically injected and available here!
response = requests.get(users_endpoint)
print(response.json())
```

When you render the file, the script will:
1. Execute the `requests.get()` call.
2. Capture the printed JSON output.
3. Send the Prompt, Code, and JSON Output to the LLM.
4. Replace the code block entirely with the LLM's Markdown response in the final HTML document!

## How it works
Check out the `CODE_WALKTHROUGH.md` for a detailed breakdown of the internal logic, specifically how `markdown-exec` and `pymdownx.superfences` are hooked to achieve this behavior.
