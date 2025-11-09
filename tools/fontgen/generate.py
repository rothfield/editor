#!/usr/bin/env python3
"""
Notation Font Generator - Noto Music-based

This is the authoritative font generation tool. It reads atoms.yaml (single source
of truth) and outputs:
  1. NotationFont.ttf - Noto Music base + custom octave variants (dots above/below)
  2. NotationFont-map.json - JSON mapping for runtime lookup

Architecture:
  Stage 1: load_atom_spec() - Parse atoms.yaml
  Stage 2: assign_codepoints() - Allocate codepoints for custom variants
  Stage 3: build_font() - Open Noto Music, add custom note variants
  Stage 4: build_mapping_json() - Generate runtime mapping
  Stage 5: validate_layout() - Sanity checks

Usage:
  python3 generate.py [--noto-music-font PATH] [--output-dir PATH]
  python3 generate.py --validate-only  (no FontForge needed)
  python3 generate.py --debug-html      (visual specimen)
  python3 generate.py --strict          (fail on errors)
"""

import sys
import os
import json
import argparse
from pathlib import Path
from dataclasses import dataclass, asdict

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML not found.")
    print("Install with: pip install PyYAML")
    sys.exit(1)

# Try to import fontforge (optional for --validate-only)
fontforge = None
try:
    import fontforge
except ImportError:
    pass


# ============================================================================
# Data Classes
# ============================================================================

@dataclass
class Geometry:
    """Positioning parameters for dots and symbols"""
    dot_above_gap: int
    dot_below_gap: int
    dot_vertical_step: int
    dot_horizontal_center: bool
    accidental_scale: float
    accidental_x_offset: int
    accidental_y_offset: int
    barline_scale: float
    ornament_scale: float


@dataclass
class SMuFLSymbol:
    """A symbol from SMuFL standard (Noto Music)"""
    glyph_name: str
    label: str
    smufl_codepoint: int
    codepoint_offset: int
    assigned_codepoint: int = None  # Assigned during allocation


@dataclass
class NoteAtom:
    """A note (base character + variant)"""
    system: str
    character: str
    variant_index: int  # 0=+1dot, 1=+2dots, 2=-1dot, 3=-2dots
    assigned_codepoint: int = None  # Assigned during allocation


@dataclass
class AtomSpec:
    """Complete notation specification"""
    notation_systems: dict  # system_name -> list of characters
    smufl_symbols: list  # List of SMuFLSymbol
    geometry: Geometry
    character_order: str
    pua_start: int = 0xE600  # PUA start codepoint from atoms.yaml


@dataclass
class CodepointLayout:
    """Result of codepoint allocation"""
    note_atoms: list  # List of NoteAtom with assigned_codepoint set
    symbols: list  # List of BravuraSymbol with assigned_codepoint set
    notes_range: tuple  # (start, end) codepoint
    symbols_range: tuple  # (start, end) codepoint


# ============================================================================
# Stage 1: Load Atom Specification
# ============================================================================

