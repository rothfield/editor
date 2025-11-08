#!/usr/bin/env python3
"""
Notation Font Generator - Noto Music Edition
Generates NotationFont.ttf from Noto Music as the single source of truth.

Features:
  - Extract pitch characters (0-9, A-Z, a-z) from Noto Music
  - Generate octave variants with dots above/below
  - Generate accidental variants (char + sharp/flat/natural)
  - Extract musical symbols (barlines, ornaments) from Noto Music SMuFL glyphs
  - Single source of truth: atoms.yaml (read by both Python and build.rs)

Usage:
  python3 generate_noto.py [--config path/to/atoms.yaml] [--output path/to/NotationFont.ttf]
"""

import sys
import os
import yaml
import argparse
import fontforge
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)


class NotoMusicFontGenerator:
    """Generate NotationFont.ttf from Noto Music font."""

    def __init__(self, config_path: str, noto_font_path: str, output_path: str):
        """Initialize the font generator.

        Args:
            config_path: Path to atoms.yaml configuration file
            noto_font_path: Path to NotoMusic.ttf source font
            output_path: Path to write NotationFont.ttf output
        """
        self.config_path = config_path
        self.noto_font_path = noto_font_path
        self.output_path = output_path

        # Load configuration
        logger.info(f"Loading configuration from {config_path}")
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)

        # Validate required config fields
        self._validate_config()

        # Extract key configuration values
        self.char_order = self.config.get('character_order', '')
        self.pua_start = self.config.get('pua', {}).get('start', 0xE000)
        self.accidental_pua_start = 0xE1F0
        self.symbols_pua_start = 0xE220

        # Font metrics (will be extracted from Noto Music)
        self.noto_font = None
        self.output_font = None
        self.dot_glyph = None
        self.dot_bbox = None
        self.dot_width = None
        self.dot_height = None

        logger.info(f"Character order: {self.char_order} ({len(self.char_order)} chars)")
        logger.info(f"PUA allocation: 0x{self.pua_start:04X}")

    def _validate_config(self) -> None:
        """Validate required configuration fields."""
        required = ['character_order', 'notation_systems']
        for key in required:
            if key not in self.config:
                raise ValueError(f"Missing required field in atoms.yaml: {key}")

        if not self.config.get('character_order'):
            raise ValueError("character_order is empty in atoms.yaml")

    def generate(self) -> bool:
        """Generate the NotationFont.ttf file.

        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info("=" * 70)
            logger.info("NOTATION FONT GENERATOR - Noto Music Edition")
            logger.info("=" * 70)

            # Load source font
            if not self._load_noto_music():
                return False

            # Create output font
            if not self._create_output_font():
                return False

            # Extract base pitch characters
            logger.info(f"\nExtracting {len(self.char_order)} base pitch characters...")
            if not self._extract_base_characters():
                return False

            # Generate octave variants
            logger.info(f"\nGenerating octave variants (4 per character)...")
            if not self._generate_octave_variants():
                return False

            # Generate accidental variants
            logger.info(f"\nGenerating accidental variants (sharp glyphs)...")
            if not self._generate_accidental_variants():
                return False

            # Extract musical symbols
            logger.info(f"\nExtracting musical symbols from Noto Music...")
            if not self._extract_musical_symbols():
                return False

            # Set font metadata
            logger.info(f"\nSetting font metadata...")
            self._set_font_metadata()

            # Save output
            logger.info(f"\nSaving font to {self.output_path}...")
            if not self._save_font():
                return False

            logger.info("\n" + "=" * 70)
            logger.info("SUCCESS - NotationFont.ttf generated successfully!")
            logger.info("=" * 70)
            return True

        except Exception as e:
            logger.error(f"ERROR: {e}", exc_info=True)
            return False

    def _load_noto_music(self) -> bool:
        """Load the Noto Music font.

        Returns:
            True if successful, False otherwise
        """
        if not os.path.exists(self.noto_font_path):
            logger.error(f"Noto Music font not found: {self.noto_font_path}")
            return False

        try:
            logger.info(f"Loading Noto Music from {self.noto_font_path}")
            self.noto_font = fontforge.open(self.noto_font_path)

            # Extract dot glyph metrics
            dot_glyph = self.noto_font[ord('.')]
            if not dot_glyph:
                logger.error("No dot glyph (.) found in Noto Music font")
                return False

            self.dot_glyph = dot_glyph
            self.dot_bbox = dot_glyph.boundingBox()
            if not self.dot_bbox:
                logger.error("Could not get bounding box for dot glyph")
                return False

            dx_min, dy_min, dx_max, dy_max = self.dot_bbox
            self.dot_width = dx_max - dx_min
            self.dot_height = dy_max - dy_min

            logger.info(f"  ✓ Noto Music loaded")
            logger.info(f"  ✓ Dot glyph: '.' (bbox: {self.dot_bbox})")
            return True

        except Exception as e:
            logger.error(f"Failed to load Noto Music: {e}")
            return False

    def _create_output_font(self) -> bool:
        """Create a new blank output font.

        Returns:
            True if successful, False otherwise
        """
        try:
            self.output_font = fontforge.font()
            return True
        except Exception as e:
            logger.error(f"Failed to create output font: {e}")
            return False

    def _extract_base_characters(self) -> bool:
        """Extract base pitch characters from Noto Music to PUA.

        Returns:
            True if successful, False otherwise
        """
        extracted = 0
        for idx, base_char in enumerate(self.char_order):
            try:
                src_codepoint = ord(base_char)
                dst_codepoint = self.pua_start + idx

                # Get source glyph
                src_glyph = self.noto_font[src_codepoint]
                if not src_glyph:
                    logger.warning(f"  Character '{base_char}' (U+{src_codepoint:04X}) not found in Noto Music")
                    continue

                # Create destination glyph in output font
                dst_glyph = self.output_font.createChar(dst_codepoint, f"base_{base_char}")
                dst_glyph.clear()

                # Copy glyph using pen API
                pen = dst_glyph.glyphPen()
                if pen:
                    src_glyph.draw(pen)
                    pen = None

                # Copy metrics
                src_bbox = src_glyph.boundingBox()
                if src_bbox:
                    dst_glyph.width = int(src_bbox[2] - src_bbox[0]) + 50
                else:
                    dst_glyph.width = 600

                extracted += 1

            except Exception as e:
                logger.warning(f"Failed to extract '{base_char}': {e}")
                continue

        logger.info(f"  ✓ Extracted {extracted}/{len(self.char_order)} base characters")
        return extracted > 0

    def _generate_octave_variants(self) -> bool:
        """Generate octave variants with dots above/below.

        Each character gets 4 variants:
          - Variant 0: 1 dot above (octave +1)
          - Variant 1: 2 dots above (octave +2)
          - Variant 2: 1 dot below (octave -1)
          - Variant 3: 2 dots below (octave -2)

        Returns:
            True if successful, False otherwise
        """
        created = 0

        for idx, base_char in enumerate(self.char_order):
            try:
                base_cp = self.pua_start + idx
                base_glyph = self.output_font[base_cp]
                if not base_glyph:
                    continue

                base_bbox = base_glyph.boundingBox()
                if not base_bbox:
                    continue

                bx_min, by_min, bx_max, by_max = base_bbox
                base_width = bx_max - bx_min

                # Dot positioning
                dot_x_offset = bx_min + (base_width - self.dot_width) / 2 - self.dot_bbox[0]
                dot_spacing = self.dot_height + 100
                bbox_offset = 50

                # Generate 4 variants
                for variant_idx in range(4):
                    variant_cp = base_cp + (idx * 4) + variant_idx
                    variant_name = f"{base_char}_v{variant_idx}"

                    variant_glyph = self.output_font.createChar(variant_cp, variant_name)
                    variant_glyph.clear()

                    # Add base glyph reference
                    variant_glyph.addReference(base_glyph.glyphname, (1, 0, 0, 1, 0, 0))

                    # Add dot reference(s)
                    if variant_idx == 0:  # 1 dot above
                        y_pos = by_max - self.dot_bbox[1] + bbox_offset
                        variant_glyph.addReference(self.dot_glyph.glyphname, (1, 0, 0, 1, dot_x_offset, y_pos))

                    elif variant_idx == 1:  # 2 dots above
                        y_pos1 = by_max - self.dot_bbox[1] + bbox_offset
                        y_pos2 = y_pos1 + dot_spacing
                        variant_glyph.addReference(self.dot_glyph.glyphname, (1, 0, 0, 1, dot_x_offset, y_pos1))
                        variant_glyph.addReference(self.dot_glyph.glyphname, (1, 0, 0, 1, dot_x_offset, y_pos2))

                    elif variant_idx == 2:  # 1 dot below
                        y_pos = by_min - self.dot_bbox[3] - bbox_offset
                        variant_glyph.addReference(self.dot_glyph.glyphname, (1, 0, 0, 1, dot_x_offset, y_pos))

                    elif variant_idx == 3:  # 2 dots below
                        y_pos1 = by_min - self.dot_bbox[3] - bbox_offset
                        y_pos2 = y_pos1 - dot_spacing
                        variant_glyph.addReference(self.dot_glyph.glyphname, (1, 0, 0, 1, dot_x_offset, y_pos1))
                        variant_glyph.addReference(self.dot_glyph.glyphname, (1, 0, 0, 1, dot_x_offset, y_pos2))

                    variant_glyph.width = base_glyph.width
                    created += 1

            except Exception as e:
                logger.warning(f"Failed to generate variants for '{base_char}': {e}")
                continue

        # Decompose references to embed them
        logger.info(f"  Embedding {created} composite glyphs...")
        for idx in range(len(self.char_order) * 4):
            try:
                cp = self.pua_start + idx
                g = self.output_font[cp]
                if g and g.isComposite():
                    g.decompose()
            except:
                pass

        logger.info(f"  ✓ Created {created} octave variants")
        return created > 0

    def _generate_accidental_variants(self) -> bool:
        """Generate accidental variants (char + sharp glyph).

        Returns:
            True if successful, False otherwise
        """
        created = 0

        try:
            # Get sharp glyph from Noto Music
            sharp_glyph = self.noto_font[ord('#')]
            if not sharp_glyph:
                logger.warning("Could not find '#' (sharp) glyph in Noto Music")
                return False

            # Copy sharp glyph to output font
            sharp_cp_out = self.accidental_pua_start - 1
            sharp_out = self.output_font.createChar(sharp_cp_out, "sharp_symbol")
            sharp_out.clear()
            pen = sharp_out.glyphPen()
            if pen:
                sharp_glyph.draw(pen)
                pen = None

            sharp_bbox = sharp_glyph.boundingBox()

            # Create accidental composites
            for idx, base_char in enumerate(self.char_order):
                try:
                    base_cp = self.pua_start + idx
                    base_glyph = self.output_font[base_cp]
                    if not base_glyph:
                        continue

                    accidental_cp = self.accidental_pua_start + idx
                    accidental_name = f"{base_char}_sharp"

                    composite = self.output_font.createChar(accidental_cp, accidental_name)
                    composite.clear()

                    # Add base character
                    composite.addReference(base_glyph.glyphname, (1, 0, 0, 1, 0, 0))

                    # Add sharp symbol to the right
                    if sharp_bbox:
                        sx_min = sharp_bbox[0]
                        base_bbox = base_glyph.boundingBox()
                        if base_bbox:
                            bx_max = base_bbox[2]
                            sharp_x_offset = bx_max + 50 - sx_min
                            composite.addReference(sharp_out.glyphname, (1, 0, 0, 1, sharp_x_offset, 0))
                            composite.width = base_glyph.width + 200
                            created += 1

                except Exception as e:
                    logger.warning(f"Failed to create accidental for '{base_char}': {e}")
                    continue

            # Decompose references
            logger.info(f"  Embedding {created} accidental composites...")
            for idx in range(len(self.char_order)):
                try:
                    cp = self.accidental_pua_start + idx
                    g = self.output_font[cp]
                    if g and g.isComposite():
                        g.decompose()
                except:
                    pass

            logger.info(f"  ✓ Created {created} sharp accidentals")
            return True

        except Exception as e:
            logger.error(f"Failed to generate accidentals: {e}")
            return False

    def _extract_musical_symbols(self) -> bool:
        """Extract musical symbols (barlines, ornaments, accidentals) from Noto Music SMuFL glyphs.

        Returns:
            True if successful, False otherwise
        """
        symbols_config = self.config.get('bravura_symbols', [])
        symbols_created = 0

        logger.info(f"Processing {len(symbols_config)} symbol definitions...")

        for symbol_def in symbols_config:
            try:
                glyph_name = symbol_def.get('glyph_name')
                label = symbol_def.get('label')
                smufl_codepoint = symbol_def.get('smufl_codepoint')
                codepoint_offset = symbol_def.get('codepoint_offset', 0)

                symbol_cp = self.symbols_pua_start + codepoint_offset

                # Try to find glyph in Noto Music
                src_glyph = None

                # First try by SMuFL codepoint
                if smufl_codepoint:
                    try:
                        src_glyph = self.noto_font[smufl_codepoint]
                    except:
                        pass

                # Try by glyph name
                if not src_glyph and glyph_name:
                    try:
                        src_glyph = self.noto_font[glyph_name]
                    except:
                        pass

                if src_glyph:
                    # Create glyph in output font
                    dst_glyph = self.output_font.createChar(symbol_cp, f"symbol_{glyph_name}")
                    dst_glyph.clear()

                    # Copy using pen API
                    pen = dst_glyph.glyphPen()
                    if pen:
                        src_glyph.draw(pen)
                        pen = None

                    # Set width
                    src_bbox = src_glyph.boundingBox()
                    if src_bbox:
                        dst_glyph.width = int(src_bbox[2] - src_bbox[0]) + 100
                    else:
                        dst_glyph.width = 600

                    dst_glyph.correctDirection()
                    logger.info(f"  ✓ {label} (U+{symbol_cp:04X})")
                    symbols_created += 1
                else:
                    logger.warning(f"  ✗ {label}: glyph '{glyph_name}' (U+{smufl_codepoint:04X}) not found")

            except Exception as e:
                logger.warning(f"Failed to extract symbol: {e}")
                continue

        logger.info(f"  ✓ Total symbols extracted: {symbols_created}")
        return True

    def _set_font_metadata(self) -> None:
        """Set font metadata."""
        self.output_font.fontname = "NotationFont"
        self.output_font.fullname = "Notation Font"
        self.output_font.familyname = "Notation"
        self.output_font.version = "2.0.0"
        self.output_font.copyright = "Based on Noto Music font by Google. Licensed under SIL OFL 1.1."

        # Set OS/2 licensing bits
        self.output_font.os2_fsType = []

    def _save_font(self) -> bool:
        """Save the output font.

        Returns:
            True if successful, False otherwise
        """
        try:
            os.makedirs(os.path.dirname(self.output_path), exist_ok=True)
            self.output_font.generate(self.output_path)
            logger.info(f"  ✓ Font saved to {self.output_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to save font: {e}")
            return False


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Generate NotationFont.ttf from Noto Music',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    script_dir = Path(__file__).parent.parent.parent  # /home/john/editor

    parser.add_argument(
        '--config',
        default=str(script_dir / 'tools' / 'fontgen' / 'atoms.yaml'),
        help='Path to atoms.yaml configuration file'
    )
    parser.add_argument(
        '--noto',
        default=str(script_dir / 'tools' / 'fontgen' / 'sources' / 'NotoMusic.ttf'),
        help='Path to NotoMusic.ttf source font'
    )
    parser.add_argument(
        '--output',
        default=str(script_dir / 'static' / 'fonts' / 'NotationFont.ttf'),
        help='Path to write NotationFont.ttf output'
    )

    args = parser.parse_args()

    # Validate files exist
    if not os.path.exists(args.config):
        logger.error(f"Configuration file not found: {args.config}")
        sys.exit(1)

    if not os.path.exists(args.noto):
        logger.error(f"Noto Music font not found: {args.noto}")
        logger.error(f"Download it from: https://github.com/notofonts/music/releases")
        logger.error(f"Then place it at: {args.noto}")
        sys.exit(1)

    # Generate font
    generator = NotoMusicFontGenerator(args.config, args.noto, args.output)
    success = generator.generate()
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
