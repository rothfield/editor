#!/usr/bin/env python3
"""
Tests for notation font generator (SPEC.md compliance)

Run with: pytest test_generator.py -v

Tests verify:
  1. Codepoint stability (no accidental reshuffling)
  2. No duplicate codepoints
  3. Sequential allocation
  4. YAML validation
  5. Character order consistency
"""

import os
import json
import pytest
from pathlib import Path

# Import generator modules
import sys
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

from generate import (
    load_atom_spec,
    assign_codepoints,
    validate_layout,
    CodepointLayout,
)


@pytest.fixture
def atoms_yaml_path():
    """Path to atoms.yaml"""
    return os.path.join(script_dir, "atoms.yaml")


@pytest.fixture
def golden_json_path():
    """Path to mapping-golden.json"""
    return os.path.join(script_dir, "mapping-golden.json")


@pytest.fixture
def spec(atoms_yaml_path):
    """Load atom specification"""
    return load_atom_spec(atoms_yaml_path)


@pytest.fixture
def layout(spec):
    """Generate codepoint layout"""
    return assign_codepoints(spec)


# ============================================================================
# Validation Tests
# ============================================================================

class TestYAMLValidation:
    """Tests for atoms.yaml parsing and validation"""

    def test_atoms_yaml_exists(self, atoms_yaml_path):
        """atoms.yaml file exists"""
        assert os.path.exists(atoms_yaml_path), f"atoms.yaml not found: {atoms_yaml_path}"

    def test_atoms_yaml_parses(self, spec):
        """atoms.yaml parses successfully"""
        assert spec is not None
        assert spec.notation_systems is not None
        assert len(spec.notation_systems) > 0

    def test_notation_systems_defined(self, spec):
        """All 4 notation systems are defined"""
        expected_systems = {"number", "western", "sargam", "doremi"}
        assert set(spec.notation_systems.keys()) == expected_systems

    def test_character_counts(self, spec):
        """Each notation system has correct character count"""
        expected_counts = {
            "number": 7,
            "western": 14,
            "sargam": 12,
            "doremi": 14,
        }
        for system, expected_count in expected_counts.items():
            actual_count = len(spec.notation_systems[system])
            assert actual_count == expected_count, \
                f"{system}: expected {expected_count}, got {actual_count}"

    def test_character_order_matches_systems(self, spec):
        """character_order field matches concatenated systems"""
        expected_order = ''.join(
            ''.join(chars) for chars in spec.notation_systems.values()
        )
        assert spec.character_order == expected_order, \
            f"character_order mismatch!\nExpected: {expected_order}\nGot: {spec.character_order}"

    def test_geometry_loaded(self, spec):
        """Geometry parameters are loaded from YAML"""
        assert spec.geometry is not None
        assert spec.geometry.dot_above_gap == 50
        assert spec.geometry.dot_below_gap == 50
        assert spec.geometry.dot_vertical_step == 100
        assert spec.geometry.dot_horizontal_center is True

    def test_bravura_symbols_loaded(self, spec):
        """Bravura symbols are loaded from YAML"""
        assert len(spec.bravura_symbols) == 11
        # Check a few known symbols
        symbol_names = [s.glyph_name for s in spec.bravura_symbols]
        assert "uni266F" in symbol_names  # Sharp
        assert "ornamentMordent" in symbol_names
        assert "ornamentTrill" in symbol_names


# ============================================================================
# Codepoint Allocation Tests
# ============================================================================

