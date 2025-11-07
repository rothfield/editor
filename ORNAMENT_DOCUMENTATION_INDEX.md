# Ornament Layout System - Complete Documentation Index

Created: 2025-11-06

## Documentation Files

This documentation package contains comprehensive information about the ornament layout and positioning system in the editor. Four detailed markdown files are provided:

### 1. ORNAMENT_LAYOUT_SYSTEM.md (9.6 KB, 314 lines)
**Start here for comprehensive architecture overview**

Complete technical reference covering:
- All key file paths with line numbers
- Cell structure and ornament storage
- Two rendering modes (Edit ON/OFF) explained
- Full layout pipeline (extraction, positioning, arc calculation)
- Display list output structures
- Positioning calculations with formulas
- Current limitations and observations
- Data flow summary
- Key constants and thresholds

**Best for:** Understanding the complete system, debugging layout issues

---

### 2. ORNAMENT_LAYOUT_DIAGRAMS.md (9.8 KB, 318 lines)
**Visual guide with ASCII diagrams and flowcharts**

Contains 10 detailed visual diagrams:
1. Cell indicator state machine
2. Layout pipeline (Mode OFF)
3. Positioning mathematics
4. Mode switching (Edit ON ↔ OFF)
5. Cell structure with fields
6. Anchor finding algorithm
7. Rendering flow in JavaScript
8. CSS classes applied
9. Constants flow
10. Current collision avoidance limitations

**Best for:** Visual learners, understanding relationships, presentations

---

### 3. ORNAMENT_QUICK_REFERENCE.md (7.3 KB, 225 lines)
**Cheat sheet for rapid lookup**

Quick facts organized by topic:
- One-picture overview
- Key files (priority order)
- Key concepts (indicators, objects, modes)
- Critical formulas (Y position, X position, arcs)
- Six OrnamentIndicator variants
- Anchor finding priority
- Display list structure
- Constants table
- Test file guide
- Missing features checklist
- Debugging tips

**Best for:** Quick lookups, troubleshooting, cheat sheet reference

---

### 4. ORNAMENT_MUSICXML_ANALYSIS.md & ORNAMENT_MUSICXML_IMPLEMENTATION.md (24 KB combined)
**MusicXML export and music notation integration**

Detailed implementation docs for:
- Grace note placement attributes
- Ornament type detection (trill, turn, mordent)
- Articulation support
- MusicXML export formatting
- Phase-by-phase implementation guide

**Best for:** Understanding MusicXML export, grace note handling

---

## Quick Navigation

### I need to understand...

**"How ornaments are stored in memory"**
→ ORNAMENT_LAYOUT_SYSTEM.md, Section 2: Cell Structure & Ornament Storage

**"How ornaments are positioned visually"**
→ ORNAMENT_QUICK_REFERENCE.md, Critical Positioning Formula
→ ORNAMENT_LAYOUT_DIAGRAMS.md, Diagram 3: Positioning Mathematics

**"The difference between Edit Mode ON and OFF"**
→ ORNAMENT_LAYOUT_DIAGRAMS.md, Diagram 4: Mode Switching
→ ORNAMENT_LAYOUT_SYSTEM.md, Section 2.B: Two Rendering Modes

**"Where the layout code is"**
→ ORNAMENT_LAYOUT_SYSTEM.md, Section 1: Key File Paths

**"How arcs are calculated"**
→ ORNAMENT_LAYOUT_SYSTEM.md, Section 2.D: Arc Rendering
→ ORNAMENT_QUICK_REFERENCE.md, Arc Control Point Algorithm

**"What are the Six OrnamentIndicator types"**
→ ORNAMENT_QUICK_REFERENCE.md, The Six OrnamentIndicator Variants

**"How extraction works"**
→ ORNAMENT_QUICK_REFERENCE.md, The Extraction Process
→ ORNAMENT_LAYOUT_DIAGRAMS.md, Diagram 2: Layout Pipeline

**"Why ornaments might be overlapping"**
→ ORNAMENT_LAYOUT_SYSTEM.md, Section 5: Current Limitations
→ ORNAMENT_LAYOUT_DIAGRAMS.md, Diagram 10: No Collision Avoidance

**"How to debug positioning issues"**
→ ORNAMENT_QUICK_REFERENCE.md, Debugging Tips

**"The complete data flow from input to rendering"**
→ ORNAMENT_LAYOUT_SYSTEM.md, Section 6: Data Flow Summary
→ ORNAMENT_LAYOUT_DIAGRAMS.md, Diagram 7: Rendering Flow in JavaScript

---

## Architecture Summary

### Two-Mode System

The ornament system operates in two modes:

**Edit Mode ON (Inline)**
- Ornament cells mixed with main content
- All cells selectable and directly editable
- Uses `OrnamentIndicator` on cells to mark boundaries
- No extraction, no floating layout

**Edit Mode OFF (Floating)**
- Ornament cells extracted from inline representation
- Grouped into `Ornament` objects
- Attached to anchor cells
- Positioned as floating overlays above parent note
- Non-interactive display