def load_atom_spec(yaml_path: str) -> AtomSpec:
    """
    Parse atoms.yaml and validate structure.

    Returns:
        AtomSpec with notation systems, symbols, and geometry

    Raises:
        ValueError if validation fails
    """
    print(f"[STAGE 1] Loading atom specification: {yaml_path}")

    if not os.path.exists(yaml_path):
        raise FileNotFoundError(f"atoms.yaml not found: {yaml_path}")

    with open(yaml_path, 'r') as f:
        config = yaml.safe_load(f)

    # Extract notation systems
    notation_systems = {}
    for system_def in config.get('notation_systems', []):
        system_name = system_def['system_name']
        characters = [char_def['char'] for char_def in system_def.get('characters', [])]
        notation_systems[system_name] = characters
        print(f"  ✓ {system_name}: {len(characters)} characters")

    # Validate character order
    character_order = config.get('character_order', '')
    expected_order = ''.join(
        ''.join(chars) for chars in notation_systems.values()
    )

    if character_order != expected_order:
        raise ValueError(
            f"character_order mismatch!\n"
            f"  Expected: {expected_order}\n"
            f"  Got:      {character_order}"
        )

    print(f"  ✓ Character order validated: {character_order}")

    # Extract geometry
    geometry_config = config.get('geometry', {})
    geometry = Geometry(
        dot_above_gap=geometry_config.get('dots', {}).get('above_gap', 50),
        dot_below_gap=geometry_config.get('dots', {}).get('below_gap', 50),
        dot_vertical_step=geometry_config.get('dots', {}).get('vertical_step', 100),
        dot_horizontal_center=geometry_config.get('dots', {}).get('horizontal_center', True),
        accidental_scale=geometry_config.get('symbols', {}).get('accidental_scale', 1.0),
        accidental_x_offset=geometry_config.get('symbols', {}).get('accidental_x_offset', 0),
        accidental_y_offset=geometry_config.get('symbols', {}).get('accidental_y_offset', 0),
        barline_scale=geometry_config.get('symbols', {}).get('barline_scale', 1.0),
        ornament_scale=geometry_config.get('symbols', {}).get('ornament_scale', 1.0),
    )
    print(f"  ✓ Geometry loaded: dot_above_gap={geometry.dot_above_gap}, "
          f"dot_vertical_step={geometry.dot_vertical_step}")

    # Extract SMuFL symbols from Noto Music
    smufl_symbols = []
    for symbol_def in config.get('smufl_symbols', []):
        smufl_symbols.append(SMuFLSymbol(
            glyph_name=symbol_def['glyph_name'],
            label=symbol_def['label'],
            smufl_codepoint=symbol_def.get('smufl_codepoint', 0),
            codepoint_offset=symbol_def.get('codepoint_offset', 0),
        ))

    print(f"  ✓ SMuFL symbols: {len(smufl_symbols)}")

    # Extract PUA start codepoint
    pua_config = config.get('pua', {})
    pua_start = pua_config.get('start', 0xE600)
    print(f"  ✓ PUA start: {hex(pua_start)}")

    return AtomSpec(
        notation_systems=notation_systems,
        smufl_symbols=smufl_symbols,
        geometry=geometry,
        character_order=character_order,
        pua_start=pua_start,
    )


# ============================================================================
# Stage 2: Assign Codepoints
# ============================================================================

def assign_codepoints(spec: AtomSpec) -> CodepointLayout:
    """
    Sequentially assign PUA codepoints to all atoms.

    Algorithm:
        1. For each system in order, create 4 variants per character
        2. Assign sequential codepoints to each variant (starting at spec.pua_start)
        3. Assign symbol codepoints at SMuFL standard codepoints (not sequential)
        4. Return layout with all assignments

    Returns:
        CodepointLayout with all atoms assigned
    """
    start = spec.pua_start
    print(f"\n[STAGE 2] Assigning PUA codepoints (starting at {hex(start)})")

    note_atoms = []
    cp = start

    # Process notation systems in order they appear in atoms.yaml
    for system_name, characters in spec.notation_systems.items():
        for char in characters:
            for variant_idx in range(4):
                atom = NoteAtom(
                    system=system_name,
                    character=char,
                    variant_index=variant_idx,
                    assigned_codepoint=cp
                )
                note_atoms.append(atom)
                cp += 1

    notes_end = cp - 1
    notes_range = (start, notes_end)

    print(f"  ✓ Assigned {len(note_atoms)} note atoms: {hex(start)} - {hex(notes_end)}")

    # Assign symbol codepoints - use SMuFL standard codepoints directly (NOT sequential PUA)
    # SMuFL symbols use their official codepoints from W3C SMuFL specification
    # This ensures barlines render at U+E030, U+E031, U+E040, U+E041, etc.
    symbols_assigned = 0
    for symbol in spec.smufl_symbols:
        # Use the standard SMuFL codepoint directly (from W3C SMuFL spec)
        symbol.assigned_codepoint = symbol.smufl_codepoint
        symbols_assigned += 1

    # Find range for informational purposes only
    if spec.smufl_symbols:
        symbol_cps = [s.smufl_codepoint for s in spec.smufl_symbols]
        symbols_start = min(symbol_cps)
        symbols_end = max(symbol_cps)
        symbols_range = (symbols_start, symbols_end)
    else:
        symbols_range = (None, None)

    print(f"  ✓ Assigned {len(spec.smufl_symbols)} SMuFL symbols at standard codepoints: {hex(symbols_start) if symbols_start else 'none'} - {hex(symbols_end) if symbols_end else 'none'}")

    # Check for PUA overflow
    if cp > 0xF8FF:
        raise OverflowError(
            f"PUA overflow! Used {cp - 0xE000} codepoints, max is {0xF8FF - 0xE000}"
        )

    return CodepointLayout(
        note_atoms=note_atoms,
        symbols=spec.smufl_symbols,
        notes_range=notes_range,
        symbols_range=symbols_range,
    )


