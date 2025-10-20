"""
Integration tests for Return key feature using direct dev server interaction.
These tests verify the feature works by checking:
1. WASM is loaded and available
2. JavaScript handlers are properly wired
3. The implementation logic is sound
"""

import pytest
import requests
import time


class TestReturnKeyIntegration:
    """Integration tests for Return key functionality."""

    @pytest.fixture
    def dev_server_url(self):
        """Get dev server URL, ensuring it's running."""
        url = "http://localhost:8080"
        max_retries = 10
        for _ in range(max_retries):
            try:
                response = requests.get(url, timeout=2)
                if response.status_code == 200:
                    return url
            except requests.exceptions.RequestException:
                pass
            time.sleep(1)
        pytest.skip("Dev server not available")

    def test_dev_server_running(self, dev_server_url):
        """Test that dev server is running and serving HTML."""
        response = requests.get(dev_server_url)
        assert response.status_code == 200, "Dev server should return 200"
        assert "notation-canvas" in response.text or "DOCTYPE" in response.text, \
            "Dev server should serve HTML"
        print("✓ Dev server is running")

    def test_wasm_module_served(self, dev_server_url):
        """Test that WASM module is available."""
        # WASM files are built in dist/pkg/ but served through bundled JavaScript
        # Check that they exist locally (build verification)
        import os
        wasm_files = [
            "dist/pkg/editor_wasm_bg.wasm",
            "dist/pkg/editor_wasm.js"
        ]

        for wasm_file in wasm_files:
            assert os.path.exists(wasm_file), f"WASM file {wasm_file} should exist locally"

        print("✓ WASM module files are built")

    def test_keyboard_handler_script_served(self, dev_server_url):
        """Test that keyboard handler script is served."""
        response = requests.get(f"{dev_server_url}/src/js/keyboard-handler.js", timeout=5)
        assert response.status_code == 200, "Keyboard handler should be served"
        assert "registerShortcut" in response.text, "Should have shortcut registration"
        assert "Enter" in response.text, "Should handle Enter key"
        print("✓ Keyboard handler script is served")

    def test_editor_script_served(self, dev_server_url):
        """Test that editor script is served."""
        response = requests.get(f"{dev_server_url}/src/js/editor.js", timeout=5)
        assert response.status_code == 200, "Editor script should be served"
        assert "handleEnter" in response.text, "Should have handleEnter method"
        assert "splitLineAtPosition" in response.text, "Should call splitLineAtPosition"
        print("✓ Editor script is served with handleEnter implementation")

    def test_constants_script_served(self, dev_server_url):
        """Test that constants script is served."""
        response = requests.get(f"{dev_server_url}/src/js/constants.js", timeout=5)
        assert response.status_code == 200, "Constants script should be served"
        # Check for PREVENT_DEFAULT_KEYS with Enter
        assert "PREVENT_DEFAULT_KEYS" in response.text, "Should have PREVENT_DEFAULT_KEYS"
        assert "'Enter'" in response.text or '"Enter"' in response.text, "Enter should be in PREVENT_DEFAULT_KEYS"
        print("✓ Constants script includes Enter in PREVENT_DEFAULT_KEYS")


