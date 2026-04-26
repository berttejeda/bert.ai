#!/usr/bin/env python

# import necessary modules
import argparse
import base64
import http.client
import json
import os
from pathlib import Path
import requests
import sys
from typing import List, Optional

from btconfig import Config
from first import first
from loguru import logger

try:
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

__docstring__ = 'Commandline AI Prompt Interface'
__version__ = "1.0.0"

script_file_path = Path(__file__).resolve()
script_dir = script_file_path.parent
script_parent_dir = script_dir.parent

from bt_utils import CredentialResolver, RequiredCredentialMissingError

# Initialize logger
logger = logger.patch(lambda record: record.update(name="ai.prompt"))

# Initialize the credential resolver
credential_resolver = CredentialResolver(logger=logger)

def parse_args():
    parser = argparse.ArgumentParser(description="Commandline AI Prompt Interface")
    parser.add_argument('--text', '-t', help='Text to summarize (also accepts piped input via stdin)')
    parser.add_argument('--text-file', '-f', help='File containing text to summarize')
    parser.add_argument('--config', '-c', help='Configuration file path')
    parser.add_argument('--task', help='Task to perform (required unless --webhook-mode)')
    parser.add_argument('--prompt-context', '-x', help='Custom prmpt context for AI interaction')
    parser.add_argument('--webhook-mode', action='store_true', help='Run as FastAPI server; accept POST /api/v1/prompt with JSON body {message, task}')
    parser.add_argument('--webhook-port', type=int, default=2048, help='Port for webhook server (default: 2048)')
    parser.add_argument('--ai-api-url', default=os.environ.get('OLLAMA_API_URL'), help='AI API URL')
    parser.add_argument('--ai-model', default="gpt-4o-mini", help='AI Model')
    parser.add_argument('--provider', choices=['ollama', 'openai'], default=None, help='AI provider: ollama (no auth) or openai (OAuth-protected)')
    parser.add_argument('--token-url', help='OAuth token URL')
    parser.add_argument('--client-id', help='OAuth Client ID')
    parser.add_argument('--client-secret', help='OAuth Client Secret')
    parser.add_argument('--app-key', help='Application Key')
    parser.add_argument('--extra-vars', '-e', action='append', help='Specify extra variables for config template as -e key=value pairs (can be specified multiple times)', default=[])
    parser.add_argument('--output', '-o', help='Output file path (default: stdout)')
    parser.add_argument('--verify-tls', action='store_true', help='Verify TLS certificates')
    parser.add_argument('--debug', '-D', action='store_true', help='Enable debug logging')
    parser.add_argument('--verbose', '-v', action='store_true', help='Enable verbose output')
    parser.add_argument(
        '--version',
        action='version',
        version=f'%(prog)s {__version__}'
    )    
    return parser.parse_args()


def parse_extra_vars(extra_vars_list):
    """
    Parse extra vars from a list of key=value strings into a dictionary.
    
    Args:
        extra_vars_list: List of strings in format "key=value"
    
    Returns:
        Dictionary of parsed key-value pairs
    """
    extra_vars_dict = {}
    if extra_vars_list:
        for var in extra_vars_list:
            if '=' not in var:
                logger.warning(f"Ignoring malformed extra-var: {var} (expected format: key=value)")
                continue
            key, value = var.split('=', 1)  # Split on first '=' only
            extra_vars_dict[key.strip()] = value.strip()
    return extra_vars_dict

