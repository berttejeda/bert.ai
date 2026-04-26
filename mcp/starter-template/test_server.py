#!/usr/bin/env python3
"""
Unit tests for the FastMCP Starter Template Server.

Run tests:
    python -m pytest test_server.py -v
    
Or without pytest:
    python test_server.py
"""

import asyncio
import unittest
from datetime import datetime

# Import from our server module
from server import AppState, Note, app_state


class TestNote(unittest.TestCase):
    """Tests for the Note dataclass."""
    
    def test_note_creation(self):
        """Test creating a note."""
        note = Note(
            id="test_1",
            title="Test Note",
            content="Test content",
            tags=["test", "unit"]
        )
        self.assertEqual(note.id, "test_1")
        self.assertEqual(note.title, "Test Note")
        self.assertEqual(note.content, "Test content")
        self.assertEqual(note.tags, ["test", "unit"])
        self.assertIsInstance(note.created_at, datetime)
    
    def test_note_to_dict(self):
        """Test note serialization."""
        note = Note(
            id="test_1",
            title="Test Note",
            content="Test content"
        )
        d = note.to_dict()
        self.assertEqual(d["id"], "test_1")
        self.assertEqual(d["title"], "Test Note")
        self.assertEqual(d["content"], "Test content")
        self.assertIn("created_at", d)
        self.assertEqual(d["tags"], [])


class TestAppState(unittest.TestCase):
    """Tests for the AppState class."""
    
    def setUp(self):
        """Create a fresh AppState for each test."""
        self.state = AppState(started_at=datetime.now())
    
    def test_add_note(self):
        """Test adding a note."""
        note = self.state.add_note("Title", "Content", ["tag1"])
        self.assertEqual(note.title, "Title")
        self.assertEqual(note.content, "Content")
        self.assertEqual(note.tags, ["tag1"])
        self.assertIn(note.id, self.state.notes)
        self.assertEqual(self.state.counter, 1)
    
    def test_add_multiple_notes(self):
        """Test adding multiple notes."""
        note1 = self.state.add_note("Note 1", "Content 1")
        note2 = self.state.add_note("Note 2", "Content 2")
        self.assertEqual(len(self.state.notes), 2)
        self.assertEqual(self.state.counter, 2)
        self.assertNotEqual(note1.id, note2.id)
    
    def test_search_notes_by_title(self):
        """Test searching notes by title."""
        self.state.add_note("Python Tips", "Some tips about Python")
        self.state.add_note("JavaScript Guide", "JS stuff")
        
        results = self.state.search_notes("python")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].title, "Python Tips")
    
    def test_search_notes_by_content(self):
        """Test searching notes by content."""
        self.state.add_note("Note 1", "Contains the word fastmcp")
        self.state.add_note("Note 2", "Does not contain it")
        
        results = self.state.search_notes("fastmcp")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].title, "Note 1")
    
    def test_search_case_insensitive(self):
        """Test that search is case-insensitive."""
        self.state.add_note("MCP Tutorial", "Learn MCP")
        
        results = self.state.search_notes("mcp")
        self.assertEqual(len(results), 1)
        
        results = self.state.search_notes("MCP")
        self.assertEqual(len(results), 1)
    
    def test_search_no_results(self):
        """Test search with no matching results."""
        self.state.add_note("Note 1", "Content 1")
        
        results = self.state.search_notes("nonexistent")
        self.assertEqual(len(results), 0)


class TestToolsAsync(unittest.TestCase):
    """
    Async tests for the MCP tools.
    
    Note: These tests import the tool functions directly and test them
    without going through the MCP protocol.
    """
    
    def setUp(self):
        """Set up the event loop and app state."""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
    
    def tearDown(self):
        """Clean up the event loop."""
        self.loop.close()
    
    def test_greet_tool(self):
        """Test the greet tool."""
        from server import greet
        
        result = self.loop.run_until_complete(greet("Test User"))
        self.assertIn("message", result)
        self.assertIn("Test User", result["message"])
        self.assertIn("timestamp", result)
    
    def test_echo_tool(self):
        """Test the echo tool."""
        from server import echo
        
        result = self.loop.run_until_complete(echo("hello"))
        self.assertEqual(result["original"], "hello")
        self.assertEqual(result["echoed"], "hello")
        self.assertFalse(result["uppercase"])
        
        result = self.loop.run_until_complete(echo("hello", uppercase=True))
        self.assertEqual(result["echoed"], "HELLO")
        self.assertTrue(result["uppercase"])


if __name__ == "__main__":
    print("Running FastMCP Starter Template Tests")
    print("=" * 50)
    unittest.main(verbosity=2)
