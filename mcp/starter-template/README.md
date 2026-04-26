# FastMCP Starter Template

A heavily-annotated MCP server template designed for learning. This template demonstrates all the key concepts you need to build your own MCP servers.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run with HTTP transport (easier for testing)
python server.py --transport http --port 8000

# Run with stdio transport (for IDE integration)
python server.py
```

## Testing the Server

### HTTP Mode (Recommended for Learning)

```bash
# Start the server
python server.py --transport http --port 8000

# In another terminal, test the tools:

# List available tools
curl http://localhost:8000/mcp/v1/tools

# Call the greet tool
curl -X POST http://localhost:8000/mcp/v1/tools/greet \
     -H "Content-Type: application/json" \
     -d '{"name": "World"}'

# Add a note
curl -X POST http://localhost:8000/mcp/v1/tools/add_note \
     -H "Content-Type: application/json" \
     -d '{"title": "My Note", "content": "Hello from curl!", "tags": "test,learning"}'

# Search notes
curl -X POST http://localhost:8000/mcp/v1/tools/search_notes \
     -H "Content-Type: application/json" \
     -d '{"query": "sample"}'

# Get server stats
curl -X POST http://localhost:8000/mcp/v1/tools/get_server_stats \
     -H "Content-Type: application/json" \
     -d '{}'
```

## Integrating with Windsurf

Add this to your `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "starter-template": {
      "command": "python",
      "args": ["/Users/entejeda/Documents/workspace/mcp/starter-template/server.py"],
      "env": {}
    }
  }
}
```

Then reload Windsurf (`Cmd+Shift+P` → "Developer: Reload Window").

## Key Concepts Explained

### 1. Server Initialization

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    name="My Server",
    version="1.0.0"
)
```

### 2. Tools (Callable Functions)

Tools are functions the AI can call. They should have:
- Clear, descriptive names
- Detailed docstrings (the AI reads these!)
- Type hints for parameters
- Structured return values (dicts work best)

```python
@mcp.tool()
async def my_tool(param1: str, param2: int = 10) -> Dict[str, Any]:
    """
    Description of what this tool does.
    
    Args:
        param1: Description of param1
        param2: Description of param2 (default: 10)
    
    Returns:
        Description of return value
    """
    return {"result": "success"}
```

### 3. Lifespan Management

Use the lifespan context manager for startup/shutdown logic:

```python
@asynccontextmanager
async def mcp_lifespan(server: FastMCP) -> AsyncIterator[None]:
    # Startup code here
    global my_state
    my_state = initialize_stuff()
    
    yield  # Server runs while yielded
    
    # Shutdown code here
    cleanup_stuff()

mcp._lifespan = mcp_lifespan
```

### 4. State Management

Store application state in a global variable initialized during lifespan:

```python
app_state: Optional[MyState] = None

@asynccontextmanager
async def mcp_lifespan(server: FastMCP) -> AsyncIterator[None]:
    global app_state
    app_state = MyState()
    yield

@mcp.tool()
async def my_tool() -> Dict:
    if app_state is None:
        raise RuntimeError("Not initialized")
    return app_state.do_something()
```

### 5. Logging Best Practices

Always log to stderr, never stdout (stdout is for the MCP protocol):

```python
import logging
import sys

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr  # IMPORTANT!
)
logger = logging.getLogger("my-server")
```

## Learning Exercises

### Exercise 1: Add a Delete Tool
Add a `delete_note` tool that removes a note by ID.

### Exercise 2: Add Tags Filter
Modify `list_notes` to accept an optional `tag` parameter that filters notes.

### Exercise 3: Add a Resource
Uncomment and modify the resource example to expose server configuration.

### Exercise 4: Add Persistence
Modify the server to save notes to a JSON file and load them on startup.

### Exercise 5: Add Error Handling
Add proper error handling for cases like "note not found" with appropriate error messages.

## File Structure

```
starter-template/
├── server.py          # Main server with annotated examples
├── requirements.txt   # Python dependencies
├── README.md          # This file
└── test_server.py     # Unit tests
```

## Resources

- [FastMCP Documentation](https://gofastmcp.com)
- [MCP Protocol Specification](https://modelcontextprotocol.io/docs)
- [FastMCP GitHub](https://github.com/jlowin/fastmcp)

## Troubleshooting

### Server won't start
- Check Python version (3.10+ recommended)
- Ensure dependencies are installed: `pip install -r requirements.txt`

### Tools not showing in Windsurf
- Reload Windsurf after config changes
- Start a **new** Cascade conversation
- Check the MCP server status indicator (should be green)

### Logging not visible
- In HTTP mode, logs go to the terminal
- In stdio mode, logs go to stderr (check Windsurf's output panel)
