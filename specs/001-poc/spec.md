# Feature Specification: Music Notation Editor POC

**Feature Branch**: `[001-poc]`
**Created**: 2025-10-11
**Status**: Draft
**Input**: User description: "poc"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Basic Music Notation Entry and Editing (Priority: P1)

As a musician, I want to enter and edit musical notation using a Cell-based model with support for both Number and Western pitch systems, including immediate keyboard responsiveness when the editor canvas receives focus, to create simple musical scores with automatic beat detection and rendering.

**Why this priority**: This establishes the core value proposition - intuitive music notation entry and editing with proper musical semantics, pitch system flexibility, and immediate keyboard responsiveness upon focus.

**Independent Test**: Can be fully tested by entering and editing notation in both pitch systems using keyboard operations, focus management, and verifying proper beat segmentation, rendering, and pitch system handling.

**Acceptance Scenarios**:

1. **Given** I have the Number pitch system selected (default), **When** I type "12345671", **Then** the system recognizes these as valid pitched elements and creates appropriate beats
2. **Given** I have the Western pitch system selected, **When** I type "cdefgabC", **Then** the system recognizes these as valid pitched elements and creates appropriate beats
3. **Given** I have any pitch system selected, **When** I type "C#" or "2bb", **Then** the system recognizes these as valid pitched elements with accidentals
4. **Given** the editor canvas is displayed, **When** I set focus on the canvas (click, tab, or programmatically), **Then** the cursor becomes immediately active for typing without additional interaction
5. **Given** I have set focus on the editor canvas, **When** I type characters, **Then** they appear at the cursor position immediately
6. **Given** I have typed musical notation, **When** I press backspace, **Then** the character immediately before the cursor is deleted and beats are recalculated
7. **Given** I have musical notation with a cursor positioned, **When** I hold shift and press arrow keys, **Then** I can create and extend selections character by character
8. **Given** I have a selection, **When** I press backspace, **Then** the entire selected content is deleted
9. **Given** I have typed musical notation, **When** I view the rendering, **Then** lower loops/arc are drawn automatically beneath each beat
10. **Given** I select a pitched element, **When** I apply an ornament (mordent), **Then** the ornament renders above the selected element
11. **Given** I type a barline "|", **When** the notation renders, **Then** the barline appears and beats are properly segmented
12. **Given** I switch from Number to Western pitch system, **When** I view existing notation, **Then** the system converts and displays notes in the new system correctly

---

### User Story 2 - Keyboard-Only Editing (Priority: P2)

As a user, I want to interact with the notation using keyboard arrows to navigate and visual highlighting for selections to enable precise editing without mouse interaction.

**Why this priority**: Essential keyboard-based editing capabilities that make the editor usable for precise musical content manipulation using only the keyboard.

**Independent Test**: Can be tested by navigating through notation using keyboard input methods and verifying caret positioning and selection behavior.

**Acceptance Scenarios**:

1. **Given** I have musical notation displayed, **When** I use arrow keys (left/right), **Then** the caret moves to adjacent Cells
2. **Given** I have a caret positioned, **When** I use arrow keys (up/down), **Then** the caret moves between lines at appropriate positions
3. **Given** I have a caret positioned, **When** I use Shift+arrow keys, **Then** the selection expands appropriately with visual highlighting
4. **Given** I have text selected via keyboard, **When** I type new characters, **Then** the selected text is replaced and highlighting updates
5. **Given** I have a caret positioned, **When** I press home/end keys, **Then** the caret moves to the beginning/end of the current line

---

### User Story 3 - Selection-Based Musical Commands (Priority: P3)

As a musician, I want to apply musical notations like slurs and octaves to selected ranges using keyboard shortcuts to efficiently enhance musical expression and articulation.

**Why this priority**: Advanced musical notation features that demonstrate the full capabilities of the Cell model with efficient selection-based operations.

**Independent Test**: Can be tested by selecting ranges and applying slur/octave commands via keyboard shortcuts, verifying proper toggle behavior and rendering.

