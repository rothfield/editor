# Feature Specification: Music Notation Ornament Support

**Terminology Note**: In other music notation software, this feature may be called "grace notes." This editor uses the term "ornament" for the general superscript styling feature.

**Feature Branch**: `006-music-notation-ornament`
**Created**: 2025-10-25
**Status**: Draft
**Input**: User description: "Music notation ornament support: allow users to add and edit ornamental embellishments (grace notes) to musical notes with configurable placement and visual rendering"

## Editor Philosophy: "Honor the Page, Don't Force the Score"

This feature embodies the editor's core philosophy: **capture musical notation the way musicians actually write it by hand** — not the way engraving software wishes it looked after cleanup.

In handwritten notation, ornaments drawn before, after, or above notes:


**Key principles:**
0. Ornaments belong to notes; however the data model does not explicitly support this.
1. **Ornaments are tokens**: Each ornament is a standalone token in the linear sequence, just like notes
2. **Position is implicit in indicator variant**: Every ornament span is marked by an indicator variant (Before/After/Top Start and End pairs); there is no separate position field
3. **Pitches are explicit**: Pitched ornaments store actual pitch codes, not strings to be interpreted later
4. **Attachment is computed**: Ornaments don't "belong to" notes during editing; attachment is resolved at render/export time

## User Workflow: Select and Apply Pattern

**Ornaments follow the same "select and apply" interaction pattern as slurs and octaves.** This is a consistent editor pattern where users select cells, apply an operation, and the cells are modified accordingly.

**IMPORTANT**: Ornament is a **general styling feature** that works on **any text** - notes, symbols, words, dashes, anything. There is **NO special syntax**.

### Creating Ornaments

1. **Type any text**: `2 3 4`, `abc`, `hello`, `- - -`, etc.
2. **Select the cells** you want to style as ornamental
3. **Apply ornament style** via:
   - **Edit → Ornament** (default: "after" position) or **Alt-0**
   - **Edit → Ornament Before** ("before" position)
   - **Edit → Ornament Top** ("on top" position)
4. **Result**: Selected cells **leave the editable text flow** and become visual overlays

### What Happens (Normal Mode)

When ornament styling is applied, styled cells:
- **Leave the editable text flow** - cannot be selected or edited in normal mode
- **Become visual overlays** - float with zero horizontal width, positioned relative to surrounding content
- **Visually styled**: ~75% font size, raised above baseline (superscript-like), colored distinctively (indigo)

**Critical**: In normal mode, ornamental cells are **not editable** - they are purely visual decorations.

### Editing Ornamental Cells

To modify ornamental cell content:
1. **Toggle Edit Ornament Mode ON**: `Alt+Shift+O`
2. Ornamental cells **return to editable text flow** - appear inline with normal spacing
3. Select and edit like normal text
4. **Toggle Edit Ornament Mode OFF**: `Alt+Shift+O`
5. Ornamental cells **leave flow again**, become visual overlays

### Removing Ornament Styling

Toggle edit ornament mode ON (`Alt+Shift+O`), select the ornamental cells, and reapply the **same ornament type** → removes styling, cells return to normal flow permanently

### Data Model (Pattern: Like Slurs)

Ornaments use the same span-marking pattern as slurs:
- Selected cells get their `ornament_indicator` field set
- **Start cell**: `OrnamentBeforeStart` / `OrnamentAfterStart` / `OrnamentOnTopStart`
- **End cell**: `OrnamentBeforeEnd` / `OrnamentAfterEnd` / `OrnamentOnTopEnd`
- Cells between start/end comprise the ornament span
- **No delimiter characters** - the indicator field encodes position type

### Musical Use Case

While ornament styling works on any text, the primary musical application is creating embellishments:
- Type pitches: `2 3 4`
- Select them
- Apply ornament style: becomes ornamental embellishment visually
- Export to MusicXML/LilyPond: rendered as `<grace/>` elements (rhythm-transparent)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adding Ornaments to Embellish Musical Phrases (Priority: P1)

