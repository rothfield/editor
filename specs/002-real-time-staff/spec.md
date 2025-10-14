# Feature Specification: Real-Time Staff Notation Rendering

**Feature Branch**: `002-real-time-staff`
**Created**: 2025-10-14
**Status**: Draft
**Input**: User description: "Real-time staff notation rendering that converts music notation documents to visual sheet music display"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Basic Notation as Staff (Priority: P1)

A user types simple music notation (notes, rests) and immediately sees the equivalent staff notation rendered visually, allowing them to verify their input matches expected sheet music.

**Why this priority**: Core value proposition - visual feedback is the primary feature benefit. Without this, the feature provides no value.

**Independent Test**: Can be fully tested by typing "1 2 3" and verifying three quarter notes appear on a staff, delivering immediate visual feedback for basic notation.

**Acceptance Scenarios**:

1. **Given** an empty document, **When** user types "1 2 3", **Then** staff notation displays three quarter notes
2. **Given** user types a melody, **When** they switch to the Staff Notation tab, **Then** the notation renders within 200ms
3. **Given** an empty document, **When** user opens the Staff Notation tab, **Then** an empty measure with a whole rest is displayed
4. **Given** user types notes, **When** they add a rest using "r", **Then** the staff notation shows the rest symbol in the correct position

---

### User Story 2 - Real-Time Update During Editing (Priority: P1)

As a user edits their notation (adding, removing, or changing notes), the staff notation updates automatically without manual refresh, providing continuous visual feedback during composition.

**Why this priority**: Essential for usability - manual refresh would break the editing flow and diminish the feature's value significantly.

**Independent Test**: Can be tested by typing a note, waiting for render, then adding another note and verifying the staff updates within 100ms.

**Acceptance Scenarios**:

1. **Given** existing notation on screen, **When** user adds a new note, **Then** staff notation updates within 100ms showing the new note
2. **Given** rendered staff notation, **When** user deletes a note, **Then** staff notation updates to reflect the deletion
3. **Given** multiple rapid edits (typing quickly), **When** user pauses, **Then** staff notation renders once showing all accumulated changes
4. **Given** user is on a different tab, **When** they make edits, **Then** staff notation updates when they switch back to the Staff Notation tab

---

### User Story 3 - Display Measures and Barlines (Priority: P2)

A user adds barlines to their notation using "|" symbols, and the staff notation displays these as proper measure divisions, helping them organize their composition into musical phrases.

**Why this priority**: Important for musical structure but not required for basic note display. Users can still get value from seeing notes without measure organization.

**Independent Test**: Can be tested by typing "1 2 | 3 4 ||" and verifying two measures appear with appropriate barline styles (single and double).

**Acceptance Scenarios**:

1. **Given** notation "1 2 | 3 4", **When** staff renders, **Then** two measures appear separated by a single barline
2. **Given** notation ending with "||", **When** staff renders, **Then** a double barline (section end) appears at the end
3. **Given** a long sequence without barlines, **When** staff renders, **Then** all notes appear in a single measure
4. **Given** multiple lines with barlines, **When** staff renders, **Then** each line creates a new system with proper measure continuity

---

### User Story 4 - Display Extended Durations and Ties (Priority: P2)

A user extends note duration using "-" symbols, and the staff notation displays longer note values (half notes, whole notes) or tied notes, accurately representing the intended rhythm.

**Why this priority**: Necessary for expressing rhythmic variety beyond quarter notes, but basic feature works without it for simple melodies.

**Independent Test**: Can be tested by typing "1 - 2" and verifying a half note followed by a quarter note appears.

**Acceptance Scenarios**:

1. **Given** notation "1 -", **When** staff renders, **Then** a half note appears
2. **Given** notation "1 - - -", **When** staff renders, **Then** a whole note appears
3. **Given** notation "1 - - - -", **When** staff renders, **Then** tied notes spanning the duration appear
4. **Given** mixed durations "1 2 - 3", **When** staff renders, **Then** quarter, half, quarter notes appear in sequence

---

### User Story 5 - Display Multiple Lines as Systems (Priority: P3)

A user writes notation across multiple lines, and the staff notation renders each line as a separate system (line of staff notation), making it easy to read longer compositions.

**Why this priority**: Useful for organization and readability but not essential for short musical ideas. Feature provides value even with single-line compositions.

**Independent Test**: Can be tested by creating notation on two separate lines and verifying they render as two distinct systems with appropriate spacing.

**Acceptance Scenarios**:

1. **Given** two lines of notation, **When** staff renders, **Then** two systems (staff lines) appear vertically stacked
2. **Given** measures spanning multiple lines, **When** staff renders, **Then** measure numbering continues correctly across systems
3. **Given** very long single-line notation, **When** staff renders, **Then** system wraps occur naturally based on viewport width
4. **Given** empty lines in the document, **When** staff renders, **Then** empty systems with whole rests appear

---

### Edge Cases

