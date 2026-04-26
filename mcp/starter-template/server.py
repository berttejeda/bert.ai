#!/usr/bin/env python3
"""
FastMCP Starter Template - A Learning Sandbox
==============================================

This is an annotated MCP server template designed to teach the key concepts
of building MCP servers with FastMCP. Each section is heavily commented
to explain what's happening and why.

Key Concepts Covered:
1. Server initialization and configuration
2. Tools - Functions that can be called by the AI
3. Resources - Static data endpoints
4. Lifespan management - Startup/shutdown logic
5. State management - Sharing data across tools
6. Error handling
7. Logging best practices

Run this server:
    # For IDE integration (stdio transport - default)
    python server.py
    
    # For testing with HTTP (easier to debug)
    python server.py --transport http --port 8000

Test with curl (HTTP mode):
    curl http://localhost:8000/mcp/v1/tools
    curl -X POST http://localhost:8000/mcp/v1/tools/greet \
         -H "Content-Type: application/json" \
         -d '{"name": "World"}'
"""

import os
import sys
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

# =============================================================================
# SECTION 1: Logging Setup
# =============================================================================
# Good logging is essential for debugging MCP servers, especially when running
# in stdio mode where print() statements would break the protocol.

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr  # IMPORTANT: Always log to stderr, not stdout!
)
logger = logging.getLogger("starter-mcp")

# =============================================================================
# SECTION 2: Imports - FastMCP and Dependencies
# =============================================================================
# FastMCP is the high-level framework that makes building MCP servers easy.
# It handles all the protocol details so you can focus on your tools.

try:
    from mcp.server.fastmcp import FastMCP
    logger.info("FastMCP imported successfully")
except ImportError as e:
    logger.error(f"Failed to import FastMCP: {e}")
    logger.error("Install with: pip install fastmcp")
    sys.exit(1)

# Optional: structlog for better structured logging
try:
    import structlog
    structured_logger = structlog.get_logger()
    HAS_STRUCTLOG = True
except ImportError:
    HAS_STRUCTLOG = False
    structured_logger = logger


# =============================================================================
# SECTION 3: Data Models
# =============================================================================
# Define your data structures using dataclasses. This makes your code cleaner
# and provides automatic __init__, __repr__, etc.

@dataclass
class Note:
    """A simple note with title and content."""
    id: str
    title: str
    content: str
    created_at: datetime = field(default_factory=datetime.now)
    tags: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "created_at": self.created_at.isoformat(),
            "tags": self.tags
        }


@dataclass
class AppState:
    """
    Application state that persists across tool calls.
    
    This is a common pattern - store your app's state in a dataclass
    and initialize it during the lifespan startup.
    """
    notes: Dict[str, Note] = field(default_factory=dict)
    counter: int = 0
    started_at: Optional[datetime] = None
    
    def add_note(self, title: str, content: str, tags: List[str] = None) -> Note:
        """Add a new note and return it."""
        self.counter += 1
        note_id = f"note_{self.counter}"
        note = Note(
            id=note_id,
            title=title,
            content=content,
            tags=tags or []
        )
        self.notes[note_id] = note
        return note
    
    def search_notes(self, query: str) -> List[Note]:
        """Search notes by title or content."""
        query_lower = query.lower()
        return [
            note for note in self.notes.values()
            if query_lower in note.title.lower() or query_lower in note.content.lower()
        ]


# =============================================================================
# SECTION 4: Global State
# =============================================================================
# The app state is initialized during lifespan startup and accessed by tools.
# Using Optional[AppState] = None allows us to detect if initialization failed.

app_state: Optional[AppState] = None


# =============================================================================
# SECTION 5: FastMCP Server Initialization
# =============================================================================
# Create the FastMCP instance. This is the main entry point for your server.
# The name and version are shown to clients connecting to your server.

mcp = FastMCP(
    name="Starter Template Server",
    # Note: version parameter removed in newer FastMCP versions
)


# =============================================================================
# SECTION 6: Lifespan Management
# =============================================================================
# The lifespan context manager runs code at startup and shutdown.
# Use it to:
# - Initialize databases or connections
# - Load configuration
# - Build indexes
# - Clean up resources on shutdown

@asynccontextmanager
async def mcp_lifespan(server: FastMCP) -> AsyncIterator[None]:
    """
    Lifespan context manager for startup/shutdown logic.
    
    Everything before 'yield' runs at startup.
    Everything after 'yield' runs at shutdown.
    """
    global app_state
    
    logger.info("=== SERVER STARTING ===")
    
    # Initialize application state
    app_state = AppState(started_at=datetime.now())
    
    # Add some sample data for testing
    app_state.add_note(
        title="Welcome Note",
        content="This is a sample note to get you started!",
        tags=["welcome", "sample"]
    )
    app_state.add_note(
        title="MCP Tips",
        content="Remember: Tools are for actions, Resources are for data.",
        tags=["tips", "mcp"]
    )
    
    logger.info(f"Initialized with {len(app_state.notes)} sample notes")
    logger.info("=== SERVER READY ===")
    
    # Yield control to the server (it runs while we're yielded)
    yield
    
    # Shutdown logic
    logger.info("=== SERVER SHUTTING DOWN ===")
    logger.info(f"Server ran for {datetime.now() - app_state.started_at}")