class TestCodepointAllocation:
    """Tests for sequential codepoint allocation"""

    def test_all_atoms_assigned(self, layout):
        """All atoms have codepoints assigned"""
        for atom in layout.note_atoms:
            assert atom.assigned_codepoint is not None

        for symbol in layout.symbols:
            assert symbol.assigned_codepoint is not None

    def test_no_duplicate_codepoints(self, layout):
        """No duplicate codepoints"""
        all_atoms = layout.note_atoms + layout.symbols
        codepoints = [atom.assigned_codepoint for atom in all_atoms]
        assert len(codepoints) == len(set(codepoints)), \
            f"Duplicate codepoints found!"

    def test_sequential_note_allocation(self, layout):
        """Note atoms are allocated sequentially"""
        codepoints = [atom.assigned_codepoint for atom in layout.note_atoms]
        assert codepoints == list(range(codepoints[0], codepoints[0] + len(codepoints))), \
            "Note codepoints are not sequential"

    def test_notes_start_at_0xe000(self, layout):
        """Notes start at 0xE000"""
        first_codepoint = layout.note_atoms[0].assigned_codepoint
        assert first_codepoint == 0xE000, \
            f"Notes should start at 0xE000, got {hex(first_codepoint)}"

    def test_symbols_follow_notes(self, layout):
        """Symbols follow notes sequentially"""
        last_note_cp = layout.note_atoms[-1].assigned_codepoint
        first_symbol_cp = layout.symbols[0].assigned_codepoint
        assert first_symbol_cp == last_note_cp + 1, \
            f"Symbols should follow notes sequentially"

    def test_pua_range_valid(self, layout):
        """All codepoints are in valid PUA range"""
        all_atoms = layout.note_atoms + layout.symbols
        for atom in all_atoms:
            assert 0xE000 <= atom.assigned_codepoint <= 0xF8FF, \
                f"Codepoint {hex(atom.assigned_codepoint)} outside PUA range"

    def test_no_pua_overflow(self, layout):
        """Total glyphs don't overflow PUA"""
        all_atoms = layout.note_atoms + layout.symbols
        total_glyphs = len(all_atoms)
        pua_capacity = 0xF8FF - 0xE000 + 1
        assert total_glyphs < pua_capacity, \
            f"PUA overflow! Used {total_glyphs}, capacity is {pua_capacity}"


# ============================================================================
# Stability Tests (against golden snapshot)
# ============================================================================

class TestCodepointStability:
    """Tests to detect accidental codepoint reshuffling"""

    def test_golden_json_exists(self, golden_json_path):
        """mapping-golden.json exists"""
        assert os.path.exists(golden_json_path), \
            f"mapping-golden.json not found: {golden_json_path}"

    def test_golden_json_parses(self, golden_json_path):
        """mapping-golden.json is valid JSON"""
        with open(golden_json_path, 'r') as f:
            data = json.load(f)
        assert data is not None
        assert "notes" in data
        assert "symbols" in data

    def test_note_codepoints_stable(self, layout, golden_json_path):
        """Note codepoints match golden snapshot"""
        with open(golden_json_path, 'r') as f:
            golden = json.load(f)

        # Build map of (system, char, variant) -> codepoint from current layout
        current_map = {}
        for atom in layout.note_atoms:
            key = (atom.system, atom.character, atom.variant_index)
            current_map[key] = atom.assigned_codepoint

        # Verify against golden
        for golden_entry in golden["notes"]:
            key = (
                golden_entry["system"],
                golden_entry["character"],
                ["1_dot_above", "2_dots_above", "1_dot_below", "2_dots_below"].index(
                    golden_entry["variant"]
                )
            )
            current_codepoint = current_map.get(key)
            golden_codepoint = int(golden_entry["codepoint"], 16)

            assert current_codepoint == golden_codepoint, \
                f"Codepoint changed for {key}!\n" \
                f"  Golden: {hex(golden_codepoint)}\n" \
                f"  Current: {hex(current_codepoint)}\n" \
                f"This indicates atoms.yaml ordering was changed. " \
                f"Use append-only rule (SPEC.md Section 11.4)"

    def test_symbol_codepoints_stable(self, layout, golden_json_path):
        """Symbol codepoints match golden snapshot"""
        with open(golden_json_path, 'r') as f:
            golden = json.load(f)

        # Build map of name -> codepoint from current layout
        current_map = {symbol.glyph_name: symbol.assigned_codepoint for symbol in layout.symbols}

        # Verify against golden
        for golden_entry in golden["symbols"]:
            name = golden_entry["name"]
            current_codepoint = current_map.get(name)
            golden_codepoint = int(golden_entry["codepoint"], 16)

            assert current_codepoint == golden_codepoint, \
                f"Symbol codepoint changed for {name}!\n" \
                f"  Golden: {hex(golden_codepoint)}\n" \
                f"  Current: {hex(current_codepoint)}"

    def test_total_glyphs_count(self, golden_json_path, layout):
        """Total glyph count matches golden"""
        with open(golden_json_path, 'r') as f:
            golden = json.load(f)

        expected_total = golden["summary"]["total_glyphs"]
        actual_total = len(layout.note_atoms) + len(layout.symbols)

        assert actual_total == expected_total, \
            f"Total glyph count changed! Expected {expected_total}, got {actual_total}"