Musicians want to add ornamental embellishments before main notes to create expressive melodic phrases. They type pitches as regular text, select them, and apply ornament styling to create the visual effect.

**Why this priority**: Core feature - ornaments are fundamental to expressive musical notation

**Independent Test**: Can be fully tested by typing a note sequence (e.g., `2 3 4 1`), selecting the first three notes, applying "Ornament Before" style, and verifying they appear visually styled and export correctly to MusicXML

**Acceptance Scenarios**:

1. **Given** user types `2 3 4` and `1`, **When** user selects `2 3 4` and applies Edit → Ornament Before, **Then** the selected notes appear smaller (~75% size), raised above baseline, colored distinctively, and positioned before note `1`
2. **Given** ornamental text is rendered in normal mode, **When** the score is displayed, **Then** ornaments use zero horizontal space (float above) and are positioned according to their type (before/after/on-top)
3. **Given** ornaments on adjacent content would collide, **When** the score is rendered, **Then** the system adds horizontal spacing to prevent collision
4. **Given** notes styled as ornaments, **When** the score is exported to MusicXML, **Then** they are represented as `<grace/>` elements with no duration value
5. **Given** notes styled as ornaments, **When** the score is exported to LilyPond, **Then** they are represented using `\grace { }` syntax
6. **Given** multiple ornament groups in various positions, **When** user views the score, **Then** each ornament is clearly distinguishable and positioned correctly relative to surrounding content

---

### User Story 2 - Toggling Ornament Styling On/Off (Priority: P2)

Musicians need to quickly add or remove ornament styling to adjust the score. They select already-styled ornamental text and reapply the same ornament type to remove the styling.

**Why this priority**: Essential for error correction and iterative editing workflows

**Independent Test**: Can be fully tested by applying ornament styling to text, then selecting that text and reapplying the same ornament type, verifying the styling is removed

**Acceptance Scenarios**:

1. **Given** text has ornament styling applied, **When** user selects it and reapplies the same ornament type (e.g., Edit → Ornament), **Then** the ornament styling is removed (toggle off)
2. **Given** text has "after" ornament styling, **When** user selects it and applies "before" ornament style, **Then** the position changes from after to before
3. **Given** text has ornament styling, **When** user selects it along with additional unstyled text and applies ornament style, **Then** the selection behavior is consistent and predictable

---

### User Story 3 - Editing Ornaments Inline for Quick Adjustments (Priority: P3)

Musicians need to directly edit ornamental text (change pitches, add/remove notes). They toggle edit mode to display ornaments inline with normal spacing, make edits, then toggle back to normal mode for final rendering.

**Why this priority**: Improves editing ergonomics for complex ornament sequences

**Independent Test**: Can be fully tested by creating ornamental text, toggling edit mode ON, making edits to the text, toggling edit mode OFF, and verifying changes persist and render correctly

**Acceptance Scenarios**:

1. **Given** ornamental text exists in normal mode (floating), **When** user toggles edit mode ON (Alt+Shift+O), **Then** ornaments appear inline with normal horizontal spacing while maintaining visual styling (size, color, raised position)
2. **Given** edit mode is ON, **When** user edits ornamental text directly (add/delete/change characters), **Then** changes are immediately reflected
3. **Given** edits are complete, **When** user toggles edit mode OFF, **Then** ornaments return to floating layout (zero horizontal width) and changes persist
4. **Given** mode is toggled, **When** transition occurs, **Then** no visual flickering or disruptive layout shifts occur

---

### Edge Cases