def load_config_from_args(args):
    """
    Load and resolve configuration from CLI args (config file, credentials, validation).
    Returns (config, ai_model, verify_tls).
    """
    extra_vars = parse_extra_vars(args.extra_vars)
    if 'USER' not in extra_vars and os.environ.get('USER'):
        extra_vars['USER'] = os.environ.get('USER')

    config_file = first([
        args.config,
        f'{script_dir}/config.yaml',
        os.environ.get('OLLAMA_CONFIG_FILE')
    ])
    if not config_file:
        logger.error("No configuration file specified!")
        sys.exit(1)
    try:
        config = Config(
            config_file_uri=config_file,
            templatized=True,
            initial_data=extra_vars
        ).read()
    except Exception as e:
        logger.error(f"Failed to load configuration: {e}")
        sys.exit(2)
    if not config:
        logger.error(f'Configuration is empty! Check your config file: {config_file}')
        sys.exit(2)

    # Determine provider: CLI arg > config > default 'openai'
    provider = first([args.provider, config.get('ai.provider'), 'openai'])
    config.setdefault('ai', {})
    config['ai']['provider'] = provider

    ai_api_url = first([args.ai_api_url, config.get('ai.api_url')])
    config['ai']['api_url'] = ai_api_url

    ai_model = config.ai.get('model', args.ai_model)
    verify_tls = config.ai.get('verify_tls', False) or args.verify_tls
    logger.debug(f"TLS verification: {verify_tls}")
    
    if provider == 'ollama':
        # Ollama requires no OAuth — skip auth resolution entirely
        logger.debug(f"Using Ollama provider at {ai_api_url}")
        return (config, ai_model, verify_tls)

    # OpenAI / OAuth-protected provider — resolve auth credentials
    ai_token_url = first([args.token_url, config.get('ai.token_url')])
    ai_client_id = (
        first([args.client_id, config.get('auth.CLIENT_ID')])
        or credential_resolver.resolve_credential(
            name='OLLAMA_CLIENT_ID', keyring_name='OLLAMA_CLIENT_ID', required=True)
        or quit('Could not determine OLLAMA_CLIENT_ID from cli args, environment variables, config, or password manager'))
    ai_client_secret = (
        first([args.client_secret, config.get('auth.CLIENT_SECRET')])
        or credential_resolver.resolve_credential(
            name='OLLAMA_CLIENT_SECRET', keyring_name='OLLAMA_CLIENT_SECRET', required=True)
        or quit('Could not determine OLLAMA_CLIENT_SECRET from cli args, environment variables, config, or password manager'))
    ai_app_key = (
        first([args.app_key, config.get('auth.APPKEY')])
        or credential_resolver.resolve_credential(
            name='OLLAMA_APPKEY', keyring_name='OLLAMA_APPKEY', required=True)
        or quit('Could not determine OLLAMA_APPKEY from cli args, environment variables, config, or password manager'))

    config['ai']['token_url'] = ai_token_url
    config['token_url'] = ai_token_url
    config.setdefault('auth', {})
    config['auth']['CLIENT_ID'] = ai_client_id
    config['auth']['CLIENT_SECRET'] = ai_client_secret
    config['auth']['APPKEY'] = ai_app_key

    required_fields = ['auth', 'ai']
    for field in required_fields:
        if field not in config:
            logger.error(f"Missing required configuration field: {field}")
            sys.exit(3)
    required_auth_fields = ['CLIENT_ID', 'CLIENT_SECRET', 'APPKEY']
    for field in required_auth_fields:
        if field not in config['auth']:
            logger.error(f"Missing required auth field: {field}")
            sys.exit(3)
    return (config, ai_model, verify_tls)


def get_access_token(config, verify_tls=True):
    """
    Obtain OAuth access token for API authentication.
    
    Args:
        config: Configuration dictionary containing credentials and token URL
        verify_tls: Whether to verify TLS certificates
    
    Returns:
        Access token string
    """
    credentials_str = f"{config.auth.CLIENT_ID}:{config.auth.CLIENT_SECRET}"
    encoded_credentials = base64.b64encode(credentials_str.encode()).decode()
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": f"Basic {encoded_credentials}"
    }
    data = {"grant_type": "client_credentials"}
    
    try:
        response = requests.post(config.ai.token_url, headers=headers, data=data, verify=verify_tls)
        response.raise_for_status()
        token = response.json().get("access_token")
        logger.debug(f"Successfully obtained access token")
        return token
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error while obtaining access token: {e} - {response.text}")
        raise RuntimeError(f"HTTP error while obtaining access token: {e} - {response.text}")