# ============================================================================
# Variant Tests
# ============================================================================

class TestVariants:
    """Tests for dot variants"""

    def test_all_variants_generated(self, layout):
        """Each character generates 4 variants"""
        # Count variants per (system, character)
        variant_counts = {}
        for atom in layout.note_atoms:
            key = (atom.system, atom.character)
            variant_counts[key] = variant_counts.get(key, 0) + 1

        # Each should have exactly 4 variants
        for key, count in variant_counts.items():
            assert count == 4, \
                f"{key} has {count} variants, expected 4"

    def test_variant_indices_sequential(self, layout):
        """Variant indices are 0-3 in order"""
        for atom in layout.note_atoms:
            assert 0 <= atom.variant_index <= 3, \
                f"Invalid variant index: {atom.variant_index}"

    def test_all_octave_shifts_present(self, layout):
        """All 4 octave shifts (+1, +2, -1, -2) are covered"""
        octave_shifts = set()
        for atom in layout.note_atoms:
            shift = [1, 2, -1, -2][atom.variant_index]
            octave_shifts.add(shift)

        assert octave_shifts == {1, 2, -1, -2}, \
            f"Missing octave shifts: {octave_shifts}"


# ============================================================================
# Integration Tests
# ============================================================================

class TestValidateLayout:
    """Tests for layout validation"""

    def test_validate_layout_passes(self, layout):
        """validate_layout() passes without errors"""
        try:
            validate_layout(layout)
        except Exception as e:
            pytest.fail(f"validate_layout() failed: {e}")


# ============================================================================
# System-specific Tests
# ============================================================================

class TestNumberSystem:
    """Tests for Number system (1-7)"""

    def test_all_numbers_present(self, spec):
        """All 7 numbers are present"""
        numbers = spec.notation_systems["number"]
        assert len(numbers) == 7
        assert numbers == ['1', '2', '3', '4', '5', '6', '7']


class TestWesternSystem:
    """Tests for Western system (A-G)"""

    def test_all_letters_present(self, spec):
        """All A-G letters (upper and lower) are present"""
        letters = spec.notation_systems["western"]
        assert len(letters) == 14
        expected = list("CDEFGABcdefgab")
        assert letters == expected


class TestSargamSystem:
    """Tests for Sargam system (Indian classical)"""

    def test_all_sargam_present(self, spec):
        """All sargam notes are present"""
        sargam = spec.notation_systems["sargam"]
        assert len(sargam) == 12
        expected = list("SrRgGmMPdDnN")
        assert sargam == expected


class TestDoremiSystem:
    """Tests for Doremi system (Solfège)"""

    def test_all_doremi_present(self, spec):
        """All doremi notes are present (including f/F)"""
        doremi = spec.notation_systems["doremi"]
        assert len(doremi) == 14
        expected = list("drmfsltDRMFSLT")
        assert doremi == expected

    def test_f_present_in_doremi(self, spec):
        """f (fa) is explicitly present in doremi"""
        doremi = spec.notation_systems["doremi"]
        assert 'f' in doremi
        assert 'F' in doremi


# ============================================================================
# Run tests
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