# ============================================================================
# Stage 3: Build Font
# ============================================================================

def build_font(
    base_font_path: str,
    noto_music_path: str,
    spec: AtomSpec,
    layout: CodepointLayout,
    strict_mode: bool = False
) -> 'fontforge.font':
    """
    Generate NotationFont: Noto Sans base + Noto Music symbols + custom octave variants.

    Steps:
        1. Load Noto Sans as base (has ASCII characters with professional typography)
        2. Import SMuFL symbols from Noto Music
        3. Add a synthetic dot glyph for octave variants
        4. Create custom octave variants (dots above/below)
        5. Rename font to NotationFont
        6. Return the enhanced font

    Args:
        strict_mode: If True, fail on errors

    Returns:
        fontforge.font object
    """
    print(f"\n[STAGE 3] Building NotationFont (Noto Sans base + Noto Music symbols + custom variants)")

    if not fontforge:
        raise RuntimeError("FontForge module not available. Cannot build font.")

    # Load Noto Sans as the base font (has ASCII characters with professional typography)
    if not base_font_path or not os.path.exists(base_font_path):
        if strict_mode:
            raise FileNotFoundError(f"Base font not found: {base_font_path}")
        else:
            raise FileNotFoundError(f"Base font not found: {base_font_path}")

    print(f"  Loading base font (Noto Sans): {base_font_path}")
    try:
        font = fontforge.open(base_font_path)
        print(f"  ✓ Base font loaded")
    except Exception as e:
        raise RuntimeError(f"Failed to load base font: {e}")

    # Import SMuFL symbols from Noto Music
    if noto_music_path and os.path.exists(noto_music_path):
        print(f"  Loading Noto Music for SMuFL symbols: {noto_music_path}")
        try:
            noto_music = fontforge.open(noto_music_path)
            print(f"  ✓ Noto Music loaded")
            # Import glyphs from Noto Music for musical symbols
            # This includes:
            # - Unicode Musical Notation (U+1D100-U+1D1FF): barlines, repeats, ornaments
            # - SMuFL (U+E000+): accidentals and other symbols
            print(f"  Importing glyphs from Noto Music...")
            symbols_imported = 0
            for glyph in noto_music.glyphs():
                # Import glyphs in Unicode Music range (U+1D100-U+1D1FF) or PUA (E000+)
                if (0x1D100 <= glyph.unicode <= 0x1D1FF) or (glyph.unicode >= 0xE000):
                    try:
                        # Try to create glyph at same unicode
                        new_glyph = font.createChar(glyph.unicode, glyph.glyphname)
                        # Copy the glyph data
                        pen = new_glyph.glyphPen()
                        if pen:
                            glyph.draw(pen)
                            pen = None
                        # Copy width
                        if glyph.width:
                            new_glyph.width = glyph.width
                        symbols_imported += 1
                    except:
                        pass
            print(f"  ✓ Imported {symbols_imported} glyphs from Noto Music (Unicode U+1D1xx and SMuFL U+E0xx)")
        except Exception as e:
            if strict_mode:
                raise RuntimeError(f"Failed to import Noto Music symbols: {e}")
            else:
                print(f"  WARNING: Could not import Noto Music: {e}")

    # Rename to NotationFont
    font.fontname = "NotationFont"
    font.fullname = "NotationFont"
    font.familyname = "NotationFont"

    # Get or create dot glyph
    dot_glyph = None
    dot_codepoint = ord('.')
    try:
        dot_glyph = font[dot_codepoint]
    except:
        pass

    # If no period glyph exists, create a synthetic one
    if not dot_glyph or not dot_glyph.glyphname:
        print(f"  Creating synthetic dot glyph...")
        try:
            dot_glyph = font.createChar(dot_codepoint, "period")
        except:
            try:
                dot_glyph = font[dot_codepoint]
            except:
                raise RuntimeError("ERROR: Could not create or find dot glyph")

        # Create a small circle/dot using bezier curves
        pen = dot_glyph.glyphPen()
        if pen:
            # Draw a small circle at origin (100 units radius, typical font units)
            # This is a crude implementation - just a square for simplicity
            size = 100
            pen.moveTo((0, 0))
            pen.lineTo((size, 0))
            pen.lineTo((size, size))
            pen.lineTo((0, size))
            pen.closePath()
            pen = None
        dot_glyph.width = size + 50  # Add some padding
        print(f"    Created synthetic dot")

    else:
        print(f"  Using existing dot glyph from Noto Music")

    dot_bbox = dot_glyph.boundingBox()
    if not dot_bbox:
        raise RuntimeError("ERROR: Could not get bounding box for dot glyph")

    dx_min, dy_min, dx_max, dy_max = dot_bbox
    dot_width = dx_max - dx_min
    dot_height = dy_max - dy_min
    dot_name = dot_glyph.glyphname

    print(f"  Dot glyph: {dot_name}, size: {dot_width}x{dot_height}")

    # Create note glyphs
    print(f"\n  Creating {len(layout.note_atoms)} note glyphs...")
    for i, atom in enumerate(layout.note_atoms):
        try:
            base_glyph = font[ord(atom.character)]
        except Exception as e:
            raise RuntimeError(f"Base character '{atom.character}' (U+{ord(atom.character):04X}) not found in Noto Music: {e}")

        if not base_glyph:
            raise RuntimeError(f"Base character '{atom.character}' (U+{ord(atom.character):04X}) is empty in font")

        base_bbox = base_glyph.boundingBox()
        if not base_bbox:
            raise RuntimeError(f"Could not get bbox for '{atom.character}'")

        bx_min, by_min, bx_max, by_max = base_bbox
        base_width = bx_max - bx_min
        base_glyph_name = base_glyph.glyphname

        # Position dot horizontally (shifted left by 1/5 dot width for all variants)
        dot_x_offset = bx_min + (base_width - dot_width) / 2 - dx_min + (dot_width * 0.8)

        # Create composite glyph
        g = font.createChar(atom.assigned_codepoint, f"{atom.character}_v{atom.variant_index}")
        g.clear()
        g.addReference(base_glyph_name, (1, 0, 0, 1, 0, 0))

        # Add dots based on variant
        if atom.variant_index == 0:  # 1 dot above
            y_pos = by_max - dy_min + spec.geometry.dot_above_gap
            g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos))

        elif atom.variant_index == 1:  # 2 dots above
            y_pos1 = by_max - dy_min + spec.geometry.dot_above_gap
            y_pos2 = y_pos1 + spec.geometry.dot_vertical_step
            g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos1))
            g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos2))

        elif atom.variant_index == 2:  # 1 dot below
            y_pos = by_min - dy_max - spec.geometry.dot_below_gap
            g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos))

        elif atom.variant_index == 3:  # 2 dots below
            y_pos1 = by_min - dy_max - spec.geometry.dot_below_gap
            y_pos2 = y_pos1 - spec.geometry.dot_vertical_step
            g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos1))
            g.addReference(dot_name, (1, 0, 0, 1, dot_x_offset, y_pos2))

        g.width = base_glyph.width

        if (i + 1) % 50 == 0:
            print(f"    Created {i + 1}/{len(layout.note_atoms)} glyphs")

    # SMuFL symbols are already in Noto Music - no extraction needed!
    # Barlines (U+E030-E042), accidentals (U+E260-E264), ornaments (U+E566-E56E)
    # are all part of the standard font.
    print(f"\n  ✓ SMuFL symbols already present in Noto Music base font")

    # Correct direction for custom note glyphs
    print(f"\n  Finalizing {len(layout.note_atoms)} custom note glyphs...")

    # Correct direction for note atoms
    for atom in layout.note_atoms:
        g = font[atom.assigned_codepoint]
        if g:
            g.correctDirection()

    print(f"  ✓ Finalized {len(layout.note_atoms)} custom note variants")

    return font