**Acceptance Scenarios**:

1. **Given** I have notation "S--r g", **When** I select "S--r g" using shift-arrow keys and press alt-S, **Then** a curved slur connects the start and end of the selection
2. **Given** I have an existing slur on selected notation, **When** I press alt-S again, **Then** the slur is removed (toggle behavior)
3. **Given** I have selected pitched elements, **When** I press alt-u, **Then** octave +1 (bullet above) is applied to all pitched elements in the selection
4. **Given** I have selected pitched elements with octave +1, **When** I press alt-u again, **Then** octave +1 is removed (toggle behavior)
5. **Given** I have selected pitched elements, **When** I press alt-m, **Then** octave 0 (no display) is applied to all pitched elements in the selection
6. **Given** I have selected pitched elements, **When** I press alt-l, **Then** octave -1 (bullet below) is applied to all pitched elements in the selection
7. **Given** I have a pitched element, **When** I toggle mordent, **Then** the mordent ornament renders above the element
8. **Given** I have notation with dots, **When** I view the rendering, **Then** upper and lower dots appear in the correct positions
9. **Given** I have a slur crossing a barline, **When** the notation renders, **Then** the slur renders continuously across the barline without splitting
10. **Given** I press alt-t, **When** the tala request box opens, **Then** I can enter digits 0-9+ to set talas for the whole line
11. **Given** I enter "+203" in the tala box, **When** I apply the tala, **Then** the digits snap above the barlines (2 above first, 0 above second, 3 above third)
12. **Given** I have existing talas, **When** I press alt-t and enter new digits, **Then** the previous talas are replaced with the new ones
13. **Given** I select "Set Line Label" from the menu, **When** I enter text, **Then** the label appears at the beginning of the current line
14. **Given** I select "Set Composition Title" from the menu, **When** I enter text, **Then** the title appears centered at the top of the document
15. **Given** I have a composition title set, **When** I view the document, **Then** the title is rendered above all lines and centered horizontally
16. **Given** I select "File → Set Tonic", **When** I choose a root note, **Then** the tonic is set for the entire composition
17. **Given** I select "Stave → Set Tonic", **When** I choose a root note, **Then** the tonic is set for the current line only
18. **Given** I have different tonics set for different lines, **When** I view the document, **Then** each line uses its own tonic for pitch interpretation
19. **Given** I select "File → Set Pitch System", **When** I choose Number or Western, **Then** the pitch system changes for the entire composition
20. **Given** I select "Stave → Set Pitch System", **When** I choose Number or Western, **Then** the pitch system changes for the current line only
21. **Given** I select "File → Set Key Signature", **When** I choose sharps or flats, **Then** the key signature is set for the entire composition
22. **Given** I select "Stave → Set Key Signature", **When** I choose sharps or flats, **Then** the key signature is set for the current line only
23. **Given** I have different key signatures set for different lines, **When** I view the document, **Then** each line displays its key signature at the beginning and uses it for pitch interpretation
24. **Given** I have a key signature set, **When** I type pitched elements, **Then** the key signature automatically applies the appropriate sharps or flats to the notes

---

### User Story 4 - UI Interface and Debug Information (Priority: P3)

As a developer, I want a clean menu-based interface with debug information tabs to understand the current document state and monitor application behavior during development.

**Why this priority**: Essential development tools for debugging and understanding the Cell data structure and application state.

**Independent Test**: Can be tested by navigating menus, switching tabs, and verifying that focus returns correctly to the editor after UI interactions.

**Acceptance Scenarios**:

1. **Given** I am using the application, **When** I interact with menu items, **Then** focus automatically returns to the editor canvas after the menu operation
2. **Given** I am viewing the interface, **When** I switch between tabs (Document, Console Errors, Console Log), **Then** focus automatically returns to the editor canvas
3. **Given** I have entered musical notation, **When** I click the "Document" tab, **Then** I see the current Cell array structure displayed in a readable format
4. **Given** an error occurs in the application, **When** I click the "Console Errors" tab, **Then** I see error messages displayed with timestamps
5. **Given** I perform actions in the editor, **When** I click the "Console Log" tab, **Then** I see debug information and action logs displayed
6. **Given** I am using the application, **When** I view the HTML source, **Then** JavaScript and CSS are in separate external files, not embedded in HTML

---

### Edge Cases

- How does the system handle grapheme clusters (combining characters, ZWJ sequences)?
- What happens when users attempt invalid musical notation sequences?
- How are large musical documents handled for performance?
- What happens with malformed file imports?
- How does the system handle very long slurs spanning multiple beats?

## Requirements *(mandatory)*

### Functional Requirements

**Cell Model Requirements**
- **FR-001**: System MUST represent all content as Cell arrays, one per visible grapheme cluster
- **FR-002**: Every Cell corresponds to one visible column (grapheme-safe)
- **FR-003**: System MUST support ElementKind types: PitchedElement, UnpitchedElement, UpperAnnotation, LowerAnnotation, LyricElement
- **FR-004**: System MUST handle temporal columns (those whose kind is PitchedElement or UnpitchedElement) separately from non-temporal columns
- **FR-005**: System MUST provide grapheme-safe indexing to prevent splitting combined characters
- **FR-006**: System MUST mark the first column (Cell) of multi-character tokens as 'head' to identify token boundaries
- **FR-007**: System MUST provide navigation methods to jump between head Cells for efficient token-based movement

