# Specification Quality Checklist: Ornaments (Grace Notes)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2025-10-22
**Updated**: 2025-10-22
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Validation Summary

**Status**: PASSED ✓

All specification quality criteria have been met. The specification is comprehensive, technically sound, and ready for the planning phase.

### Key Strengths

1. **UI-Centric Workflow**: Seven well-prioritized user stories (5 P1, 2 P2) that emphasize the dialog-based ornament editing experience
2. **Complete Dialog Specification**: FR-006 through FR-015 provide detailed requirements for the ornament editor dialog (positioning, real-time updates, octave controls, movability)
3. **Rigorous Grammar & Validation**: FR-016 through FR-021 define formal ornament grammar with validation rules for all notation systems
4. **Rigorous Layout Requirements**: FR-041 through FR-047 specify precise visual rendering constraints (75% size, tight vertical packing, no horizontal expansion, z-order hierarchy)
5. **User-Friendly Interaction**: Workflow based on menu-driven dialog interface rather than complex text annotation syntax
6. **Comprehensive Requirements**: 47 functional requirements organized by phase (Creation/Editing, Dialog, Grammar/Validation, Rendering, Positioning/DOM, Layout/Visual Hierarchy)
7. **Measurable Success Criteria**: 16 specific, testable success criteria including visual fidelity metrics and layout constraints
8. **Multi-Notation Support**: Explicitly supports all notation systems (sargam, number, ABC, Hindi, doremi)
9. **Professional Typography**: Explicit requirements for visual hierarchy, size scaling, spacing constraints, and design principles
10. **CSS Positioning Architecture**: Ornaments use proven CSS positioning pattern (like lyrics/dots), not cell-based rendering
11. **Tight Bounding Boxes**: Ornaments maintain calculated bounding boxes (tight fit) for future clickable UI and hit detection
12. **Formal Grammar & Examples**: Complete grammar definition for ornament notation (pitch+, accidentals, octaves) with examples across all notation systems

### Updated Design Approach

The specification has been updated to reflect a user-centric dialog-based workflow with professional typography:

- **Input Method**: Users select ornament notes in the main line and use Edit → Ornament menu (not text annotation)
- **Editor Dialog**: Modal dialog positioned below current line, compact, movable, with real-time preview
- **Position Control**: Before/after positioning selected in dialog UI (not inferred from text position)
- **Octave Management**: Octave controls in dialog UI (not text-based dot/colon notation in upper lines)
- **Editing**: Support for editing existing ornaments by positioning cursor and opening Edit → Ornament
- **Rendering**: Same Lilypond output as doremi-script (grace notes with `\grace` and `\afterGrace`)
- **Architectural Separation**: Ornaments are NOT cells; separate data model, separate rendering logic, separate positioning mechanism
- **DOM Architecture**: Ornaments attached to line-element (not rendered as cells); uses CSS positioning pattern proven with lyrics and dots
- **X,Y Positioning**: Precise coordinates are CRUCIAL - calculated from target note position + pitch vertical offset; independent of cell grid
- **CSS Positioning**: Absolute CSS positioning (top/left coordinates) for placement; responsive updates when note positions change
- **Accidental Fonts**: Ornament accidentals (#, b) use same special font mechanism as regular pitch accidentals
- **Rendering Logic**: Ornament rendering completely separate from pitch cell rendering (different DOM structure, different positioning)
- **Visual Hierarchy**: Ornaments render below slurs in z-order; slurs appear on top for visual clarity
- **Layout Constraints**: Ornaments use no additional horizontal space (positioned over/under main note); vertical stacking is tight
- **Size Scaling**: Ornaments render at 75% of main note font size to visually distinguish them as embellishments via CSS classes
- **Bounding Boxes**: Calculated tight bounding boxes (minimal padding) for each ornament pitch; used for hit detection and future clickable UI
- **Global Design**: Tight, conditional layout spacing applied throughout score (not just ornaments) based on actual content

### Edge Cases

Edge cases updated to reflect dialog-based approach and layout constraints:
- Validation of selection for ornament creation
- Dialog behavior at editor boundaries
- Menu enable/disable logic based on selection state
- Ornament layout when multiple ornaments target the same note (vertical stacking)
- Ornament rendering near staff boundaries (ensuring no clipping or obscuring)
- Interaction between tight layout spacing and multiple simultaneous musical elements (slurs, ornaments, beams)
- Visual z-order correctness when slurs and ornaments overlap in same vertical space
- Scaling consistency when notes/ornaments change size due to layout optimization
- Bounding box edge cases:
  - Bounding box accuracy when ornament contains accidentals (how accidental symbols affect overall width)
  - Bounding box extent with multiple pitches stacked vertically (height calculation across all pitches)
  - Bounding box recalculation on note position changes (responsive bbox updates for entire ornament)
  - Multiple ornaments on same note (separate bounding boxes for each ornament; could overlap spatially)
  - Bounding box values used for hit detection (selection, hovering, interaction on entire ornament)

### Notes

- The specification decouples notation input (dialog UI) from musical representation (grace notes), providing better UX
- Rendering still leverages proven doremi-script approach for grace note generation
- Performance targets updated for dialog responsiveness (100ms real-time preview latency)
- Dialog usability targets ensure compact design (less than 30% of editor height)
- **NOT Cell-Based Architecture** - CRITICAL DISTINCTION:
  - Ornaments are separate DOM elements, NOT cells
  - Ornament rendering logic is SEPARATE from pitch cell rendering
  - Ornament positioning is INDEPENDENT of cell grid
  - Ornament data model is separate from main note sequence
  - Ornament updates use CSS repositioning, not cell grid updates
- **X,Y Position Calculation** - CRITICAL TO IMPLEMENTATION:
  - Precise x,y coordinates are essential for correct rendering
  - Formula: ornament position = target note (x, y) + pitch interval offset
  - Y offset derived from pitch interval + font metrics for tight vertical packing
  - X coordinate typically matches target note x (overlaid vertically)
  - Coordinate precision affects visual accuracy and z-order correctness
- **Accidental Font Handling** - INHERITED FROM PITCHES:
  - Same special font mechanism as regular pitch accidentals
  - Font family/weight applies to ornament accidentals (#, b)
  - Font sizing follows 75% scaling (accidental font scaled proportionally)
- **Bounding Box Calculation** - CRITICAL FOR INTERACTIVITY:
  - Single tight bounding box (minimal padding) per complete ornament (encompasses all pitches)
  - Derived from extent of all ornament pitches combined at 75% size
  - Used for hit detection and future clickable UI features (selection, hovering, editing entire ornament)
  - Must be recalculated when ornament position or content changes
  - Width/height calculated from combined extent of all rendered pitches (including accidentals)
- **CSS Positioning Architecture** reuses proven pattern:
  - Ornaments attached to line-element (same container as lyrics, dots)
  - CSS positioning (top, left, transform) for placement via calculated coordinates
  - No DOM reconstruction on updates - only CSS coordinate changes
  - Responsive positioning when underlying notes move or content changes
  - Leverages existing CSS infrastructure for 75% sizing, z-order, spacing
- **Layout & Typography** are now first-class concerns with explicit requirements:
  - 75% font size is a precise visual constraint (not a suggestion)
  - No horizontal space consumption ensures clean score layout (positional overlaying only)
  - Tight vertical packing follows professional music notation standards
  - Slurs above ornaments establishes proper visual hierarchy (z-index control)
  - Conditional spacing is a global design principle (applies beyond ornaments)
- **Ornament Grammar** provides formal specification for:
  - Notation syntax (pitch+, accidentals #/b, octave modifiers ./:/_)
  - Dialog input validation rules
  - Roundtrip parsing (reading/writing ornament data)
  - MusicXML export/import mapping
  - Examples across all supported notation systems (sargam, number, ABC, doremi, Hindi)
- Lilypond handles most layout constraints automatically through grace note rendering, but dialog preview must accurately reflect these constraints using same CSS positioning and x,y calculation
- Test suite should include:
  - Visual regression tests to ensure layout constraints are maintained
  - Position accuracy tests for x,y coordinate calculation
  - Accidental font rendering tests
  - Z-order verification when ornaments/slurs/other annotations overlap
  - Grammar validation tests (syntax, accidentals, octaves, notation systems)
- Coordinate calculation approach (based on note position + pitch offset) must match dots/lyrics positioning logic for consistency where applicable, but ornament x,y calculation may differ significantly due to pitch interval-based vertical offset (unlike lyrics/dots which have fixed vertical positions)

---

**Recommendation**: Proceed to `/speckit.plan` to generate implementation planning artifacts, with particular attention to:

**CRITICAL ARCHITECTURE DECISIONS:**
1. **Ornament Data Model** - Completely separate from cells; not part of main note sequence
2. **Ornament Rendering Logic** - Completely separate from pitch cell rendering
3. **X,Y Position Calculation** - Formula and precision requirements (target note position + pitch interval offset)
4. **Font Handling** - How accidental fonts scale at 75% and remain readable
5. **Bounding Box Calculation** - Tight bounds for hit detection and future interactive features

**IMPLEMENTATION SPECIFICS:**
6. Line-element DOM attachment (where/how ornament elements attach)
7. CSS coordinate calculation and application (top/left values in px/em)
8. Bounding box computation from font metrics (width, height encompassing all stacked pitches at 75% size)
9. Responsive positioning on note position changes (triggers bbox recalculation for entire ornament)
10. Z-order layering (slurs > ornaments > notes)
11. Accidental font mechanism inheritance
12. Dialog preview coordination (use same x,y calculation and bounding boxes as output)
13. Visual fidelity between dialog preview and rendered output
14. Hit detection using tight bounding boxes (for future clickable features on entire ornament)