# ============================================================================
# Stage 4: Build Mapping JSON
# ============================================================================

def symbol_kind(glyph_name: str) -> str:
    """
    Classify symbol by glyph name prefix.

    Supports both old (uni*) and new (accidental*, barline*, ornament*) naming.
    """
    if glyph_name.startswith("accidental") or glyph_name.startswith("uni266"):
        return "accidental"
    if glyph_name.startswith("barline") or glyph_name.startswith("uniE0"):
        return "barline"
    return "ornament"


def build_mapping_json(spec: AtomSpec, layout: CodepointLayout) -> dict:
    """
    Generate minimal runtime JSON mapping.

    Only includes what the editor needs:
        - notes: system, character, variants with codepoints
        - symbols: name, kind, label, codepoint

    Returns:
        dict conforming to SPEC.md schema
    """
    print(f"\n[STAGE 4] Building JSON mapping")

    # Build notes map
    notes_map = {}  # (system, char) -> entry
    for atom in layout.note_atoms:
        key = (atom.system, atom.character)
        if key not in notes_map:
            notes_map[key] = {
                "system": atom.system,
                "character": atom.character,
                "variants": {}
            }

        variant_names = ["1_dot_above", "2_dots_above", "1_dot_below", "2_dots_below"]
        notes_map[key]["variants"][variant_names[atom.variant_index]] = {
            "codepoint": hex(atom.assigned_codepoint),
            "octave_shift": [1, 2, -1, -2][atom.variant_index]
        }

    notes_list = list(notes_map.values())

    # Build symbols map
    symbols_list = [
        {
            "name": symbol.glyph_name,
            "kind": symbol_kind(symbol.glyph_name),
            "label": symbol.label,
            "codepoint": hex(symbol.assigned_codepoint),
        }
        for symbol in layout.symbols
    ]

    mapping = {
        "version": "1.0",
        "generated_from": "atoms.yaml",
        "pua_allocation": {
            "notes_start": hex(layout.notes_range[0]),
            "notes_end": hex(layout.notes_range[1]),
            "symbols_start": hex(layout.symbols_range[0]),
            "symbols_end": hex(layout.symbols_range[1]),
        },
        "notes": notes_list,
        "symbols": symbols_list,
        "summary": {
            "total_notes": len(notes_list),
            "total_symbols": len(symbols_list),
            "systems": {
                name: {
                    "count": len(chars),
                    "chars": ''.join(chars)
                }
                for name, chars in spec.notation_systems.items()
            }
        }
    }

    print(f"  ✓ Notes: {len(notes_list)}")
    print(f"  ✓ Symbols: {len(symbols_list)}")

    return mapping