def process_text(**kwargs):
    """
    Process text through AI API with specified task sequence.
    
    Args:
        text: Input text to process
        config: Configuration dictionary
        prompt_context: Context for prompt
        verify_tls: Whether to verify TLS certificates
    
    Returns:
        Processed text string
    """
    text = kwargs['text']
    config = kwargs['config']
    context = kwargs['context']
    task = kwargs['task']
    model = kwargs['model']
    verify_tls = kwargs.get('verify_tls')
    provider = config.ai.get('provider', 'openai')

    if not config.ai.tasks.get(task):
        quit(f'Unrecognized task {task}')
    
    prompt = config.ai.tasks[task].prompt

    logger.debug(f"Processing task: {task}")

    api_url_from_config = config.ai.api_url

    if provider == 'ollama':
        # Ollama OpenAI-compatible endpoint — no auth required
        ai_api_url = f"{api_url_from_config}/v1/chat/completions"
        headers = {
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": context},
                {"role": "system", "content": prompt},
                {"role": "user", "content": text.strip()}
            ]
        }
    else:
        # OAuth-protected OpenAI-compatible API
        access_token = get_access_token(config, verify_tls)
        ai_api_url = f"{api_url_from_config}/{model}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "api-key": access_token
        }
        payload = {
            "messages": [
                {"role": "system", "content": context},
                {"role": "system", "content": prompt},
                {"role": "user", "content": text.strip()}
            ],
            "user": json.dumps({ 'appkey': config.auth.APPKEY})
        }
    
    try:
        response = requests.post(ai_api_url, headers=headers, json=payload, verify=verify_tls)
        response.raise_for_status()
        choices = response.json().get("choices", [])
        if choices:
            text = choices[0].get("message", {}).get("content", "").strip()
            logger.debug(f"Task '{task}' completed successfully")
        else:
            raise RuntimeError(f"{task.capitalize()} unavailable from AI service.")
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error during {task}: {e} - {response.text}")
        raise RuntimeError(f"HTTP error: {e} - {response.text}")

    return text


def create_webhook_app(config, ai_model, verify_tls):
    """Create FastAPI app with /api/v1/prompt endpoint."""
    app = FastAPI(title="AI Prompt Webhook", version=__version__)

    class LogEntry(BaseModel):
        """Single log entry with timestamp, trackingId, and message."""
        timestamp: str = "N/A"
        trackingId: str = "N/A"
        message: str = "N/A"

    class PromptRequest(BaseModel):
        """Request body: task and list of log entries under 'messages'."""
        task: str
        messages: List[LogEntry]

    class PromptResponse(BaseModel):
        """Success: ok=true, response=body. Error: ok=false, error=status+statusText, response=body."""
        ok: bool
        response: str
        error: Optional[str] = None

    def _status_text(code: int) -> str:
        return http.client.responses.get(code, "Unknown")

    @app.exception_handler(HTTPException)
    def http_exception_handler(request: Request, exc: HTTPException):
        response_body = (
            exc.detail if isinstance(exc.detail, str) else json.dumps(exc.detail, default=str)
        )
        body = {
            "ok": False,
            "error": f"{exc.status_code} {_status_text(exc.status_code)}",
            "response": response_body,
        }
        return JSONResponse(status_code=exc.status_code, content=body)

    @app.post("/api/v1/prompt", response_model=PromptResponse)
    def handle_prompt(body: PromptRequest):
        """
        Accept JSON: { "task": "<task_name>", "messages": [ { "timestamp", "trackingId", "message" }, ... ] }.
        """
        ai_task = (body.task or "").strip().lower()
        if not ai_task:
            raise HTTPException(status_code=400, detail="Body must include 'task'")
        messages = body.messages or []
        if not messages:
            raise HTTPException(status_code=400, detail="Body must include a non-empty 'messages' array")
        task_obj = config.ai.tasks.get(ai_task)
        if not task_obj:
            raise HTTPException(
                status_code=400,
                detail=f"Task '{ai_task}' not found. Valid tasks: {list(config.ai.tasks.keys())}"
            )
        # Build input_text: one line per entry as "timestamp | trackingId | message"
        lines = []
        for entry in messages:
            line = f"{entry.timestamp} | {entry.trackingId} | {entry.message}"
            lines.append(line)
        input_text = "\n".join(lines)
        if not input_text.strip():
            raise HTTPException(status_code=400, detail="Entries contain no non-empty message content")
        prompt_context = task_obj.get('context') if hasattr(task_obj, 'get') else getattr(task_obj, 'context', None)
        if not prompt_context:
            prompt_context = "You are a helpful assistant."
        try:
            result = process_text(
                text=input_text,
                config=config,
                context=prompt_context,
                task=ai_task,
                model=ai_model,
                verify_tls=verify_tls
            )
            return PromptResponse(ok=True, response=result)
        except Exception as e:
            logger.exception("Webhook prompt processing failed")
            raise HTTPException(status_code=500, detail=str(e))

    return app