### Three Rendering Concepts

1. **OrnamentIndicator** - Cell property (Start/End markers)
2. **Ornament** - Extracted group (cells + placement)
3. **RenderOrnament** - Positioned character (x, y, text)

### Key Layout Equations

```
Y Position (absolute):
  y = (line_y_offset + cell_y_offset + cell_height * 0.75) - (font_size * 0.8)

X Position (sequential from parent):
  x = parent_cell.x + parent_cell.w + (index * 7.2)

Arc Height (proportional to span):
  height = (span * 0.15).clamp(3.0, 8.0)
```

### Critical Files

| File | Function | Lines |
|------|----------|-------|
| src/html_layout/line.rs | position_ornaments_from_cells() | 761-820 |
| src/html_layout/line.rs | compute_ornament_arcs_from_cells() | 305-353 |
| src/html_layout/line.rs | extract_ornaments_from_indicators() | 832-899 |
| src/models/elements.rs | OrnamentIndicator enum | 624-819 |
| src/models/core.rs | Cell struct ornament fields | 47, 51 |
| src/js/renderer.js | JavaScript ornament rendering | 946-966 |

---

## Key Observations

### What Works Well

- Clean separation of Edit (inline) and Display (floating) modes
- Proper cascading from Rust layout to JavaScript rendering
- Bezier curve arcs for visual connection
- Flexible anchor finding algorithm
- Multiple indicator types for different positions

### Current Limitations (Not Implemented)

- No collision detection for overlapping ornaments
- Fixed 60% scale for all ornaments
- No dynamic vertical stacking
- Loss of "OnTop" position info post-extraction
- No line height adjustment for ornament depth
- Sequential horizontal layout (no kerning)

---

## File Relationships

```
ORNAMENT_LAYOUT_SYSTEM.md
├─ Complete reference (read this first)
├─ All file paths and functions
└─ Detailed explanations

ORNAMENT_LAYOUT_DIAGRAMS.md
├─ Visual guide (complement to system.md)
├─ 10 diagrams for different aspects
└─ ASCII art flowcharts

ORNAMENT_QUICK_REFERENCE.md
├─ Cheat sheet (quick lookup)
├─ Formulas and constants
└─ Debugging tips

ORNAMENT_MUSICXML_*.md
└─ Export integration (separate concern)
```

---

## Getting Started (30-minute tour)

1. **Read ORNAMENT_QUICK_REFERENCE.md** (5 min)
   - Understand high-level concepts
   - See the "In One Picture" overview

2. **Study ORNAMENT_LAYOUT_DIAGRAMS.md Diagrams 1-4** (10 min)
   - State machine (diagram 1)
   - Layout pipeline (diagram 2)
   - Mode switching (diagram 4)

3. **Read ORNAMENT_LAYOUT_SYSTEM.md Sections 1-3** (10 min)
   - Know which files contain what
   - Understand positioning formulas

4. **Review key code sections** (5 min)
   - `src/models/elements.rs` lines 624-819 (OrnamentIndicator)
   - `src/html_layout/line.rs` lines 761-820 (position_ornaments_from_cells)

---

## Common Questions

**Q: How do I add a new position type (not Before/After/OnTop)?**
A: See ORNAMENT_LAYOUT_SYSTEM.md Section 2.B. Would require:
   1. New OrnamentIndicator variant
   2. New OrnamentPositionType variant
   3. Update position_ornaments_from_cells()
   4. Update JavaScript CSS/positioning

**Q: Where do ornaments overlap occur?**
A: ORNAMENT_LAYOUT_SYSTEM.md Section 5.A explains the limitation.

**Q: How are anchors found when edit mode is ON?**
A: ORNAMENT_LAYOUT_SYSTEM.md Section 2.B and Quick Reference cover this.

**Q: What happens if there's no anchor cell?**
A: Ornament is orphaned - see Anchor Finding Priority in Quick Reference.

---

## Document Statistics

| Document | Size | Lines | Diagrams/Tables |
|----------|------|-------|-----------------|
| ORNAMENT_LAYOUT_SYSTEM.md | 9.6 KB | 314 | 2 tables |
| ORNAMENT_LAYOUT_DIAGRAMS.md | 9.8 KB | 318 | 10 ASCII diagrams |
| ORNAMENT_QUICK_REFERENCE.md | 7.3 KB | 225 | 3 tables + formulas |
| **Total** | **26.7 KB** | **857** | **15+ visual aids** |

---

## Next Steps

- Read through the comprehensive ORNAMENT_LAYOUT_SYSTEM.md
- Review visual diagrams in ORNAMENT_LAYOUT_DIAGRAMS.md
- Use ORNAMENT_QUICK_REFERENCE.md as ongoing reference
- Check MusicXML docs for export integration
- Reference test files for concrete examples

---

**Last Updated:** 2025-11-06  
**Accuracy:** Verified against codebase commit 6b2dbcc
