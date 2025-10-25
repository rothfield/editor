# Feature Specification: Ornaments (Grace Notes)

**Feature Branch**: `003-implement-ornaments-grace`
**Created**: 2025-10-22
**Status**: Draft
**Input**: Implement ornaments (grace notes) support for musical notation editing. Ornaments are decorative notes attached to primary notes, appearing either before or after the main note.

## User Scenarios & Testing

### User Story 1 - Compose Melodies with Ornamental Flourishes (Priority: P1)

Musicians want to notate ornamental phrases (grace notes) that embellish primary notes in their compositions. Ornaments are quick, decorative notes that precede or follow a main note, commonly used in classical, folk, and Indian classical music. Users create ornaments by entering ornament pitches in the main note line, then using the Edit menu (Edit → Ornament) to designate them as ornaments. An ornament editor dialog then allows detailed specification of pitches and octaves. Once created, ornaments are rendered as grace notes in the staff notation.

**Why this priority**: Core functionality for authentic musical notation; Music is often notated simply as a skeleton. The musician is expected to embelish, embroider, and elaborate the basic music material.  Often, this is the 'meat' of the music.  Ornaments lets you 'write out' these additions separate from the main flow. Ornaments enables users to notate idiomatic musical expressions like divisision, expansions, melismatic  phrases, turns, trills, and passing tones that are essential to many musical traditions.

**Independent Test**: Users can enter ornament notes in the main line, convert them to an ornament via the Edit menu, edit the ornament in the dialog, and see the resulting grace notes in the staff notation.

**Acceptance Scenarios**:

1. **Given** notes entered in the main line, **When** user selects Edit → Ornament, **Then** an ornament editor dialog opens below the current line
2. **Given** multiple notes in the main line sequence, **When** user creates an ornament from selected notes, **Then** the ornament is correctly associated with its target note
3. **Given** an ornament with multiple pitches (e.g., RG for a 2-note ornament) entered in the ornament editor dialog, **When** saved, **Then** all pitches are included in the ornament sequence
4. **Given** user types note `1` and cursor is positioned after the note, **When** user presses `Alt+O`, **Then** ornament editor opens for note `1`
5. **Given** cursor is at position 0 of an empty line with no cells, **When** user presses `Alt+O`, **Then** ornament editor does NOT open
6. **Given** notes `1 2 3` with all three selected, **When** user presses `Alt+O`, **Then** ornament editor opens for the first note in selection (note `1`)
7. **Given** notes `1 2 3` with cursor positioned after note `2` and no selection, **When** user presses `Alt+O`, **Then** ornament editor opens for note `2` (the note immediately left of cursor)

---

### User Story 2 - Control Ornament Position Relative to Main Note (Priority: P1)

Musicians need to specify whether ornaments sound before or after the main note. In Lilypond convention, ornaments before the beat use `\grace` and ornaments after use `\afterGrace`. Users specify this position using the ornament editor dialog, selecting whether the ornament plays before or after the main note.

**Why this priority**: Essential for proper rhythmic interpretation; before vs. after changes the rhythmic meaning and performance of the phrase.

**Independent Test**: User can open the ornament editor dialog and select before/after positioning, and the system correctly renders the ornament with the chosen timing.

**Acceptance Scenarios**:

1. **Given** the ornament editor dialog is open, **When** user selects "before" option, **Then** the ornament is configured to sound before the main note
2. **Given** the ornament editor dialog is open, **When** user selects "after" option, **Then** the ornament is configured to sound after the main note (afterGrace)
3. **Given** an ornament saved with before/after positioning, **When** rendered to Lilypond, **Then** correct grace note syntax is used based on the selection

---

### User Story 3 - Specify Octaves for Ornament Pitches (Priority: P2)

Musicians compose in multiple octaves and need to specify the exact octave for each ornament pitch. The ornament editor dialog provides octave controls (similar to the Edit/Octave menu items) to set the octave for each pitch in the ornament sequence.

**Why this priority**: Required for accurate notation in passages spanning multiple octaves and for proper musical meaning (the same pitch in different octaves has different performance implications).

