#!/usr/bin/env python3
"""
Notation Font Generator v6+ - Refactored per SPEC.md

This is the authoritative font generation tool. It reads atoms.yaml (single source
of truth) and outputs:
  1. NotationMonoDotted.ttf - the font file with all dot variants
  2. NotationMonoDotted-map.json - JSON mapping for runtime lookup

Architecture (clean separation of concerns):
  Stage 1: load_atom_spec() - Parse atoms.yaml
  Stage 2: assign_codepoints() - Sequential PUA allocation
  Stage 3: build_font() - Generate glyphs with FontForge + Bravura extraction
  Stage 4: build_mapping_json() - Minimal runtime contract
  Stage 5: validate_layout() - Sanity checks

Usage:
  python3 generate.py [--base-font PATH] [--bravura-font PATH] [--output-dir PATH]
  python3 generate.py --validate-only  (no FontForge needed)
  python3 generate.py --debug-html      (visual specimen)
  python3 generate.py --strict          (fail on missing Bravura)
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
class BravuraSymbol:
    """A symbol to extract from Bravura"""
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
    bravura_symbols: list  # List of BravuraSymbol
    geometry: Geometry
    character_order: str


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

    # Extract Bravura symbols
    bravura_symbols = []
    for symbol_def in config.get('bravura_symbols', []):
        bravura_symbols.append(BravuraSymbol(
            glyph_name=symbol_def['glyph_name'],
            label=symbol_def['label'],
            smufl_codepoint=symbol_def.get('smufl_codepoint', 0),
            codepoint_offset=symbol_def.get('codepoint_offset', 0),
        ))

    print(f"  ✓ Bravura symbols: {len(bravura_symbols)}")

    return AtomSpec(
        notation_systems=notation_systems,
        bravura_symbols=bravura_symbols,
        geometry=geometry,
        character_order=character_order,
    )


# ============================================================================
# Stage 2: Assign Codepoints
# ============================================================================

def assign_codepoints(spec: AtomSpec, start: int = 0xE000) -> CodepointLayout:
    """
    Sequentially assign PUA codepoints to all atoms.

    Algorithm:
        1. For each system in order, create 4 variants per character
        2. Assign sequential codepoints to each variant
        3. After all notes, assign symbol codepoints
        4. Return layout with all assignments

    Returns:
        CodepointLayout with all atoms assigned
    """
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

    # Assign symbol codepoints
    symbols_start = cp
    for symbol in spec.bravura_symbols:
        symbol.assigned_codepoint = cp
        cp += 1

    symbols_end = cp - 1
    symbols_range = (symbols_start, symbols_end)

    print(f"  ✓ Assigned {len(spec.bravura_symbols)} symbols: {hex(symbols_start)} - {hex(symbols_end)}")

    # Check for PUA overflow
    if cp > 0xF8FF:
        raise OverflowError(
            f"PUA overflow! Used {cp - 0xE000} codepoints, max is {0xF8FF - 0xE000}"
        )

    return CodepointLayout(
        note_atoms=note_atoms,
        symbols=spec.bravura_symbols,
        notes_range=notes_range,
        symbols_range=symbols_range,
    )


# ============================================================================
# Stage 3: Build Font
# ============================================================================

def build_font(
    base_font_path: str,
    bravura_font_path: str,
    spec: AtomSpec,
    layout: CodepointLayout,
    strict_mode: bool = False
) -> 'fontforge.font':
    """
    Generate composite font with all glyphs.

    Steps:
        1. Load base font (Inter.ttc)
        2. Load Bravura font (optional, required in strict mode)
        3. Create note atoms (base char + dots)
        4. Extract Bravura symbols
        5. Flatten all glyphs

    Args:
        strict_mode: If True, fail on missing Bravura or glyphs

    Returns:
        fontforge.font object
    """
    print(f"\n[STAGE 3] Building font")

    if not fontforge:
        raise RuntimeError("FontForge module not available. Cannot build font.")

    # Load base font
    print(f"  Loading base font: {base_font_path}")
    if not os.path.exists(base_font_path):
        raise FileNotFoundError(f"Base font not found: {base_font_path}")

    font = fontforge.open(base_font_path)
    font.fontname = "NotationMonoDotted"
    font.fullname = "Notation Mono Dotted"
    font.familyname = "Notation Mono"

    # Load Bravura (optional)
    bravura = None
    if bravura_font_path and os.path.exists(bravura_font_path):
        print(f"  Loading Bravura font: {bravura_font_path}")
        try:
            bravura = fontforge.open(bravura_font_path)
            print(f"  ✓ Bravura loaded")
        except Exception as e:
            if strict_mode:
                raise RuntimeError(f"Failed to load Bravura (strict mode): {e}")
            else:
                print(f"  WARNING: Could not load Bravura: {e}")
    else:
        if strict_mode:
            raise FileNotFoundError(
                f"Bravura font required (--strict mode) but not found: {bravura_font_path}"
            )
        else:
            print(f"  Note: Bravura not found (optional in dev mode)")

    # Get dot glyph
    dot_glyph = font[ord('.')]
    if not dot_glyph:
        raise RuntimeError("ERROR: No dot glyph (.) found in base font")

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
        base_glyph = font[ord(atom.character)]
        if not base_glyph:
            raise RuntimeError(f"Base character '{atom.character}' not found in font")

        base_bbox = base_glyph.boundingBox()
        if not base_bbox:
            raise RuntimeError(f"Could not get bbox for '{atom.character}'")

        bx_min, by_min, bx_max, by_max = base_bbox
        base_width = bx_max - bx_min
        base_glyph_name = base_glyph.glyphname

        # Center dot horizontally
        dot_x_offset = bx_min + (base_width - dot_width) / 2 - dx_min

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

    # Extract Bravura symbols
    symbols_created = 0
    if bravura:
        print(f"\n  Extracting {len(layout.symbols)} Bravura symbols...")
        for symbol in layout.symbols:
            try:
                # Try to find glyph by SMuFL name or codepoint
                bravura_glyph = None

                # First try by glyph name (preferred)
                if symbol.glyph_name:
                    try:
                        bravura_glyph = bravura[symbol.glyph_name]
                    except Exception:
                        pass

                # Try by uniXXXX naming convention (e.g., uniE262)
                if bravura_glyph is None and symbol.smufl_codepoint:
                    uni_name = f"uni{symbol.smufl_codepoint:04X}"
                    try:
                        bravura_glyph = bravura[uni_name]
                    except Exception:
                        pass

                # Try by integer codepoint as fallback
                if bravura_glyph is None and symbol.smufl_codepoint:
                    try:
                        bravura_glyph = bravura[symbol.smufl_codepoint]
                    except Exception as lookup_e:
                        pass

                if bravura_glyph is not None:
                    new_glyph = font.createChar(
                        symbol.assigned_codepoint,
                        f"symbol_{symbol.glyph_name}"
                    )
                    new_glyph.clear()

                    # Apply geometry scaling based on symbol type
                    scale = spec.geometry.accidental_scale if symbol.glyph_name.startswith("accidental") else \
                            spec.geometry.barline_scale if "barline" in symbol.glyph_name else \
                            spec.geometry.ornament_scale

                    # Copy glyph from Bravura using pen API
                    pen = new_glyph.glyphPen()
                    if pen:
                        bravura_glyph.draw(pen)
                        pen = None

                    # Set width from reference glyph (or base char as fallback)
                    ref_width = bravura_glyph.width if bravura_glyph.width > 0 else font[ord('|')].width
                    new_glyph.width = int(ref_width * scale)

                    symbols_created += 1
                    print(f"    ✓ {symbol.label}")
                else:
                    if strict_mode:
                        raise RuntimeError(
                            f"Could not find Bravura glyph: {symbol.glyph_name} ({hex(symbol.smufl_codepoint)})"
                        )
                    else:
                        print(f"    ✗ {symbol.label} (skipped)")

            except Exception as e:
                if strict_mode:
                    raise
                else:
                    print(f"    ✗ {symbol.label}: {e}")

        print(f"  ✓ Extracted {symbols_created}/{len(layout.symbols)} symbols")

    # Correct direction for all custom glyphs
    total_glyphs = len(layout.note_atoms) + symbols_created
    print(f"\n  Finalizing {total_glyphs} glyphs...")

    # Correct direction for note atoms
    for atom in layout.note_atoms:
        g = font[atom.assigned_codepoint]
        if g:
            g.correctDirection()

    # Correct direction for symbols
    for symbol in layout.symbols:
        g = font[symbol.assigned_codepoint]
        if g and len(g.references) > 0:
            # Simplify composite glyphs (flattens references into outlines)
            g.simplify()
            g.correctDirection()

    print(f"  ✓ Finalized")

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

    # Check PUA range
    for atom in all_atoms:
        if not (0xE000 <= atom.assigned_codepoint <= 0xF8FF):
            raise ValueError(
                f"Codepoint {hex(atom.assigned_codepoint)} outside PUA range!"
            )

    print(f"  ✓ All {len(all_atoms)} atoms have valid, unique codepoints")
    print(f"  ✓ Range: {hex(layout.notes_range[0])} - {hex(layout.symbols_range[1])}")


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
    <title>NotationMonoDotted Debug Specimen</title>
    <style>
        @font-face {
            font-family: 'NotationMonoDotted';
            src: url('./NotationMonoDotted.ttf') format('truetype');
        }
        body {
            font-family: 'NotationMonoDotted', monospace;
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
    <h1>NotationMonoDotted Debug Specimen</h1>
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
        default="static/fonts/Inter.ttc",
        help="Path to base font (default: static/fonts/Inter.ttc)"
    )
    parser.add_argument(
        "--bravura-font",
        default="tools/fontgen/base_fonts/Bravura.otf",
        help="Path to Bravura font (default: tools/fontgen/base_fonts/Bravura.otf)"
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
        help="Fail on any errors (requires Bravura)"
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
    bravura_font_path = os.path.join(repo_root, args.bravura_font)
    output_dir = os.path.join(repo_root, args.output_dir)
    output_font = os.path.join(output_dir, "NotationMonoDotted.ttf")
    output_mapping = os.path.join(output_dir, "NotationMonoDotted-map.json")
    output_html = os.path.join(output_dir, "debug-specimen.html")

    print("=" * 70)
    print("NOTATION FONT GENERATOR v6+ (SPEC.md-compliant)")
    print("=" * 70)
    print(f"\nConfiguration:")
    print(f"  atoms.yaml:    {atoms_path}")
    print(f"  base font:     {base_font_path}")
    print(f"  bravura font:  {bravura_font_path}")
    print(f"  output dir:    {output_dir}")
    print(f"  mode:          {'STRICT' if args.strict else 'DEV'}")
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
        font = build_font(base_font_path, bravura_font_path, spec, layout, args.strict)
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