# Attach the lifespan to the server
mcp._lifespan = mcp_lifespan


# =============================================================================
# SECTION 7: MCP Tools
# =============================================================================
# Tools are functions that the AI can call. They should:
# - Have clear, descriptive names
# - Include detailed docstrings (the AI reads these!)
# - Return structured data (dicts are best)
# - Handle errors gracefully

@mcp.tool()
async def greet(name: str) -> Dict[str, str]:
    """
    A simple greeting tool to test the server.
    
    Args:
        name: The name to greet
    
    Returns:
        A greeting message
    """
    logger.info(f"Greeting: {name}")
    return {
        "message": f"Hello, {name}! Welcome to the MCP Starter Template.",
        "timestamp": datetime.now().isoformat()
    }


@mcp.tool()
async def add_note(
    title: str,
    content: str,
    tags: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a new note.
    
    Args:
        title: Title of the note
        content: Content/body of the note
        tags: Optional comma-separated tags (e.g., "work,important")
    
    Returns:
        The created note with its ID
    """
    if app_state is None:
        raise RuntimeError("Server not initialized")
    
    # Parse tags from comma-separated string
    tag_list = [t.strip() for t in tags.split(",")] if tags else []
    
    note = app_state.add_note(title, content, tag_list)
    logger.info(f"Created note: {note.id}")
    
    return {
        "status": "created",
        "note": note.to_dict()
    }


@mcp.tool()
async def search_notes(query: str) -> Dict[str, Any]:
    """
    Search notes by title or content.
    
    Args:
        query: Text to search for in notes
    
    Returns:
        List of matching notes
    """
    if app_state is None:
        raise RuntimeError("Server not initialized")
    
    results = app_state.search_notes(query)
    logger.info(f"Search '{query}' found {len(results)} results")
    
    return {
        "query": query,
        "count": len(results),
        "results": [note.to_dict() for note in results]
    }


@mcp.tool()
async def list_notes(limit: int = 10) -> Dict[str, Any]:
    """
    List all notes.
    
    Args:
        limit: Maximum number of notes to return (default: 10)
    
    Returns:
        List of notes
    """
    if app_state is None:
        raise RuntimeError("Server not initialized")
    
    notes = list(app_state.notes.values())[:limit]
    
    return {
        "total": len(app_state.notes),
        "showing": len(notes),
        "notes": [note.to_dict() for note in notes]
    }


@mcp.tool()
async def get_server_stats() -> Dict[str, Any]:
    """
    Get server statistics and health information.
    
    Returns:
        Server stats including uptime, note count, etc.
    """
    if app_state is None:
        raise RuntimeError("Server not initialized")
    
    uptime = datetime.now() - app_state.started_at if app_state.started_at else None
    
    return {
        "status": "healthy",
        "started_at": app_state.started_at.isoformat() if app_state.started_at else None,
        "uptime_seconds": uptime.total_seconds() if uptime else 0,
        "total_notes": len(app_state.notes),
        "notes_created": app_state.counter
    }


@mcp.tool()
async def echo(message: str, uppercase: bool = False) -> Dict[str, str]:
    """
    Echo back a message - useful for testing.
    
    Args:
        message: The message to echo
        uppercase: If true, convert to uppercase
    
    Returns:
        The echoed message
    """
    result = message.upper() if uppercase else message
    return {
        "original": message,
        "echoed": result,
        "uppercase": uppercase
    }


# =============================================================================
# SECTION 8: MCP Resources (Optional)
# =============================================================================
# Resources are static data endpoints. Unlike tools, they don't take arguments
# and are meant for exposing configuration, documentation, or other static data.
# 
# Uncomment the following to add resources:

# @mcp.resource("config://settings")
# async def get_settings() -> str:
#     """Return server configuration."""
#     return json.dumps({
#         "version": "1.0.0",
#         "features": ["notes", "search"]
#     })


# =============================================================================
# SECTION 9: Main Entry Point
# =============================================================================
# Handle command-line arguments and start the server.

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description="FastMCP Starter Template Server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Run with stdio transport (for IDE integration)
    python server.py
    
    # Run with HTTP transport (for testing)
    python server.py --transport http --port 8000
    
    # Enable debug logging
    python server.py --debug
        """
    )
    parser.add_argument(
        "--port", 
        type=int, 
        default=8000, 
        help="Port for HTTP transport (default: 8000)"
    )
    parser.add_argument(
        "--host", 
        type=str, 
        default="0.0.0.0", 
        help="Host to bind to (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--transport", 
        type=str, 
        choices=["stdio", "http"], 
        default="stdio",
        help="Transport type (default: stdio)"
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging"
    )
    
    args = parser.parse_args()
    
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Start the server
    if args.transport == "http":
        logger.info(f"Starting HTTP server on http://{args.host}:{args.port}")
        mcp.run(transport="http", host=args.host, port=args.port)
    else:
        logger.info("Starting stdio server")
        mcp.run()