**Independent Test**: User can open the ornament editor, select each pitch in the sequence, and adjust its octave using the dialog controls. The preview updates in real-time to show the octave changes.

**Acceptance Scenarios**:

1. **Given** the ornament editor is open and a pitch is selected, **When** user selects upper octave from the octave controls, **Then** the pitch is assigned upper octave
2. **Given** the ornament editor is open and a pitch is selected, **When** user selects lower octave from the octave controls, **Then** the pitch is assigned lower octave
3. **Given** ornament pitches with various octave assignments, **When** the ornament is saved, **Then** the octave assignments are preserved in the rendered output

---

### User Story 4 - Edit Existing Ornaments (Priority: P2)

Users need to edit ornaments after they've been created. By positioning the cursor under an existing ornament and selecting Edit → Ornament, the ornament editor dialog opens, allowing users to modify the ornament pitches, octaves, and before/after positioning without re-entering the entire ornament.

**Why this priority**: Supports iterative editing and refinement of ornaments; essential for real-world composition where adjustments are frequent.

**Independent Test**: User can position cursor under an existing ornament, open Edit → Ornament, modify the ornament, and see changes reflected in the staff notation.

**Acceptance Scenarios**:

1. **Given** an existing ornament in the composition, **When** user positions cursor under the ornament, **Then** the position is recognized as an ornament location
2. **Given** the cursor under an ornament and Edit → Ornament is selected, **When** the ornament editor opens, **Then** it displays the current ornament's pitches and settings
3. **Given** modifications made in the ornament editor, **When** the dialog is closed/saved, **Then** the ornament in the main notation is updated with the new values

---

### User Story 5 - Ornament Editor Dialog UI (Priority: P1)

The ornament editor dialog provides an intuitive interface for creating and editing ornaments. The dialog appears below the current staff line, can be repositioned by the user, maintains a compact size to avoid obscuring the composition, and provides real-time visual feedback as ornament pitches and settings are modified.

**Why this priority**: Critical for user experience; the dialog is the primary interaction point for ornament editing, so its usability directly impacts productivity and user satisfaction.

**Independent Test**: User opens the ornament editor dialog, interacts with controls, and verifies it behaves as expected (movable, compact, updates in real-time).

**Acceptance Scenarios**:

1. **Given** Edit → Ornament is selected, **When** the ornament editor dialog opens, **Then** it appears below the current line with a compact, manageable size
2. **Given** the ornament editor dialog is open, **When** user drags the dialog title bar, **Then** the dialog moves to the new position
3. **Given** ornament pitches are entered or modified in the dialog, **When** changes are made, **Then** the staff notation updates in real-time to preview the changes

---

### User Story 6 - Render Ornaments as Grace Notes in Staff Notation (Priority: P1)

Once ornaments are created and edited via the dialog, they must be rendered in the staff notation output. Ornaments should appear as grace notes (smaller, faster notes) that are musically distinguished from regular notes. Before-ornaments use standard grace note notation; after-ornaments use Lilypond's afterGrace syntax.

**Why this priority**: Completes the user workflow; without rendering, ornament notation has no output value.

**Independent Test**: User creates notation with ornaments via the dialog and exports to staff notation; ornaments appear as grace notes in the output.

**Acceptance Scenarios**:

1. **Given** an ornament created and edited in the dialog, **When** rendered to staff notation, **Then** it appears as a grace note (visual distinction from regular notes)
2. **Given** a before-ornament, **When** rendered to Lilypond, **Then** it uses `\grace { ... }` syntax
3. **Given** an after-ornament, **When** rendered to Lilypond, **Then** it uses `\afterGrace ... { ... }` syntax

---

### User Story 7 - Ornament Layout & Visual Hierarchy (Priority: P1)

Ornaments must be rendered in a visually compact manner that does not increase horizontal spacing of the main note line. Ornaments appear smaller than regular notes (approximately 75% of note font size) and are stacked vertically with minimal spacing. In scores containing both slurs and ornaments, slurs visually appear above ornaments to establish proper visual hierarchy. Overall layout spacing remains tight and conditional, with no unnecessary whitespace.