- What happens when ornaments in multiple positions (before/after/top) would visually overlap with each other?
- How does collision detection work when "after" ornament on one cell would collide with "before" ornament on the next cell?
- How much horizontal spacing is added when ornaments collide - just enough to separate, or a fixed amount?
- What happens when ornaments are copied/pasted - is the ornament_indicator field copied along with cell content?
- How does the system handle ornaments when transposing music?
- What happens if attachment cannot be established (orphaned ornament with no nearby content)?
- What happens if content with ornamental styling is deleted?
- How does the system handle rendering transitions when switching between edit modes (smooth vs. jarring)?
- When exporting to MusicXML, how are ornaments with position types (before/after/top) mapped to MusicXML placement attributes?
- When exporting to LilyPond, how are the three position types mapped to LilyPond grace note syntax?
- How are ornaments excluded from beat subdivision counting (example: if `234` are ornaments and `1--4` are regular notes, beat should calculate as 4 subdivisions from `1--4`, not 7 total)?
- What happens when calculating measure divisions for MusicXML if a beat contains only ornamental cells and no regular rhythmic notes?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to select text and apply ornament styling via Edit menu (Ornament / Ornament Before / Ornament Top)
- **FR-002**: Users MUST be able to apply default ornament styling using keyboard shortcut (Alt-0)
- **FR-003**: Users MUST be able to toggle ornament styling off by selecting ornamental text and reapplying the same ornament type
- **FR-004**: System MUST render ornamental cells at approximately 75% of standard font size and position them above baseline (70%-125% above), similar to superscripts
- **FR-004a**: When edit mode is OFF, ornamental cells MUST use zero horizontal space (float above attached content without affecting horizontal layout)
- **FR-004b**: When edit mode is OFF and ornamental cells would collide horizontally, System MUST add horizontal spacing to prevent collision
- **FR-004c**: When edit mode is ON, ornamental cells MUST be rendered inline with normal horizontal spacing while maintaining visual styling (size, color, raised position)
- **FR-005**: System MUST visually distinguish ornamental cells using color styling (e.g., indigo)
- **FR-006**: System MUST exclude ornamental cells from beat calculations and rhythmic grouping (ornaments are rhythm-transparent with NO rhythmic value)
- **FR-006a**: When calculating beat subdivisions, System MUST NOT count ornamental cells as rhythmic elements
- **FR-006b**: When performing implicit beat grouping, System MUST exclude ornamental cells from beat subdivision counting
- **FR-006c**: When exporting to formats requiring rhythm calculation (MusicXML, MIDI, LilyPond), System MUST exclude ornamental cells from division and duration calculations
- **FR-007**: When exporting to MusicXML, System MUST convert ornamental cells containing pitches to `<grace/>` elements (rhythm-transparent elements with no duration value)
- **FR-007a**: When exporting to MusicXML, System MUST export ornamental cells of all three position types (before/after/top), using appropriate MusicXML placement attributes where supported by the format
- **FR-007b**: System MUST determine placement (before/after/top) from the cell's ornament_indicator variant when exporting
- **FR-008**: When exporting to LilyPond, System MUST convert ornamental cells containing pitches using `\grace { }` syntax
- **FR-009**: Users MUST be able to toggle Edit Ornament Mode (Alt+Shift+O) to control whether ornamental cells are part of the editable text flow
- **FR-009a**: When edit mode is OFF (Normal Mode, default), ornamental cells MUST NOT be selectable or editable - they exist as visual overlays only
- **FR-009b**: When edit mode is OFF, System MUST render ornamental cells as floating visual overlays with zero horizontal width, positioned relative to attached content according to ornament_indicator variant (Before: left, After: right, OnTop: above)
- **FR-009c**: When edit mode is ON, ornamental cells MUST return to the editable text flow and be selectable/editable like normal cells
- **FR-009d**: When edit mode is ON, System MUST render ornamental cells inline in their sequential position with normal horizontal spacing
- **FR-009e**: Ornamental cells MUST use consistent visual styling (font size ~75%, vertical placement above baseline, color) in both modes; only editability and horizontal layout differ
- **FR-009f**: Toggling edit mode MUST NOT modify cell data or trigger data transformations; it only affects editability and visual rendering
- **FR-010**: System MUST provide keyboard shortcut for toggling edit mode (Alt+Shift+O)
- **FR-011**: System MUST position ornamental cells to avoid visual overlap with main content and with other ornamental cells
- **FR-011a**: The "after" position type MUST be the default when users apply ornament styling via Alt-0 or Edit → Ornament
- **FR-012**: Ornamental cells MUST maintain their styling when content is edited (copy/paste, insertion, deletion)