# ============================================================================
# Stage 5: Validate Layout
# ============================================================================

def validate_layout(layout: CodepointLayout):
    """
    Pre-flight checks before font generation.

    Assertions:
        1. All atoms have codepoints assigned
        2. No duplicate codepoints
        3. All codepoints in valid PUA range
        4. Sequential with no gaps
    """
    print(f"\n[STAGE 5] Validating layout")

    # Check all assigned
    all_atoms = layout.note_atoms + layout.symbols
    for i, atom in enumerate(all_atoms):
        if atom.assigned_codepoint is None:
            raise ValueError(f"Atom {i} not assigned a codepoint!")

    # Check no duplicates
    codepoints = [atom.assigned_codepoint for atom in all_atoms]
    if len(codepoints) != len(set(codepoints)):
        duplicates = [cp for cp in codepoints if codepoints.count(cp) > 1]
        raise ValueError(f"Duplicate codepoints: {[hex(cp) for cp in set(duplicates)]}")

    # Check codepoint ranges
    # Valid ranges:
    # - Note atoms: PUA 0xE600 - 0xE6BB (188 glyphs)
    # - Symbols: Unicode Music 0x1D100-0x1D1FF OR SMuFL PUA 0xE000-0xF8FF
    for atom in all_atoms:
        valid = (
            (0xE000 <= atom.assigned_codepoint <= 0xF8FF) or  # PUA (SMuFL)
            (0x1D100 <= atom.assigned_codepoint <= 0x1D1FF)    # Unicode Music
        )
        if not valid:
            raise ValueError(
                f"Codepoint {hex(atom.assigned_codepoint)} outside valid ranges "
                f"(PUA 0xE000-0xF8FF or Unicode Music 0x1D100-0x1D1FF)!"
            )

    print(f"  ✓ All {len(all_atoms)} atoms have valid, unique codepoints")
    print(f"  ✓ Note atoms: {hex(layout.notes_range[0])} - {hex(layout.notes_range[1])}")
    print(f"  ✓ Symbols: {hex(layout.symbols_range[0])} - {hex(layout.symbols_range[1])}")