**Why this priority**: Ornaments are embellishments that should enhance the score visually without disrupting the spatial layout of the main melodic line. Proper visual hierarchy ensures score readability and professional appearance.

**Independent Test**: User creates notation with ornaments and observes rendered output; ornaments do not affect horizontal spacing of main notes, appear at 75% size, stack tightly, and display below slurs when present.

**Acceptance Scenarios**:

1. **Given** ornaments in the staff notation, **When** rendered, **Then** ornaments do not expand horizontal spacing (ornaments are positioned over/under the main note, not beside it)
2. **Given** multiple ornament pitches in a single ornament, **When** rendered, **Then** pitches are stacked vertically with minimal spacing between them
3. **Given** ornaments rendered in a score, **When** compared to regular notes, **Then** ornament noteheads are approximately 75% of regular note size
4. **Given** slurs and ornaments in the same score, **When** rendered, **Then** slurs appear above ornaments in the visual stack
5. **Given** a dense composition with multiple musical elements, **When** rendered, **Then** layout spacing is tight and does not contain unnecessary whitespace

---

### Edge Cases

- What happens when a user tries to create an ornament from notes that are not adjacent to a target note?
- How does the dialog handle selection of an ornament when the cursor is near but not exactly on the ornament location?
- What if an ornament contains the same pitch multiple times (e.g., `SSS`)?
- Can an ornament target a note that spans multiple measures (tied note)?
- How does the system handle dialog repositioning when the dialog would extend beyond the visible editor area?
- What happens when the user selects Edit → Ornament without having ornament notes selected in the main line?
- Keyboard shortcut edge cases:
  - What happens when user presses Alt+O while already in the ornament editor dialog? (Should ignore or show warning?)
  - What if user has a selection that includes non-note cells (spaces, dashes)? (Should skip to first valid note or show error?)
  - What if the note to the left of cursor already has an ornament? (Should open in edit mode for existing ornament)
  - How does Alt+O interact with multi-line selections? (Should only consider current line)
  - What if cursor is on a different line than the selection? (Should use cursor line or selection line?)
- Ornament positioning edge cases:
  - Target note near screen/scroll boundaries (what if ornament x,y would render off-screen)?
  - Multiple ornaments on same target note (overlapping y coordinates; how to stack without collision)?
  - Ornament with accidentals: does special font sizing affect x,y calculations?
  - Ornament position recalculation when target note's position changes (dragging, line reflow, window resize)?
  - Ornament position accuracy when target note is very small or very large font
- Rendering separation issues:
  - Dialog preview must use same x,y calculation logic as final rendering (coordinate consistency)
  - Ornament DOM elements must not interfere with cell grid layout or hit detection
  - Z-order correctness when slurs, ornaments, and other annotations overlap in same space
  - Beat loops must not appear in ornament editor canvas but should appear in main canvas

## Requirements

### Functional Requirements

#### Ornament Creation & Editing

- **FR-001**: System MUST provide an Edit → Ornament menu item that opens the ornament editor dialog
- **FR-002**: System MUST detect when cursor is positioned under an existing ornament and enable Edit → Ornament for editing
- **FR-003**: System MUST allow users to select note pitches in the main line and convert them to ornaments via Edit → Ornament
- **FR-004**: System MUST validate selected notes and display an error message if selection is invalid for ornament creation
- **FR-005**: System MUST associate created ornaments with their target note (the note immediately following the ornament notes)

#### Ornament Editor Dialog

- **FR-006**: System MUST display the ornament editor as a modal dialog window
- **FR-007**: System MUST position the ornament editor dialog below the current staff line by default
- **FR-008**: System MUST allow the dialog to be repositioned by dragging its title bar
- **FR-009**: System MUST maintain a compact dialog size that does not excessively obscure the composition
- **FR-010**: System MUST provide real-time preview of ornament changes in the staff notation as user edits
- **FR-011**: System MUST provide pitch input controls for each ornament pitch (allowing entry/modification of pitch names)
- **FR-012**: System MUST provide octave controls (similar to Edit/Octave menu) for each ornament pitch
- **FR-013**: System MUST provide before/after positioning selector (radio buttons or equivalent) for ornament timing
- **FR-014**: System MUST display the current ornament pitches and settings when editing an existing ornament
- **FR-015**: System MUST save ornament changes when the dialog is closed (via OK/Save button or implicit save on close)