### Key Entities

- **Ornamental Cell**: Any cell with ornament styling applied. Ornaments are NOT separate entities - they are **regular cells** (notes, text, symbols, dashes, any content) with their `ornament_indicator` field set. Like bold or italic text, ornament is a **visual style** applied to existing content.

  **Data Model**: Follows the span-marking pattern (like slurs):
  - First selected cell: `ornament_indicator` = Start variant (BeforeStart / AfterStart / OnTopStart)
  - Last selected cell: `ornament_indicator` = End variant (BeforeEnd / AfterEnd / OnTopEnd)
  - Cells between first and last comprise the ornament span

  **Visual Rendering**: Smaller font (~75% size), raised above baseline (superscript-like), colored distinctively. In normal mode: float with zero horizontal width. In edit mode: inline with normal spacing.

  **Musical Context**: When applied to pitch cells, ornaments function as embellishments. **Rhythm-transparent**: ornaments have NO rhythmic value, excluded from beat calculations and measure duration. Exported as `<grace/>` elements in MusicXML, `\grace { }` in LilyPond.

- **Ornament Indicator** (Enum field on Cell): Marks ornament styling boundaries and position type. Six variants:
  - `OrnamentBeforeStart` / `OrnamentBeforeEnd` - before-positioned spans
  - `OrnamentAfterStart` / `OrnamentAfterEnd` - after-positioned spans (default)
  - `OrnamentOnTopStart` / `OrnamentOnTopEnd` - top-positioned spans

  **No separate position field** - the indicator variant itself encodes position type.

- **Attachment Resolution** (Render/Export Algorithm): Determines which content ornamental cells visually attach to:
  1. Scan for ornament spans (Start/End pairs)
  2. Determine attachment based on position type:
     - **Before** → attach to first cell to the right
     - **After** → attach to last cell to the left (DEFAULT)
     - **On-top** → attach to nearest neighboring cell
  3. Group ornamental cells by attachment target for rendering/export

  Computed on-demand, NOT stored permanently. Any cell type can serve as attachment target.

- **Edit Ornament Mode Toggle**: Controls whether ornamental cells are part of the editable text flow:
  - **Normal Mode (OFF, default)**: Ornamental cells **leave the editable text flow**, become visual overlays (float with zero width, positioned by attachment type). Cannot be selected or edited.
  - **Edit Mode (ON, Alt+Shift+O)**: Ornamental cells **return to editable text flow**, appear inline with normal spacing. Can be selected and edited like normal cells.

  Visual styling (size, color, raised position) stays consistent across both modes. Only editability and horizontal layout change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can apply ornament styling to selected text in under 10 seconds
- **SC-002**: Ornamental cells render at 75% of standard font size, ensuring visual distinction without readability issues
- **SC-003**: Ornamental cells do not affect beat grouping or measure calculations in any musical context
- **SC-004**: Ornamental cells export correctly to MusicXML and LilyPond formats in 100% of test cases
- **SC-005**: Users can visually identify ornamental cells separate from main content without confusion (verified through user testing)
- **SC-006**: Ornament positioning prevents overlap with main content and with other ornamental cells in at least 95% of typical scenarios
- **SC-007**: Users can toggle between edit and normal modes in under 2 seconds using keyboard shortcuts, with smooth rendering transitions
- **SC-008**: Ornament operations (apply styling, edit content, remove styling) do not cause performance degradation in documents with up to 1000 cells
- **SC-009**: Mode transitions complete without visual flickering or disruptive layout shifts
- **SC-010**: Users can apply ornaments with all three position types (before, after, on-top) to content without confusion or visual overlap
- **SC-011**: Reapplying the same ornament type to already-styled content successfully removes it (toggle off) in 100% of cases
- **SC-012**: Ornamental cells use zero horizontal space when they do not collide, maintaining compact layout
- **SC-013**: Collision detection prevents ornament overlap in 100% of cases by adding horizontal spacing when needed