**Music Notation Requirements**
- **FR-008**: System MUST support Number pitch system (1-7) as the default, with optional accidentals (#, ##, b, bb) only
- **FR-009**: System MUST support Western pitch system (cdefgab or CDEFGAB) with optional accidentals (#, ##, b, bb) only
- **FR-010**: System MUST support unpitched elements (-, --, ', |, space) with proper semantics
- **FR-011**: System MUST automatically derive implicit beats as "words" of temporal columns separated by spaces or barlines, or other non-beat elements using the extract_implicit_beats algorithm:
  - Beat separators: barlines ("|"), spaces (" "), and breath marks ("'") based on breath_ends_beat parameter
  - Beat elements: PitchedElement and UnpitchedElement kinds
  - Single-element beats included/excluded based on draw_single_cell_loops parameter
  - Algorithm processes contiguous temporal columns to create BeatSpan objects
- **FR-012**: System MUST render lower loops/arcs beneath each derived beat span
- **FR-013**: System MUST support draw_single_cell_loops parameter to suppress loop rendering for single-element beats (default: false)
- **FR-014**: System MUST support breath_ends_beat parameter to control whether breath marks (') end beats (default: true)
- **FR-015**: System MUST support configurable loop rendering parameters (loop_offset_px, loop_height_px) for beat visualization
- **FR-016**: System MUST support musical ornaments (mordent, upper/lower dots) on pitched elements
- **FR-017**: System MUST support octave display on pitched elements with range -4 to +4, where octave dots are rendered above (positive) or below (negative) the element
- **FR-018**: System MUST support slurs that can start/end on any element, anywhere in the notation (temporal or non-temporal elements)
- **FR-019**: System MUST handle barlines as beat separators and visual dividers
- **FR-020**: System MUST treat breath marks (') as inside beats by default (controlled by breath_ends_beat parameter), but allow them to be positioned outside beats when needed for musical notation
- **FR-021**: System MUST allow users to switch between Number and Western pitch systems with proper conversion
- **FR-022**: System MUST support unknown text on the main line as text tokens rendered in red color
- **FR-023**: System MUST support multi-character tokens for both musical and text elements
- **FR-024**: System MUST properly handle multi-character grapheme clusters for accurate token recognition
- **FR-025**: System MUST display text tokens only when characters cannot be parsed as musical notation elements
- **FR-026**: System MUST prioritize musical notation rendering over text token display for all characters on the main line

**Focus Management Requirements**
- **FR-027**: System MUST immediately activate cursor for typing when the editor canvas receives focus
- **FR-028**: System MUST support focus activation via mouse click, keyboard tab navigation, or programmatic focus setting
- **FR-029**: System MUST provide visual indication when the editor canvas has focus (cursor visibility, outline, etc.)
- **FR-030**: System MUST maintain cursor position and visibility when focus is lost and restored
- **FR-031**: System MUST handle focus transitions smoothly without interrupting user input

**POC Scope Limitations**
- **FR-032**: System MUST support ordered lanes structure [Upper, Letter, Lower, Lyrics] where each lane is a Vec<Cell> with shared column alignment for vertical positioning of annotations
- **FR-033**: System MUST render all content at 16-point typeface for the POC

**Keyboard-Only Editing Requirements**
- **FR-034**: System MUST support arrow key navigation (left/right) for precise Cell movement within the single line
- **FR-035**: System MUST provide visual highlighting for selected ranges of notation
- **FR-036**: System MUST support Shift+arrow key selection expansion
- **FR-037**: System MUST support home/end key navigation for line beginning/end positioning
- **FR-038**: System MUST correctly position caret considering grapheme cluster boundaries
- **FR-039**: System MUST support backspace key to delete the character immediately before the cursor
- **FR-040**: System MUST support backspace key to delete entire selected content when a selection exists
- **FR-041**: System MUST recalculate beats and update rendering immediately after deletion operations
- **FR-042**: System MUST maintain proper cursor positioning after deletion operations

**Selection-Based Command Requirements**
- **FR-043**: System MUST support alt-S keyboard shortcut to toggle slurs on selected ranges of notation
- **FR-044**: System MUST support alt-u keyboard shortcut to toggle octave +1 (bullet above) on selected pitched elements
- **FR-045**: System MUST support alt-m keyboard shortcut to set octave 0 (no display) on selected pitched elements
- **FR-046**: System MUST support alt-l keyboard shortcut to toggle octave -1 (bullet below) on selected pitched elements
- **FR-047**: System MUST support alt-t keyboard shortcut to open tala request box for setting talas for the whole line
- **FR-048**: System MUST support tala input with digits 0-9+ characters only, stored at line level
- **FR-049**: System MUST display tala digits above barlines (e.g., "+203" positions 2 above first barline, 0 above second, 3 above third)
- **FR-050**: System MUST apply slur commands only to valid notation within selection (ignore text/non-musical elements)
- **FR-051**: System MUST apply octave commands only to pitched elements within selection
- **FR-052**: System MUST provide visual feedback immediately after toggle command application
- **FR-053**: System MUST support undo/redo for all toggle command operations
- **FR-054**: System MUST support line-level lyrics storage as text strings displayed below the first pitched element of the line
- **FR-055**: System MUST support line-level labels stored as text strings displayed at the beginning of lines
- **FR-056**: System MUST support composition-level title stored as text string rendered at the top of the document, centered
- **FR-057**: System MUST provide organized menu structure with File menu and Stave menu
- **FR-058**: System MUST provide File menu with items: New, Save, Open, Export MusicXML (stub), Export LilyPond (stub), Set Title, Set Tonic, Set Pitch System, Set Key Signature
- **FR-059**: System MUST provide Stave menu with items: Set Label, Set Tonic, Set Pitch System, Set Lyrics, Set Tala, Set Key Signature
- **FR-060**: System MUST support tonic setting at both composition level (File menu) and stave level (Stave menu)
- **FR-061**: System MUST support pitch system switching at both composition level (File menu) and stave level (Stave menu)
- **FR-062**: System MUST support key signature setting at both composition level (File menu) and stave level (Stave menu)
- **FR-063**: System MUST display key signatures at the beginning of lines (after line labels) affecting pitch interpretation for those lines

**Text Document Requirements**
- **FR-051**: System MUST support standard text entry alongside musical notation within the single line
- **FR-052**: System MUST provide basic text formatting capabilities
- **FR-053**: System MUST allow users to save documents containing text and notation
- **FR-054**: System MUST support file operations (open, save, export) for mixed content documents
- **FR-055**: System MUST provide undo/redo functionality for all editing operations

**UI Framework Requirements**
- **FR-052**: System MUST implement utility-based styling system
- **FR-053**: System MUST implement menu-based navigation for user interface
- **FR-054**: System MUST separate JavaScript and CSS into external files (not embedded in HTML)
- **FR-055**: System MUST provide a tab group below the main editor canvas
- **FR-056**: System MUST include a "Document" tab showing current data structure (Cell arrays)
- **FR-057**: System MUST include a "Console Errors" tab displaying error messages
- **FR-058**: System MUST include a "Console Log" tab displaying debug information
- **FR-059**: System MUST return focus to the editor canvas after menu operations
- **FR-060**: System MUST return focus to the editor canvas after tab switching

**E2E Testing Requirements**
- **FR-061**: System MUST provide comprehensive end-to-end tests for all features using headless Playwright
- **FR-062**: System MUST test basic music notation entry and rendering with both Number and Western pitch systems
- **FR-063**: System MUST test keyboard navigation and selection functionality (arrow keys, shift+arrows, home/end)
- **FR-064**: System MUST test focus management (canvas activation, focus return after UI interactions)
- **FR-065**: System MUST test selection-based commands (alt-S slur, alt-u/m/l octave commands)
- **FR-066**: System MUST test deletion operations (backspace, selection deletion)
- **FR-067**: System MUST test UI components (menus, tab switching, console tabs)
- **FR-068**: System MUST test data structure display in Document tab
- **FR-069**: System MUST test error handling and console logging
- **FR-070**: System MUST test file operations (save, load, export)
- **FR-071**: System MUST validate all tests run in headless mode without requiring visual inspection
- **FR-072**: System MUST provide test coverage reports for all feature areas

**Code Quality Requirements**
- **FR-073**: System MUST use modern language syntax and features
- **FR-074**: System MUST implement modular architecture with clear separation of concerns
- **FR-075**: System MUST implement proper error handling with try/catch blocks
- **FR-076**: System MUST use async/await for asynchronous operations
- **FR-077**: System MUST implement proper memory management and avoid memory leaks
- **FR-078**: System MUST use type safety (type annotations or static typing preferred)
- **FR-079**: System MUST implement proper event handling with listeners
- **FR-080**: System MUST use modern DOM APIs for interface manipulation
- **FR-081**: System MUST use modern array methods for data processing
- **FR-082**: System MUST implement proper null checking and optional handling
- **FR-083**: System MUST use template strings for string manipulation
- **FR-084**: System MUST implement proper object and array destructuring
- **FR-085**: System MUST use arrow functions where appropriate
- **FR-086**: System MUST implement proper module bundling with dependency management

**Performance Requirements**
- **FR-087**: System MUST use compiled code for performance-critical operations (text processing, beat derivation)
- **FR-088**: System MUST implement proper module loading and initialization
- **FR-089**: System MUST use type-safe communication between components
- **FR-090**: System MUST implement efficient data transfer between components
- **FR-091**: System MUST handle errors properly with try/catch blocks
- **FR-092**: System MUST implement proper memory management for component lifecycle
- **FR-093**: System MUST use performance-critical operations for text processing and beat derivation
- **FR-094**: System MUST implement proper module caching for performance
- **FR-095**: System MUST handle browser compatibility for performance features
- **FR-096**: System MUST implement proper module cleanup on page unload

### Key Entities

- **Cell**: Core data structure representing one visible grapheme cluster with grapheme, lane, kind, position, rendering properties, and optional head marker for multi-character token boundaries
- **PitchedElement**: Musical note symbols supporting Number system (1-7, default) and Western system (cdefgab/CDEFGAB), with optional accidentals (##, bb) only, pitch_system attribute for tracking current system, ornaments, and octave display property (-4 to +4) applied only via selection commands
- **UnpitchedElement**: Non-pitched musical symbols (dashes, breath marks, barlines, spaces) that affect timing and structure
- **TextToken**: Unknown text on the main line that cannot be parsed as musical notation, rendered in red color as fallback elements, with multi-character support
- **Beat**: Implicit "words" of temporal columns separated by spaces, barlines, or other non-beat elements, derived at parse time, not stored explicitly
- **Tala**: Stave-level string of digits 0-9+ displayed above barlines for rhythmic notation (stored at stave level, positioned above barlines)
- **Lyrics**: Line-level text string displayed below the first pitched element of the line (stored at line level, positioned below first PitchedElement)
- **Slur**: Curved connection that can start/end on any element anywhere in the notation (temporal or non-temporal), can span beats and barlines, rendered as Bézier curves
- **Caret**: Visual cursor indicator showing current editing position, positioned at grapheme boundaries
- **Selection**: Highlighted range of Cells indicating user-selected content for editing operations
- **Line**: Container with ordered lanes using LaneKind enum { Upper, Letter, Lower } where each lane is a Vec<Cell> maintaining vertical alignment through shared column indices, plus line-level storage for tala (digits 0-9+), lyrics (text string), label (displayed at beginning of line), tonic (musical root note), and key_signature (sharps/flats affecting pitch interpretation). **Note**: The data model supports multiple lines, but POC implementation will display and edit only a single line at a time.
- **Label**: Line-level text string displayed at the beginning of the line for line identification or section labeling
- **Tonic**: Musical root note that can be set at composition level (File menu) or stave level (Stave menu), affecting how pitch systems are interpreted and rendered
- **KeySignature**: Musical key signature (sharps/flats) that can be set at composition level (File menu) or stave level (Stave menu), displayed at line beginnings and affecting pitch interpretation
- **Document**: Container for multiple lines with mixed text and musical notation content, plus composition-level title and tonic (rendered at top, centered). **Note**: The document model supports multiple lines for future extensibility, but POC implementation will focus on single-line editing and display.

## Success Criteria *(mandatory)*

### Measurable Outcomes

**Performance Metrics**
- **SC-001**: Users can enter musical notation in both Number and Western systems with beat rendering in under 2 seconds
- **SC-002**: Musical notation input appears with less than 50ms latency for typical entry speeds
- **SC-003**: Focus activation occurs within 10ms of user interaction (click, tab, or programmatic)
- **SC-004**: Arrow key navigation completes movement within 16ms (60fps)
- **SC-005**: System can handle single-line documents with up to 1,000 Cells without performance degradation
- **SC-006**: Beat derivation and rendering completes in under 10ms for typical single-line content

**Functional Metrics**
- **SC-007**: 95% of musical notation entered renders correctly with proper beat segmentation
- **SC-008**: Users can successfully apply ornaments to pitched elements with 100% visual accuracy
- **SC-009**: Octave dots display correctly with proper positioning above/below pitched elements 100% of the time
- **SC-010**: Slurs render correctly between elements with proper curve calculations 95% of the time
- **SC-011**: Pitch system conversion (Number to Western and vice versa) maintains musical accuracy 100% of the time
- **SC-012**: Unknown text on the main line renders as red text tokens with 100% accuracy and proper multi-character support
- **SC-013**: Text tokens display only when characters cannot be parsed as musical notation elements 100% of the time
- **SC-014**: Musical notation takes precedence over text token rendering for all characters on the main line 100% of the time
- **SC-015**: Focus activation makes cursor immediately responsive for typing 100% of the time
- **SC-016**: Visual highlighting accurately represents keyboard-selected ranges 100% of the time
- **SC-017**: Alt-S slur commands apply/remove slurs correctly on selections 100% of the time
- **SC-018**: Alt-u/m/l octave commands apply/remove octaves correctly on pitched elements in selections 100% of the time
- **SC-019**: Toggle commands (slur and octave) respond within 20ms of keyboard input
- **SC-020**: Mixed text and notation documents save and reload with 100% content preservation

**Usability Metrics**
- **SC-021**: New users can successfully create basic musical notation using the default Number system within 5 minutes of first use
- **SC-022**: 90% of common musical notation tasks (enter notes, navigate with arrow keys, select text with shift+arrows, add slurs via alt-S, apply octaves via alt-u/m/l, apply ornaments, switch pitch systems) complete on first attempt
- **SC-023**: System handles grapheme clusters (combining marks) correctly 100% of the time
- **SC-024**: Users can navigate and edit efficiently using only keyboard shortcuts
- **SC-025**: Users can apply slur and octave commands to selections using only keyboard shortcuts
- **SC-026**: Users can focus the editor and begin typing immediately without additional clicks
- **SC-027**: Focus returns to editor canvas within 50ms after menu operations
- **SC-028**: Focus returns to editor canvas within 50ms after tab switching
- **SC-029**: Document tab displays current Cell structure in real-time with <100ms latency
- **SC-030**: Console tabs update within 200ms of new errors or log entries

**Development Metrics**
- **SC-031**: Styling system loads and applies within 100ms of application startup
- **SC-032**: External JS/CSS files load successfully without embedding in HTML
- **SC-033**: Tab switching maintains application state without data loss

**Testing Coverage Metrics**
- **SC-034**: 100% of user stories have comprehensive E2E tests implemented
- **SC-035**: All E2E tests run successfully in headless Playwright mode
- **SC-036**: Test suite execution completes within 30 seconds for full coverage
- **SC-037**: Test coverage reports show >95% feature area coverage
- **SC-038**: All critical user flows have automated validation
- **SC-039**: Performance benchmarks are validated in automated tests
- **SC-040**: Focus management scenarios have 100% test coverage
- **SC-041**: UI component interactions have automated validation

**Code Quality Metrics**
- **SC-042**: Code passes linting with modern standards configuration
- **SC-043**: Type system provides complete type coverage for all modules
- **SC-044**: No memory leaks detected in modules during automated testing
- **SC-045**: Module compilation produces no warnings with optimal optimization settings
- **SC-046**: Bundle size optimized with dependency management eliminates unused code
- **SC-047**: All asynchronous operations use proper async/await with comprehensive error handling
- **SC-048**: Component interop validates type safety with generated types
- **SC-049**: Code maintains >90% maintainability index (complexity, duplication, coverage)
- **SC-050**: All modules follow consistent naming conventions and structure
- **SC-051**: No deprecated APIs or browser compatibility issues

## Assumptions

- The POC will implement single-line editing and display for simplified scope, though the data model will support multiple lines for future extensibility
- The POC will render all content at a fixed 16-point typeface for consistent display
- The POC will use monospace font rendering for predictable column positioning
- The POC will use a menu-based user interface design
- The POC will organize code with separate JavaScript and CSS files (not embedded in HTML)
- The POC will use modern language features with type safety
- The POC will implement performance-critical operations using compiled code with proper optimization
- The POC will run comprehensive E2E tests using headless Playwright for all features
- Number pitch system (1-7) is the default system, with Western as an alternative
- Musical notation follows both Number system conventions and Western notation
- Users have basic familiarity with music notation concepts
- Testing will be implemented using orchestration with comprehensive test coverage
- All tests will execute in headless mode without requiring visual inspection
- File operations will be limited to JSON format for document persistence
- Export features (MusicXML, LilyPond) are implemented as menu stubs only for POC scope - they will show the menu items but display "Not implemented in POC" messages
- Grapheme segmentation will use browser's built-in segmentation API where available
- Pitch system conversion maintains relative pitch relationships and octave information
- Focus management will automatically return to the editor canvas after UI interactions