#### Ornament Grammar & Validation

- **FR-016**: System MUST parse ornament notation according to formal grammar (pitch+, accidentals, octave modifiers)
- **FR-017**: System MUST validate ornament pitch syntax for each notation system (sargam, number, ABC, doremi, Hindi)
- **FR-018**: System MUST validate accidental syntax (#, b) in ornament pitches
- **FR-019**: System MUST validate octave modifier syntax (., :, _) for ornament pitches
- **FR-020**: System MUST enforce minimum ornament size (at least 1 pitch per ornament)
- **FR-021**: System MUST provide clear error messages for grammar violations (invalid pitch, malformed accidental, invalid octave)

#### Ornament Rendering

- **FR-022**: System MUST normalize ornament pitches to standard pitch representation (e.g., sargam `RG` → normalized pitches like `D E`)
- **FR-023**: System MUST convert ornament notation to Lilypond grace note syntax for rendering
- **FR-024**: System MUST render before-ornaments using Lilypond's `\grace { pitch pitch ... }` syntax
- **FR-025**: System MUST render after-ornaments using Lilypond's `\afterGrace main-note { pitch pitch ... }` syntax
- **FR-026**: System MUST handle single-pitch ornaments (e.g., `R`) and multi-pitch ornaments (e.g., `RG`, `nrsns`)
- **FR-027**: System MUST validate that ornaments are attached to valid note targets (not dashes or non-existent positions)
- **FR-028**: System MUST preserve ornament integrity when exporting to Lilypond format (correct pitches, octaves, and timing)
- **FR-029**: System MUST support ornaments in all supported musical notations (sargam, number, ABC, Hindi, doremi)

#### Ornament Positioning & DOM Attachment

- **FR-030**: System MUST NOT render ornaments as cell elements; ornaments are separate DOM elements positioned via CSS coordinates
- **FR-031**: System MUST attach ornaments to line-element DOM nodes (similar to lyrics and dots, not part of main note cell sequence)
- **FR-032**: System MUST use absolute CSS positioning (top/left coordinates) to place ornaments relative to line-element container
- **FR-033**: System MUST calculate precise ornament x,y coordinates based on target note's rendered position and ornament pitch interval
- **FR-034**: System MUST support coordinate precision sufficient for accurate vertical stacking (sub-pixel positioning acceptable)
- **FR-035**: System MUST apply CSS classes/styles for ornament sizing (75% of note font size), spacing, and z-order layering
- **FR-036**: System MUST update ornament positions when underlying note positions change (responsive positioning without DOM reconstruction)
- **FR-037**: System MUST use same special font rendering for ornament accidentals (#, b) as used for pitch accidentals
- **FR-038**: System MUST support overlapping ornament rendering without DOM reconstruction (pure CSS positioning changes)
- **FR-039**: System MUST calculate and maintain a tight bounding box for each complete ornament (encompassing all ornament pitches together, for future clickable UI features)
- **FR-040**: System MUST ensure bounding box is minimal/tight around entire ornament rendered content (no excessive padding/margins)

#### Ornament Layout & Visual Hierarchy

- **FR-041**: System MUST render ornaments without increasing horizontal spacing of the main note line (ornaments positioned vertically relative to main note, not horizontally displaced)
- **FR-042**: System MUST render ornament pitches at approximately 75% of regular pitch font size to visually distinguish them as embellishments
- **FR-043**: System MUST stack multiple ornament pitches vertically with minimal spacing between them (tight vertical packing)
- **FR-044**: System MUST position slurs above ornaments in the visual rendering stack (slurs have higher z-order than ornaments)
- **FR-045**: System MUST apply tight, conditional spacing throughout the score layout (no unnecessary whitespace; spacing depends on actual note content)
- **FR-046**: System MUST ensure ornament vertical positioning does not obscure the main note or other critical musical elements
- **FR-047**: System MUST maintain consistent ornament rendering in both preview (dialog) and final exported staff notation

#### Keyboard Shortcut & Selection Behavior

- **FR-048**: System MUST provide Alt+O keyboard shortcut to open ornament editor
- **FR-049**: System MUST NOT open ornament editor when cursor is at position 0 of an empty line (no cells present)
- **FR-050**: System MUST use "effective selection" logic for ornament target determination: if selection exists, apply ornament to first item in selection; otherwise, apply to item immediately to left of cursor (same behavior as Alt+U/M/L octave commands)
- **FR-051**: System MUST NOT render beat loops in the ornament editor mini canvas preview

## Ornament Grammar & Notation

### Formal Grammar

```
ornament = pitch+ [ octave-modifier* ]
pitch = pitch-name [ accidental ]
pitch-name = notation-specific pitch symbol (S, R, G, m, P, etc. for sargam; 1-7 for number; c-b for ABC, etc.)
accidental = '#' | 'b'
octave-modifier = '.' | ':' | '_'
  '.' = upper octave (above notation line)
  ':' = upper-upper octave
  '_' = lower octave (below notation line)

ornament-in-line = ornament [ octave-markers ] target-note
target-note = next pitch in main note sequence after ornament specification
position = before | after (explicitly selected in editor dialog)
```

### Notation Rules

- **Ornament as pitch+**: One or more ornament pitches in sequence (minimum 1 pitch per ornament)
- **Pitch notation**: Each ornament pitch uses same pitch notation system as main notes (sargam, number, ABC, doremi, etc.)
- **Accidentals**: Ornament pitches support sharps (#) and flats (b), rendered with same special font as pitch accidentals
- **Octaves**: Ornament pitches support octave indicators (dots, colons, underscores) to specify pitch octave
- **Target note**: Ornament automatically associates with the next note in the main sequence (the note being ornamented)
- **Position**: Before/after timing selected explicitly in ornament editor dialog (not inferred from notation position)
- **Multiple ornaments**: Same target note can have multiple ornaments (each with separate editor dialog entry)

### Example Notations

**Sargam notation examples**:
- Ornament: `R G` (two pitches: R, G)
- With accidentals: `R# g` (R sharp, g flat)
- With octaves: `R. G.` (both in upper octave)
- Multi-pitch: `n r s n d` (five-pitch ornament)

**Number notation examples**:
- Ornament: `1 2` (two pitches)
- With accidentals: `1# 2b`
- With octaves: `1. 2.`

**ABC notation examples**:
- Ornament: `C D` (two pitches)
- With accidentals: `C# Db`

### Grammar Integration with Line Element

- Ornaments are **not** part of the main line cell sequence
- Ornaments specified via editor dialog (Edit → Ornament menu)
- Grammar definition enables:
  - Dialog input validation (pitch syntax, accidental format)
  - Roundtrip parsing (reading ornament data)
  - MusicXML export/import mapping
  - Lilypond grace note generation

### Key Entities

- **Ornament**: A decorative pitch sequence attached to a note. Ornaments reuse the same Cell-based structure as Lines - an ornament contains a `cells` array just like a line does. This architectural decision allows ornaments to leverage the same parsing, validation, and rendering logic as regular notation. Attributes:
  - `cells`: Array of Cell objects (minimum 1, maximum 10 cells)
  - `placement`: Visual placement (Top, Before, or After the target note)
  - `position`: Calculated x,y coordinates for rendering (0.1px precision)
  - `bounding_box`: Tight rectangular bounds for hit detection
  - Stored in: `Cell.ornaments` array (each cell can have multiple ornaments)

- **Cell**: The fundamental unit representing one character/pitch in notation. Used for both regular notes in lines AND ornament pitches. Key attributes:
  - `char`: The visible character
  - `pitch_code`: Canonical pitch representation
  - `octave`: Octave marking (-1 = lower, 0 = middle, 1 = upper)
  - `ornaments`: Array of Ornament objects attached to this cell
  - Layout cache: `x`, `y`, `w`, `h`, `bbox`, `hit` (ephemeral, calculated at render time)

- **OrnamentPlacement** (Enum): Visual positioning relative to target note
  - `Top` (0): Above note, 60% above baseline
  - `Before` (1): Horizontal line, ends to the left of note
  - `After` (2): Horizontal line, to the right of note

- **OrnamentPosition** (Calculated): Precise rendering coordinates for the complete ornament
  - `x`, `y`: Top-left coordinates (pixels, 0.1px precision)
  - `width`, `height`: Dimensions of rendered ornament
  - Derived from: target note's position + placement rules + font metrics
  - Updated dynamically when layout changes

- **BoundingBox** (Calculated): Tight rectangular bounds around entire rendered ornament
  - `left`, `top`: Top-left corner coordinates
  - `width`, `height`: Box dimensions
  - Used for: hit detection, hover states, future clickable UI features
  - Minimal padding around actual rendered content (all pitches + accidentals)

- **Ornament Editor Dialog**: UI component for creating/editing ornaments
  - Contains a mini canvas that renders a single-line document (reusing Line structure)
  - Mini canvas displays ornament cells for editing
  - Uses same Cell-based editing as main notation canvas
  - Attributes: dialog position, visibility, edit mode (create/edit), target cell reference

- **Effective Selection**: The target range for musical commands (ornaments, octaves, slurs)
  - If explicit selection exists: use the selected range
  - If no selection: use the single cell immediately to left of cursor
  - Provides consistent behavior across all musical commands (Alt+O, Alt+U/M/L, Alt+S)

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can successfully create and edit ornaments for 95% of intended use cases using the dialog interface
- **SC-002**: Ornaments render correctly in staff notation with visually distinct grace note appearance
- **SC-003**: Ornament position (before/after) is correctly rendered in 100% of test cases based on dialog selection
- **SC-004**: Octave assignments for ornaments match user intent in 95% of cases set via dialog octave controls
- **SC-005**: Ornament editor dialog updates preview in real-time with less than 100ms latency
- **SC-006**: Ornament editor dialog can be repositioned to any location within editor bounds without errors
- **SC-007**: Dialog size remains compact (less than 30% of editor height) while remaining usable
- **SC-008**: Users can complete ornament creation from selecting notes to closing dialog in under 30 seconds
- **SC-009**: System successfully handles all doremi-script test fixtures related to ornaments
- **SC-010**: Edit → Ornament menu is discoverable and properly enabled/disabled based on selection state
- **SC-011**: Ornaments do not increase horizontal spacing of main note line (100% of test cases)
- **SC-012**: Ornament noteheads render at 75% ± 5% of regular note font size
- **SC-013**: Multiple ornament pitches in a single ornament stack vertically with minimal spacing (< 2pt between pitches)
- **SC-014**: Slurs render above ornaments in visual hierarchy (100% of test cases with both slurs and ornaments)
- **SC-015**: Layout spacing is tight and conditional, with no unnecessary whitespace in rendered output
- **SC-016**: Ornament preview in dialog matches final rendered output visually (visual fidelity > 95%)
- **SC-017**: Alt+O shortcut successfully opens ornament editor in 100% of valid contexts (after note, with selection)
- **SC-018**: Alt+O shortcut correctly rejects invalid contexts (empty line start) in 100% of test cases
- **SC-019**: Selection logic for ornaments matches octave command behavior in 100% of test cases (same target selection)
- **SC-020**: Ornament editor mini canvas displays zero beat loops in 100% of test cases

## Assumptions

- **Assumption-001**: Ornaments consist of valid pitch notes that map to normalized pitches in the system
- **Assumption-002**: Before/after positioning is explicitly selected by user in the dialog, not inferred from text position
- **Assumption-003**: Ornaments are rendered as 32nd notes in Lilypond output (speed of grace notes)
- **Assumption-004**: Ornaments are optional notation; compositions without ornaments remain fully functional
- **Assumption-005**: Ornaments cannot contain duration information (they are always fast, acciaccatura-style grace notes)
- **Assumption-006**: System uses the same octave notation system for ornament pitches as for regular pitches
- **Assumption-007**: The ornament editor dialog is modal; main score editing is paused while dialog is open
- **Assumption-008**: Ornament notes in the main line are automatically converted to an ornament entity; they are not part of the regular note sequence once designated as ornament
- **Assumption-009**: An ornament target is always the next note after the ornament notes in the sequence
- **Assumption-010**: The dialog position is saved/restored per session for user convenience
- **Assumption-011**: Ornament rendering uses positional overlaying (not horizontal displacement) - ornaments are positioned above/below the main note without adding to horizontal measure width
- **Assumption-012**: Ornament size at 75% reflects visual scaling of both noteheads and stems (complete scaling, not just noteheads)
- **Assumption-013**: Tight vertical packing means minimal space between stacked ornament pitches, determined by font metrics and note positioning rules
- **Assumption-014**: Conditional layout spacing is applied globally across the score (not just ornaments), based on actual musical element content
- **Assumption-015**: Visual hierarchy (z-order) follows: staff lines (background), main notes, ornaments, slurs/articulations (foreground)
- **Assumption-016**: Lilypond rendering automatically handles layout constraints (75% scaling, tight spacing, z-order) through grace note syntax
- **Assumption-017**: Ornaments are NOT cell elements; data model is separate from main note cell sequence
- **Assumption-018**: Ornament rendering uses separate logic from pitch cell rendering (different DOM structure, different positioning mechanism)
- **Assumption-019**: Ornament rendering requires precise x,y coordinates (not derived from cell positioning; calculated independently)
- **Assumption-020**: Ornament DOM elements attach to line-element container (same container as lyrics/dots, not part of cell grid)
- **Assumption-021**: X,Y position calculation: ornament pitch position = target note's rendered (x, y) + pitch vertical offset (derived from pitch interval and font metrics)
- **Assumption-022**: Accidental rendering for ornament pitches (#, b) uses same special font mechanism as pitch accidentals (font-family inheritance or explicit font override)
- **Assumption-023**: Ornament positioning uses CSS absolute positioning (top/left coordinates in px or em units) relative to line-element container
- **Assumption-024**: Ornament DOM updates trigger CSS repositioning only (CSS coordinate changes, no DOM reconstruction) when notes shift or content changes
- **Assumption-025**: CSS classes define ornament styling (font-size: 75%, accidental font family, z-index relative to slurs, etc.)
- **Assumption-026**: Multiple ornament pitches on same note are stacked via calculated y-offset values; each pitch gets its own calculated (x, y) coordinate
- **Assumption-027**: Single bounding box per ornament encompasses entire ornament (all pitches stacked vertically together)
- **Assumption-028**: Bounding box dimensions (width, height) derived from extent of all ornament pitches combined at 75% size
- **Assumption-029**: Bounding boxes are tight (minimal padding); fit snugly around actual rendered content (all pitches + accidentals in ornament)
- **Assumption-030**: Bounding boxes support future clickable UI features (hover states, selection, editing); serve as hit detection bounds for entire ornament
- **Assumption-031**: Bounding box coordinates are recalculated when ornament position or font size changes (responsive calculation)
- **Assumption-032**: Alt+O shortcut uses same selection logic as octave commands (Alt+U/M/L): effective selection = explicit selection if present, otherwise element to left of cursor
- **Assumption-033**: Ornament editor mini canvas displays only pitch content for ornament editing, without beat loops or measure markers
- **Assumption-034**: "Position 0 of empty line" means cursor is at the start of a line that has zero cells (not just at the start of a line with content)
- **Assumption-035**: "Effective selection" logic is implemented as a reusable function that can be called by multiple command handlers (ornament and octave commands)
- **Assumption-036**: Ornaments use the same Cell-based structure as Lines - both contain a `cells: Vec<Cell>` array. This allows ornaments to reuse the same parsing, validation, and rendering logic as regular notation lines