## Assumptions

### Core Principles
- **MusicXML is the de facto data model**: Ornament behavior is primarily defined by how they convert to MusicXML grace note elements; in MusicXML, grace notes have no rhythmic value and don't contribute to beat subdivision calculations
- **Token-based conceptual model**: Ornaments are first-class tokens in the musical sequence, not sub-objects or attributes of other tokens. Attachment to other tokens is computed at render/export time, not stored in the editing model
- **"Honor the page"**: The editor captures handwritten notation faithfully without forcing premature commitment to rhythm quantization, measure balancing, or exact durations

### User Understanding
- Users understand basic music notation concepts including grace notes and ornamentation
- Users understand that toggling edit mode changes how ornaments are displayed (inline vs. floating), but not their musical meaning
- Visual connection between ornaments and their attached tokens (via arcs or proximity) is sufficient for clarity

### Ornament Model
- Ornaments are standalone tokens in the musical sequence
- Ornament spans marked by indicator variants: `OrnamentBeforeStart/End`, `OrnamentAfterStart/End`, or `OrnamentOnTopStart/End` (the indicator variant itself represents the position - there is no separate position field)
- Ornaments can attach to any token type at render/export time (pitched elements are preferred but not enforced)
- Multiple ornament tokens can exist in sequence around an element (like several tiny pickup notes or a cascade)
- Three indicator variant pairs (before, after, top) cover the majority of ornament positioning needs for professional notation
- Default is `OrnamentAfterStart/End` when users don't explicitly choose
- Typical ornament sequences contain up to 10 grace notes
- Ornaments use the same pitch input system as main notation (e.g., letter names, octave indicators)

### Rendering & Visual
- Font size reduction to 75% provides sufficient visual distinction while maintaining readability
- Vertical positioning range of 70% to 125% above baseline provides sufficient clearance above parent notes
- When edit mode is OFF: zero horizontal width is the canonical layout (float above like superscripts), with collision detection adding spacing only when necessary
- When edit mode is OFF: ornaments can float above whitespace and dashes without requiring additional horizontal space
- When edit mode is ON: ornaments displayed inline with normal horizontal spacing for easier editing
- Visual styling (font size, vertical placement) remains consistent between edit modes; only horizontal spacing and layout strategy differ
- Collision detection algorithms can determine when horizontal spacing is needed and calculate appropriate spacing amounts

### Export & Playback
- Export formats (MusicXML, LilyPond) have standard grace note representations, though MusicXML may have limitations in fully representing all three position types and the system will export as best as possible given format capabilities
- Ornaments do not require independent playback controls (playback follows standard grace note conventions)

### Implementation Notes
- Six ornament-indicator enum variants: `OrnamentBeforeStart/End`, `OrnamentAfterStart/End`, `OrnamentOnTopStart/End`
- Ornament spans are marked by start/end indicator pairs; cells between the indicators constitute the ornament
- Similar to how different barline types are distinct enum variants, the indicator variant itself represents position (before/after/top) - there is no separate position field
- Anchor location (which token an ornament attaches to) is **implicit** and computed at render/export time based on:
  - Which indicator variant marks the span (Before, After, or Top)
  - Position in token stream relative to anchor tokens
  - Attachment rules: Before→first token to right, After→last token to left, Top→nearest token
- The token stream is the source of truth; computed groupings/attachments are derived views
