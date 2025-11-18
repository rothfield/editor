#!/usr/bin/env python3
"""
Test glyph widths in the generated NotationFont.ttf

This test verifies that:
1. All generated composite glyphs have their widths set correctly
2. Composite glyphs inherit width from their base character
3. No glyphs have zero width (rendering issue)

Run with: pytest test_glyph_widths.py -v

To investigate the issue:
- If test fails on font level: it's a font generation issue in generate.py
- If font passes but UI shows wrong width: it's a rendering/CSS issue
"""

import os
import sys
import pytest

# Try to import fontforge (required for these tests)
try:
    import fontforge
except ImportError:
    pytest.skip("FontForge not available - skipping glyph width tests", allow_module_level=True)

# Import generator modules
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

from generate import load_atom_spec, assign_codepoints


@pytest.fixture
def atoms_yaml_path():
    """Path to atoms.yaml"""
    return os.path.join(script_dir, "atoms.yaml")


@pytest.fixture
def font_path():
    """Path to generated NotationFont.ttf"""
    repo_root = os.path.dirname(os.path.dirname(script_dir))
    return os.path.join(repo_root, "dist/fonts/NotationFont-Number.ttf")


@pytest.fixture
def spec(atoms_yaml_path):
    """Load atom specification"""
    return load_atom_spec(atoms_yaml_path)


@pytest.fixture
def layout(spec):
    """Generate codepoint layout"""
    return assign_codepoints(spec)


@pytest.fixture
def font(font_path):
    """Load generated font file"""
    if not os.path.exists(font_path):
        pytest.skip(f"Font not found: {font_path}. Run generate.py first.")
    return fontforge.open(font_path)


# ============================================================================
# Base Character Width Tests
# ============================================================================

class TestBaseCharacterWidths:
    """Verify base characters have non-zero widths"""

    def test_base_chars_have_width(self, font, spec):
        """All base characters (1-7, A-Z, a-z, etc.) have non-zero width"""
        all_chars = spec.character_order
        failures = []

        for char in all_chars:
            try:
                glyph = font[ord(char)]
                if glyph.width == 0:
                    failures.append(f"Character '{char}' (U+{ord(char):04X}) has zero width")
            except Exception as e:
                failures.append(f"Character '{char}' (U+{ord(char):04X}) not found: {e}")

        if failures:
            pytest.fail("\n".join(failures))

    def test_base_chars_positive_width(self, font, spec):
        """All base characters have positive advance width"""
        all_chars = spec.character_order
        failures = []

        for char in all_chars:
            try:
                glyph = font[ord(char)]
                if glyph.width <= 0:
                    failures.append(
                        f"Character '{char}' (U+{ord(char):04X}) has "
                        f"invalid width: {glyph.width}"
                    )
            except Exception as e:
                failures.append(f"Character '{char}' (U+{ord(char):04X}) not found: {e}")

        if failures:
            pytest.fail("\n".join(failures))


# ============================================================================
# Octave Variant Width Tests
# ============================================================================

class TestOctaveVariantWidths:
    """Verify octave variant glyphs have same width as base character"""

    def test_octave_variants_match_base_width(self, font, spec, layout):
        """Octave variants (with dots) should have same width as base character"""
        failures = []

        for atom in layout.note_atoms:
            base_char = atom.character
            variant_cp = atom.assigned_codepoint

            try:
                base_glyph = font[ord(base_char)]
                variant_glyph = font[variant_cp]

                base_width = base_glyph.width
                variant_width = variant_glyph.width

                if variant_width != base_width:
                    variant_names = ["1_dot_above", "2_dots_above", "1_dot_below", "2_dots_below"]
                    variant_name = variant_names[atom.variant_index]
                    failures.append(
                        f"Octave variant '{base_char}' {variant_name} (U+{variant_cp:04X}): "
                        f"width={variant_width}, expected {base_width} (base char width)"
                    )

                if variant_width == 0:
                    failures.append(
                        f"Octave variant '{base_char}' (U+{variant_cp:04X}) has ZERO width!"
                    )

            except Exception as e:
                failures.append(
                    f"Error checking octave variant '{base_char}' (U+{variant_cp:04X}): {e}"
                )

        if failures:
            pytest.fail("\n".join(failures[:20]))  # Show first 20 failures


# ============================================================================
# Accidental Composite Width Tests
# ============================================================================