def run_webhook_server(args, config, ai_model, verify_tls):
    """Run FastAPI webhook server."""
    if not HAS_FASTAPI:
        logger.error("FastAPI is required for --webhook-mode. Install with: pip install fastapi uvicorn")
        sys.exit(1)
    import uvicorn
    app = create_webhook_app(config, ai_model, verify_tls)
    port = getattr(args, 'webhook_port', 2048)
    logger.info(f"Starting webhook server on port {port}, POST /api/v1/prompt")
    uvicorn.run(app, host="0.0.0.0", port=port)


def main():
    # Parse CLI arguments
    args = parse_args()

    # Enable debug logging if requested
    if args.debug:
        logger.remove()
        logger.add(sys.stderr, level="DEBUG")
    elif args.verbose:
        logger.remove()
        logger.add(sys.stderr, level="INFO")

    # Webhook mode: run FastAPI server and exit
    if args.webhook_mode:
        config, ai_model, verify_tls = load_config_from_args(args)
        run_webhook_server(args, config, ai_model, verify_tls)
        return

    # CLI mode: --task is required
    if not args.task or not args.task.strip():
        logger.error("--task is required when not using --webhook-mode")
        sys.exit(1)

    config, ai_model, verify_tls = load_config_from_args(args)

    # Get input text
    input_text = args.text
    input_file = args.text_file
    ai_task = args.task.strip().lower()
    task_obj = config.ai.tasks[ai_task]
    if task_obj:
        prompt_context = task_obj.get('context', args.prompt_context)
    else:
        logger.error(f"Task with name '{ai_task}' not found")
        sys.exit(1)

    # Priority: --text > --text-file > stdin
    if input_text:
        logger.debug("Using text from --text argument")
    elif input_file:
        try:
            with open(os.path.expanduser(input_file), 'r') as f:
                input_text = f.read()
            logger.debug(f"Read text from file: {args.text_file}")
        except Exception as e:
            logger.error(f"Failed to read text file: {e}")
            sys.exit(4)
    elif not sys.stdin.isatty():
        # Check if data is being piped in
        try:
            input_text = sys.stdin.read()
            logger.debug("Read text from stdin (piped input)")
        except Exception as e:
            logger.error(f"Failed to read from stdin: {e}")
            sys.exit(4)
    else:
        logger.error("No input text specified! Use --text, --text-file, or pipe text via stdin")
        sys.exit(5)

    if not input_text or not input_text.strip():
        logger.error("Input text is empty!")
        sys.exit(6)
    
    # Parse task sequence
    logger.info(f"Processing text with task {ai_task}")
    
    # Set TLS verification
    verify_tls = args.verify_tls
    
    # Process the text
    try:
        summarized_text = process_text(
            text=input_text,
            config=config,
            context=prompt_context,
            task=ai_task,
            model=ai_model,
            verify_tls=verify_tls
        )
        
        # Output the result
        if args.output:
            try:
                with open(args.output, 'w') as f:
                    f.write(summarized_text)
                logger.info(f"Output written to: {args.output}")
            except Exception as e:
                logger.error(f"Failed to write output file: {e}")
                sys.exit(7)
        else:
            print(summarized_text)
        
        logger.info("Processing completed successfully")
        
    except Exception as e:
        logger.error(f"Failed to process text: {e}")
        sys.exit(8)

if __name__ == "__main__":
    main()