- What happens when the document contains invalid notation syntax?
  - System displays the last valid rendering and shows a subtle indicator that rendering failed
- How does the system handle very long compositions (100+ measures)?
  - Rendering uses virtualization to only render visible portions, maintaining performance
- What happens when the browser window is resized?
  - Staff notation reflows to fit the new viewport width, potentially changing system breaks
- How does the system handle rapid successive edits (typing very fast)?
  - Debouncing mechanism batches updates, rendering only after 100ms pause in typing
- What happens when MusicXML export fails for a particular notation pattern?
  - Previous valid rendering persists, and an error indicator appears without breaking the interface
- How does the system handle switching tabs during rendering?
  - Rendering is cancelled if user switches away, and restarted when they return to Staff Notation tab

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST convert internal document structure to valid MusicXML format
- **FR-002**: System MUST render MusicXML as visual staff notation using a sheet music rendering library
- **FR-003**: System MUST update staff notation display within 100ms after user stops editing
- **FR-004**: System MUST display notes with correct pitch, octave, and position on the staff
- **FR-005**: System MUST display rests in the correct positions with appropriate symbols
- **FR-006**: System MUST represent extended note durations as longer note values (half, whole notes) or ties
- **FR-007**: System MUST display barlines as visual measure separators with correct styles (single, double)
- **FR-008**: System MUST render multiple document lines as separate musical systems
- **FR-009**: System MUST provide a dedicated viewing area (tab) for staff notation display
- **FR-010**: System MUST handle empty documents by displaying an empty measure with a whole rest
- **FR-011**: System MUST debounce rendering to avoid excessive updates during rapid editing
- **FR-012**: System MUST maintain rendering performance for documents up to 50 measures
- **FR-013**: System MUST gracefully handle rendering failures without breaking the user interface
- **FR-014**: System MUST preserve pitch accidentals (sharps, flats, naturals) in the visual rendering
- **FR-015**: System MUST render notation automatically when user switches to the Staff Notation tab

### Key Entities

- **Music Document**: The internal representation of the user's notation, consisting of lines and cells with element types (notes, rests, barlines, whitespace)
- **MusicXML Output**: Standard XML format for music notation interchange, containing measures, notes, pitches, durations, and musical attributes
- **Staff Notation Display**: Visual rendering of sheet music on a five-line staff, showing notes, rests, clefs, and measure divisions
- **Cell Element**: Individual notation element with properties including type (pitched/unpitched), pitch code, octave, duration modifiers
- **Measure**: Musical unit bounded by barlines, containing a sequence of notes and rests that sum to the time signature

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view staff notation for typed music within 200ms of opening the Staff Notation tab
- **SC-002**: Staff notation updates within 100ms after user stops typing (debounce period)
- **SC-003**: System accurately renders 95% of common notation patterns (single notes, rests, basic durations, barlines) on first attempt
- **SC-004**: Users can compose and view compositions up to 50 measures without performance degradation
- **SC-005**: Rendering failures occur in less than 5% of user edits and display graceful error states
- **SC-006**: Staff notation display accurately reflects pitch and rhythm for all valid notation input
- **SC-007**: Multi-line documents render with clear system separation and maintain visual continuity across systems

## Assumptions *(mandatory)*

- The application already has a working text-based music notation editor with document structure
- An archive project exists with proven MusicXML export code that can be ported
- Document structure uses Cell-based model with ElementKind enum (PitchedElement, UnpitchedElement, Whitespace, Barline, BreathMark)
- PitchCode information is available either as enum or parseable string format
- Browser environment supports WebAssembly for Rust-based MusicXML export
- OSMD (OpenSheetMusicDisplay) library is available and compatible with generated MusicXML
- Application uses a tab-based interface where new views can be added
- Standard web performance expectations apply (desktop/mobile browsers from last 2 years)
- Users are composing music in a single voice/instrument context (not full orchestral scores)
- Time signature defaults to 4/4 unless future features specify otherwise

## Dependencies *(mandatory)*

- Existing document model and editing infrastructure
- Archive project codebase containing proven MusicXML export implementation
- WebAssembly build toolchain for Rust code compilation
- OSMD (OpenSheetMusicDisplay) JavaScript library for rendering
- Browser support for ES6 modules and dynamic imports

## Out of Scope *(mandatory)*

- Multiple voices or polyphonic notation on a single staff
- Chord symbols, lyrics, or text annotations
- Dynamic markings (forte, piano, crescendo, etc.)
- Articulation marks (staccato, accent, fermata, etc.) beyond basic notes and rests
- Tempo markings or metronome marks
- Key signature changes or transposition
- Time signature changes or complex meters
- Playback or audio generation from the notation
- Printing or PDF export of staff notation
- Custom styling or theme options for the rendered staff
- Orchestral score layouts or multi-staff systems (piano grand staff, etc.)
- Advanced tuplets beyond basic triplets
- Grace notes or ornaments
- Slurs or phrase markings
- Performance optimization beyond 50 measures