class TestAccidentalCompositeWidths:
    """Verify accidental composite glyphs (e.g., 1#, 6b) have correct widths"""

    def test_sharp_composites_have_width(self, font, spec):
        """Sharp composite glyphs (1#, 2#, etc.) should have same width as base char"""
        # Sharp composites: 0xE1F0 - 0xE21E (47 glyphs)
        all_chars = list(spec.character_order)
        failures = []

        for i, base_char in enumerate(all_chars):
            sharp_cp = 0xE1F0 + i

            try:
                base_glyph = font[ord(base_char)]
                sharp_glyph = font[sharp_cp]

                base_width = base_glyph.width
                sharp_width = sharp_glyph.width

                if sharp_width == 0:
                    failures.append(
                        f"Sharp composite '{base_char}#' (U+{sharp_cp:04X}) has ZERO width!"
                    )

                if sharp_width != base_width:
                    failures.append(
                        f"Sharp composite '{base_char}#' (U+{sharp_cp:04X}): "
                        f"width={sharp_width}, expected {base_width} (base char width)"
                    )

            except Exception as e:
                failures.append(
                    f"Error checking sharp composite '{base_char}#' (U+{sharp_cp:04X}): {e}"
                )

        if failures:
            pytest.fail("\n".join(failures[:20]))

    def test_flat_composites_have_width(self, font, spec):
        """Flat composite glyphs (1b, 6b, etc.) should have same width as base char"""
        # Flat composites: 0xE220 - 0xE24E (47 glyphs)
        all_chars = list(spec.character_order)
        failures = []

        for i, base_char in enumerate(all_chars):
            flat_cp = 0xE220 + i

            try:
                base_glyph = font[ord(base_char)]
                flat_glyph = font[flat_cp]

                base_width = base_glyph.width
                flat_width = flat_glyph.width

                if flat_width == 0:
                    failures.append(
                        f"Flat composite '{base_char}b' (U+{flat_cp:04X}) has ZERO width! "
                        f"(Example: 6b would be at U+{0xE220 + 5:04X})"
                    )

                if flat_width != base_width:
                    failures.append(
                        f"Flat composite '{base_char}b' (U+{flat_cp:04X}): "
                        f"width={flat_width}, expected {base_width} (base char width)"
                    )

            except Exception as e:
                failures.append(
                    f"Error checking flat composite '{base_char}b' (U+{flat_cp:04X}): {e}"
                )

        if failures:
            pytest.fail("\n".join(failures[:20]))

    def test_6b_specifically(self, font):
        """Test the specific case of '6b' (6 flat) mentioned by user"""
        # Character '6' is at index 5 in the character_order (0-indexed)
        # Flat composite for '6' should be at 0xE220 + 5 = 0xE225
        char_6_cp = ord('6')
        flat_6_cp = 0xE225

        try:
            base_6 = font[char_6_cp]
            flat_6 = font[flat_6_cp]

            base_width = base_6.width
            flat_width = flat_6.width

            assert flat_width > 0, \
                f"6b (U+{flat_6_cp:04X}) has ZERO width! This is the reported bug."

            assert flat_width == base_width, \
                f"6b (U+{flat_6_cp:04X}) width mismatch: " \
                f"got {flat_width}, expected {base_width} (same as '6')"

        except Exception as e:
            pytest.fail(f"Failed to check 6b glyph: {e}")


# ============================================================================
# Accidental+Octave Composite Width Tests
# ============================================================================

class TestAccidentalOctaveCompositeWidths:
    """Verify combined accidental+octave glyphs have correct widths"""

    def test_sharp_octave_composites_have_width(self, font, spec):
        """Sharp+octave composites (1# with dots) should have base char width"""
        # Sharp+octave: 0xE2B0 - 0xE36F (188 glyphs: 47 chars × 4 variants)
        all_chars = list(spec.character_order)
        failures = []
        sample_failures = []

        for char_idx, base_char in enumerate(all_chars):
            try:
                base_glyph = font[ord(base_char)]
                base_width = base_glyph.width
            except:
                continue

            for variant_idx in range(4):
                composite_cp = 0xE2B0 + (char_idx * 4) + variant_idx

                try:
                    composite_glyph = font[composite_cp]
                    composite_width = composite_glyph.width

                    if composite_width == 0:
                        msg = f"Sharp+octave '{base_char}#' variant {variant_idx} (U+{composite_cp:04X}) has ZERO width!"
                        failures.append(msg)
                        if len(sample_failures) < 5:
                            sample_failures.append(msg)

                    if composite_width != base_width:
                        msg = f"Sharp+octave '{base_char}#' variant {variant_idx} (U+{composite_cp:04X}): width={composite_width}, expected {base_width}"
                        failures.append(msg)
                        if len(sample_failures) < 5:
                            sample_failures.append(msg)

                except Exception as e:
                    pass  # Glyph might not exist yet

        if failures:
            summary = f"\n{len(failures)} width mismatches found. Sample failures:\n"
            pytest.fail(summary + "\n".join(sample_failures))