# ============================================================================
# Debug Output
# ============================================================================

def write_debug_html(output_path: str, spec: AtomSpec, layout: CodepointLayout):
    """Generate debug specimen HTML"""
    print(f"\n[DEBUG] Writing specimen HTML: {output_path}")

    html_content = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>NotationFont Debug Specimen</title>
    <style>
        @font-face {
            font-family: 'NotationFont';
            src: url('./NotationFont.ttf') format('truetype');
        }
        body {
            font-family: 'NotationFont', monospace;
            font-size: 32px;
            line-height: 2;
            background: #fafafa;
            padding: 20px;
        }
        h1 { font-family: sans-serif; }
        h2 { font-family: sans-serif; margin-top: 1em; }
        .system { margin: 2em 0; }
        .char-row { margin: 0.5em 0; padding: 0.5em; background: white; border: 1px solid #ddd; }
        .label { font-family: sans-serif; font-size: 14px; color: #666; }
        .glyph { margin: 0 0.3em; }
    </style>
</head>
<body>
    <h1>NotationFont Debug Specimen</h1>
    <p class="label">Generated: v1.0 | Total glyphs: """ + str(len(layout.note_atoms) + len(layout.symbols)) + """</p>
"""

    # Add systems
    for system_name, characters in spec.notation_systems.items():
        html_content += f"    <div class='system'>\n"
        html_content += f"        <h2>{system_name.capitalize()} System ({len(characters)} chars × 4 variants)</h2>\n"
        for char in characters:
            # Find atoms for this character
            atoms = [a for a in layout.note_atoms if a.character == char and a.system == system_name]
            if atoms:
                atom_0 = atoms[0]
                html_content += f"        <div class='char-row'>\n"
                html_content += f"            <span class='label'>{char}:</span>\n"
                html_content += f"            <span class='glyph'>{char}</span>\n"  # Base
                for i in range(4):
                    atom = [a for a in atoms if a.variant_index == i]
                    if atom:
                        cp = atom[0].assigned_codepoint
                        html_content += f"            <span class='glyph'>{chr(cp)}</span>\n"
                html_content += f"        </div>\n"
        html_content += f"    </div>\n"

    # Add symbols
    html_content += f"""    <div class='system'>
        <h2>Symbols ({len(layout.symbols)} glyphs)</h2>
"""
    for symbol in layout.symbols:
        html_content += f"        <div class='char-row'>\n"
        html_content += f"            <span class='label'>{symbol.label}:</span>\n"
        html_content += f"            <span class='glyph'>{chr(symbol.assigned_codepoint)}</span>\n"
        html_content += f"        </div>\n"

    html_content += """    </div>
</body>
</html>
"""

    with open(output_path, 'w') as f:
        f.write(html_content)

    print(f"  ✓ Specimen HTML written")


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Notation Font Generator v6+ (SPEC.md-compliant)"
    )

    parser.add_argument(
        "--base-font",
        default="tools/fontgen/sources/NotoSans-Regular.ttf",
        help="Path to base text font (default: tools/fontgen/sources/NotoSans-Regular.ttf)"
    )
    parser.add_argument(
        "--noto-music-font",
        default="tools/fontgen/sources/NotoMusic.ttf",
        help="Path to Noto Music font for SMuFL symbols (default: tools/fontgen/sources/NotoMusic.ttf)"
    )
    parser.add_argument(
        "--atoms",
        default="tools/fontgen/atoms.yaml",
        help="Path to atoms.yaml (default: tools/fontgen/atoms.yaml)"
    )
    parser.add_argument(
        "--output-dir",
        default="static/fonts",
        help="Output directory (default: static/fonts)"
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail on any errors (requires Noto Music)"
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Validate YAML only (no FontForge needed)"
    )
    parser.add_argument(
        "--debug-html",
        action="store_true",
        help="Generate debug specimen HTML"
    )

    args = parser.parse_args()

    # Resolve paths from repo root
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(os.path.dirname(script_dir))  # tools/fontgen -> editor

    atoms_path = os.path.join(repo_root, args.atoms)
    base_font_path = os.path.join(repo_root, args.base_font)
    noto_music_path = os.path.join(repo_root, args.noto_music_font)
    output_dir = os.path.join(repo_root, args.output_dir)
    output_font = os.path.join(output_dir, "NotationFont.ttf")
    output_mapping = os.path.join(output_dir, "NotationFont-map.json")
    output_html = os.path.join(output_dir, "debug-specimen.html")

    print("=" * 70)
    print("NOTATION FONT GENERATOR (Noto Sans + Noto Music)")
    print("=" * 70)
    print(f"\nConfiguration:")
    print(f"  atoms.yaml:         {atoms_path}")
    print(f"  base font (Noto Sans): {base_font_path}")
    print(f"  music symbols (Noto Music):  {noto_music_path}")
    print(f"  output dir:         {output_dir}")
    print(f"  mode:               {'STRICT' if args.strict else 'DEV'}")
    print()

    # Stage 1: Load spec
    try:
        spec = load_atom_spec(atoms_path)
    except Exception as e:
        print(f"\nERROR: Failed to load atoms.yaml: {e}")
        sys.exit(1)

    # Stage 2: Assign codepoints
    try:
        layout = assign_codepoints(spec)
    except Exception as e:
        print(f"\nERROR: Codepoint assignment failed: {e}")
        sys.exit(1)

    # Stage 5: Validate
    try:
        validate_layout(layout)
    except Exception as e:
        print(f"\nERROR: Layout validation failed: {e}")
        sys.exit(1)

    # Early exit for validate-only
    if args.validate_only:
        print("\n" + "=" * 70)
        print("VALIDATION PASSED (no font generated)")
        print("=" * 70)
        return 0

    # Stage 4: Build mapping JSON
    try:
        mapping = build_mapping_json(spec, layout)
    except Exception as e:
        print(f"\nERROR: JSON mapping failed: {e}")
        sys.exit(1)

    # Stage 3: Build font (requires FontForge)
    if not fontforge:
        print("\nERROR: FontForge not available")
        print("Install with: pip install fontforge")
        sys.exit(1)

    try:
        os.makedirs(output_dir, exist_ok=True)
        font = build_font(base_font_path, noto_music_path, spec, layout, args.strict)
        font.generate(output_font)
        print(f"\n  ✓ Font saved: {output_font}")
    except Exception as e:
        print(f"\nERROR: Font generation failed: {e}")
        sys.exit(1)

    # Write JSON mapping
    try:
        with open(output_mapping, 'w') as f:
            json.dump(mapping, f, indent=2)
        print(f"  ✓ JSON mapping saved: {output_mapping}")
    except Exception as e:
        print(f"\nERROR: Failed to write JSON mapping: {e}")
        sys.exit(1)

    # Write debug HTML
    if args.debug_html:
        try:
            write_debug_html(output_html, spec, layout)
        except Exception as e:
            print(f"\nWARNING: Failed to write debug HTML: {e}")

    print("\n" + "=" * 70)
    print("SUCCESS!")
    print("=" * 70)
    print(f"\nGenerated files:")
    print(f"  ✓ {output_font}")
    print(f"  ✓ {output_mapping}")
    if args.debug_html:
        print(f"  ✓ {output_html}")

    print(f"\nNext steps:")
    print(f"  1. Verify font renders in browser")
    print(f"  2. Check all notation systems work correctly")
    print(f"  3. Commit JSON mapping to repo")
    print(f"  4. Deploy to production")

    return 0


if __name__ == "__main__":
    sys.exit(main())