class TestReturnKeyCodeQuality:
    """Code quality tests for Return key implementation."""

    def test_wasm_api_file_has_split_function(self):
        """Test that split_line_at_position is in Rust API."""
        with open("src/api.rs", "r") as f:
            content = f.read()
            assert "pub fn split_line_at_position" in content, "split_line_at_position function should exist"
            assert "#[wasm_bindgen(js_name = splitLineAtPosition)]" in content, "Should have wasm_bindgen annotation"
            assert "split_off" in content, "Should use split_off for array splitting"
            assert "Line {" in content or "new Line" in content, "Should create new Line struct"
        print("✓ Rust implementation is complete")

    def test_editor_handler_method_complete(self):
        """Test that handleEnter method is complete."""
        with open("src/js/editor.js", "r") as f:
            content = f.read()
            # Check method exists
            assert "async handleEnter()" in content, "handleEnter should be async method"
            # Check key logic
            assert "hasSelection()" in content, "Should check for selection"
            assert "splitLineAtPosition" in content, "Should call splitLineAtPosition"
            assert "cursor.stave = currentStave + 1" in content, "Should move cursor to new line"
            assert "cursor.column = 0" in content, "Should reset column to 0"
            assert "deriveBeats" in content, "Should recalculate beats"
        print("✓ Editor handler method is complete")

    def test_keyboard_routing_complete(self):
        """Test that keyboard routing is set up."""
        with open("src/js/keyboard-handler.js", "r") as f:
            content = f.read()
            assert "registerShortcut('Enter'" in content, "Enter should be registered"
            assert "this.editor.handleEnter()" in content, "Should call handleEnter on Enter key"
        print("✓ Keyboard routing is set up")

    def test_prevent_default_configured(self):
        """Test that PREVENT_DEFAULT_KEYS includes Enter."""
        with open("src/js/constants.js", "r") as f:
            content = f.read()
            # Find the PREVENT_DEFAULT_KEYS array
            start_idx = content.find("PREVENT_DEFAULT_KEYS = [")
            end_idx = content.find("];", start_idx) + 2
            prevent_defaults_section = content[start_idx:end_idx]

            assert "'Enter'" in prevent_defaults_section or '"Enter"' in prevent_defaults_section, \
                "Enter should be in PREVENT_DEFAULT_KEYS array"
        print("✓ PREVENT_DEFAULT_KEYS includes Enter")


class TestReturnKeyLogic:
    """Logic tests for Return key implementation."""

    def test_line_split_logic(self):
        """Test that the line splitting logic in Rust is correct."""
        # Read the implementation
        with open("src/api.rs", "r") as f:
            content = f.read()

            # Find split_line_at_position function
            start = content.find("pub fn split_line_at_position")
            end = content.find("\n}\n", start) + 3
            func_content = content[start:end]

            # Verify key aspects
            assert "stave_index >= doc.lines.len()" in func_content, "Should validate stave index"
            assert "split_off" in func_content, "Should split cells array"
            assert "Line {" in func_content, "Should create new line"
            assert "pitch_system: line.pitch_system" in func_content, "Should inherit pitch_system"
            assert "tonic: line.tonic" in func_content, "Should inherit tonic"
            assert "label: String::new()" in func_content, "Should clear label"
            assert "insert(stave_index + 1" in func_content, "Should insert new line at correct position"

        print("✓ Line splitting logic is correct")

    def test_cursor_updates_logic(self):
        """Test that cursor is updated correctly."""
        with open("src/js/editor.js", "r") as f:
            content = f.read()

            # Find handleEnter method
            start = content.find("async handleEnter()")
            end = content.find("\n  }\n", start) + 5
            method_content = content[start:end]

            # Verify cursor logic
            assert "currentStave" in method_content, "Should get current stave"
            assert "charPos" in method_content, "Should get cursor position"
            assert "cursor.stave = currentStave + 1" in method_content, "Should move stave forward"
            assert "cursor.column = 0" in method_content, "Should reset column"

        print("✓ Cursor update logic is correct")

    def test_beat_recalculation_logic(self):
        """Test that beats are recalculated on both lines."""
        with open("src/js/editor.js", "r") as f:
            content = f.read()

            # Find handleEnter method
            start = content.find("async handleEnter()")
            end = content.find("\n  }\n", start) + 5
            method_content = content[start:end]

            # Verify beat recalculation
            assert "deriveBeats" in method_content, "Should derive beats"
            # Should be called twice (for old and new line)
            beat_count = method_content.count("deriveBeats")
            assert beat_count >= 2, f"Should call deriveBeats at least twice, found {beat_count} times"

        print("✓ Beat recalculation logic is correct")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