# ============================================================================
# Width Consistency Tests
# ============================================================================

class TestWidthConsistency:
    """Cross-check width consistency across all glyph types"""

    def test_all_variants_of_char_have_same_width(self, font, spec, layout):
        """All variants of a character (base, octave, accidental) should have same width"""
        all_chars = list(spec.character_order)
        failures = []

        for char_idx, base_char in enumerate(all_chars):
            try:
                base_glyph = font[ord(base_char)]
                expected_width = base_glyph.width
            except:
                continue

            widths_found = {
                'base': expected_width,
            }

            # Check octave variants (4 per char)
            for variant_idx in range(4):
                octave_cp = 0xE600 + (char_idx * 4) + variant_idx
                try:
                    glyph = font[octave_cp]
                    widths_found[f'octave_v{variant_idx}'] = glyph.width
                except:
                    pass

            # Check sharp composite
            try:
                sharp_cp = 0xE1F0 + char_idx
                sharp_glyph = font[sharp_cp]
                widths_found['sharp'] = sharp_glyph.width
            except:
                pass

            # Check flat composite
            try:
                flat_cp = 0xE220 + char_idx
                flat_glyph = font[flat_cp]
                widths_found['flat'] = flat_glyph.width
            except:
                pass

            # All widths should be the same
            unique_widths = set(widths_found.values())
            if len(unique_widths) > 1:
                failures.append(
                    f"Character '{base_char}' has inconsistent widths: {widths_found}"
                )

        if failures:
            pytest.fail("\n".join(failures[:10]))


# ============================================================================
# Diagnostic Tests
# ============================================================================

class TestWidthDiagnostics:
    """Diagnostic tests to help identify the root cause"""

    def test_print_sample_widths(self, font, spec):
        """Print sample widths for manual inspection (always passes)"""
        all_chars = list(spec.character_order)[:10]  # First 10 chars

        print("\n" + "="*70)
        print("SAMPLE GLYPH WIDTHS (first 10 characters)")
        print("="*70)

        for char_idx, base_char in enumerate(all_chars):
            try:
                base_glyph = font[ord(base_char)]
                base_width = base_glyph.width

                # Get octave variant width
                octave_cp = 0xE600 + (char_idx * 4)
                try:
                    octave_glyph = font[octave_cp]
                    octave_width = octave_glyph.width
                except:
                    octave_width = "N/A"

                # Get sharp composite width
                sharp_cp = 0xE1F0 + char_idx
                try:
                    sharp_glyph = font[sharp_cp]
                    sharp_width = sharp_glyph.width
                except:
                    sharp_width = "N/A"

                # Get flat composite width
                flat_cp = 0xE220 + char_idx
                try:
                    flat_glyph = font[flat_cp]
                    flat_width = flat_glyph.width
                except:
                    flat_width = "N/A"

                print(f"'{base_char}': base={base_width}, octave={octave_width}, "
                      f"sharp={sharp_width}, flat={flat_width}")

            except Exception as e:
                print(f"'{base_char}': ERROR - {e}")

        print("="*70)
        # This test always passes - it's just for diagnostics
        assert True

    def test_identify_zero_width_glyphs(self, font):
        """Identify all glyphs with zero width (always passes, just reports)"""
        zero_width_glyphs = []

        for glyph in font.glyphs():
            if glyph.width == 0 and glyph.unicode > 0:
                zero_width_glyphs.append((glyph.glyphname, glyph.unicode, glyph.width))

        if zero_width_glyphs:
            print("\n" + "="*70)
            print(f"ZERO-WIDTH GLYPHS FOUND: {len(zero_width_glyphs)}")
            print("="*70)
            for name, cp, width in zero_width_glyphs[:20]:  # Show first 20
                print(f"  {name} (U+{cp:04X}): width={width}")
            print("="*70)

        # This test always passes - it's just for diagnostics
        assert True


# ============================================================================
# Run tests
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
