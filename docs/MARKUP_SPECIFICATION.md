# Notation Markup Language Specification

**Version:** 1.0 (Draft)
**Last Updated:** 2025-12-21

---

## Overview

The Notation Markup Language is a lightweight, XML-like format for representing musical notation in text form. It bridges the gap between human-readable musical input and the editor's internal representation, enabling:

- **Import/Export:** Share musical ideas as plain text
- **Version Control:** Track notation changes in git
- **Template Creation:** Build reusable musical patterns
- **Batch Processing:** Generate notation programmatically

### Design Philosophy

1. **Text-First:** Musical content is readable without special tools
2. **Minimal Syntax:** Only use tags where necessary for structure
3. **Inline Metadata:** Keep related information together (lyrics with their line)
4. **Whitespace-Tolerant:** Formatting for readability doesn't affect meaning
5. **Closed Vocabulary:** Fixed set of tags prevents parsing ambiguity

### Key Architectural Decision: Inline vs Directive

Unlike traditional markup systems that separate metadata into header directives, this system allows **inline tags** for line-specific metadata (`<lyrics>`, `<tala>`). This design choice reflects the musical reality that:

- Each line can have different lyrics
- Lyrics belong with their musical line, not in a separate block
- Multi-system compositions need per-line metadata

**Why this works without breaking rhythm parsing:**
1. Tags are extracted first
2. Tags are stripped from the notation text
3. Only the remaining characters affect rhythm/spacing calculation

Example:
```xml
| 1 2 3 4 | <lyrics>do re mi fa</lyrics>
```
Becomes `| 1 2 3 4 |` for rhythm parsing (8 characters = 8 subdivisions).

---

## Document Structure

### Basic Template

```xml
<title>Song Title</title>
<composer>Composer Name</composer>

<system>
| 1 2 3 4 | <lyrics>do re mi fa</lyrics>
| 5 6 7 1 | <lyrics>sol la ti do</lyrics>
</system>
```

### Document Hierarchy

```
Document
├── Metadata (title, composer)
└── Systems (one or more)
    └── Lines (notation + lyrics + tala)
```

**System:** A group of musical lines that appear together (like a "system" in traditional sheet music). Systems provide visual grouping and can represent:
- A verse and chorus
- Multiple instrumental parts
- Sections of a composition

---

## Scope and Application Rules

### Tag Scope Hierarchy

| Tag Type | Scope | Example |
|----------|-------|---------|
| Document tags | Entire document | `<title>`, `<composer>` |
| System tags | Current system | `<system>` (container) |
| Line tags | Current line | `<lyrics>`, `<tala>` |
| Modifier tags | Next character only | `<#/>`, `<up/>` |
| Span tags | Enclosed content | `<slur>`, `<sup>` |

### Application Rules

**Document Tags:**
- Apply to the entire composition
- Must appear before any `<system>` tags
- Only one of each type per document

**Line Tags (`<lyrics>`, `<tala>`):**
- Apply to the line they appear in
- Can appear anywhere within the line
- Multiple instances are concatenated with spaces
- Example: `<lyrics>do re</lyrics> ... <lyrics>mi fa</lyrics>` → `"do re mi fa"`

**Modifier Tags (`<#/>`, `<up/>`, etc.):**
- Apply to the immediately following character only
- Must precede the character they modify
- Example: `<#/>1` → sharp applied to "1"

**Span Tags (`<slur>`, `<sup>`):**
- Apply to all characters between opening and closing tags
- Can span multiple characters
- Example: `<slur>1 2 3</slur>` → slur applies to 1, 2, and 3

### Closed Vocabulary

This markup language uses a **fixed, closed vocabulary** of tags. Unknown tags are ignored during parsing but may cause warnings in strict mode.

**Why closed?** To prevent:
- Parsing ambiguity
- Accidental HTML/XML feature creep
- LLM hallucination of non-existent tags

**Adding new tags:** Requires specification revision and parser updates.

---

## Tag Reference

### Document-Level Tags

#### `<title>...</title>`
**Purpose:** Set the composition's title
**Placement:** Top of document
**Content:** Plain text
**Example:**
```xml
<title>Twinkle Twinkle Little Star</title>
```

---

#### `<composer>...</composer>`
**Purpose:** Set the composer/author name
**Placement:** Top of document (typically after title)
**Content:** Plain text
**Aliases:** `<com>` (short form)
**Example:**
```xml
<composer>Traditional</composer>
```

---

### Structural Tags

#### `<system>...</system>`
**Purpose:** Group related lines of music together
**Placement:** Document body (can have multiple)
**Content:** Notation lines with inline tags
**Example:**
```xml
<system>
| 1 2 3 4 | <lyrics>Twin-kle twin-kle</lyrics>
| 5 6 7 1 | <lyrics>lit-tle star</lyrics>
</system>
```

**Why Systems?** In traditional sheet music, a "system" is a group of staves that are played simultaneously or appear together on the page. This concept translates to our notation as a logical grouping mechanism.

**Auto-Closing Behavior:**
System tags automatically close when:
- A new `<system>` tag is encountered (implicit close of previous system)
- End of document is reached (implicit close)
- Explicit `</system>` tag is found (explicit close)

**Examples:**

Explicit closing (traditional):
```xml
<system>
| 1 2 3 4 |
</system>
<system>
| 5 6 7 1 |
</system>
```

Auto-closing with new system:
```xml
<system>
| 1 2 3 4 |
<system>
| 5 6 7 1 |
</system>
```
Both produce the same result: two separate systems.

Auto-closing at EOF:
```xml
<system>
| 1 2 3 4 |
```
System is automatically closed at end of document.

**Multi-line Systems:**
Lines within a single `<system>` block are grouped together with bracket markers:
```xml
<system>
| 1 2 3 4 |
| 5 6 7 1 |
| 2 3 4 5 |
</system>
```
Creates one system with three bracketed staves (like a piano grand staff or ensemble score).

---

#### `<system N/>` (Inline Style)
**Purpose:** Mark a line as starting an N-line system (explicit count, parallel to web UI)
**Placement:** Start of a line (self-closing tag)
**Attribute:** N = number of lines in system (1 or more)
**Type:** Self-closing tag

**Design Principle:** This syntax provides **parallel functionality** between markup language and web UI. Any feature available in one must be available in the other.

**Examples:**

Single-line system:
```xml
<system 1/>| 1 2 3 4 | <lyrics>Solo line</lyrics>
```
Equivalent to web UI: `«1` gutter indicator

Multi-line system:
```xml
<system 3/>| 1 2 3 4 | <lyrics>First line</lyrics>
| 5 6 7 1 | <lyrics>Second line</lyrics>
| 2 3 4 5 | <lyrics>Third line</lyrics>
```
Equivalent to web UI: `«3` on line 1, `├` on line 2, `└` on line 3

**Import Behavior:**
- Directly sets `system_start_count = N` on that line
- No counting or inferring needed - the number is explicit
- Subsequent N-1 lines are automatically included in the system

**Export Behavior:**
- Lines with `system_start_count` export as `<system N/>`
- More concise than block style
- Direct visual correspondence to web UI gutter indicators

**Visual Correspondence Table:**

| Markup (Block Style) | Markup (Inline Style) | Web UI Gutter | Meaning |
|----------------------|----------------------|---------------|---------|
| `<system>` (3 lines) | `<system 3/>` | `«3` on first line | Starts 3-line system |
| (inside system) | (next line) | `├` on middle line | Middle of system |
| (inside system) | (last line) | `└` on last line | End of system |
| (no tag) | (no tag) | `·` | Standalone line |

**Advantages of Inline Style:**
1. **More concise** - Single tag instead of opening/closing pair
2. **Explicit count** - No need to count lines or infer boundaries
3. **Web UI parallel** - Direct correspondence to `«N` gutter indicators
4. **Easier to edit** - Just change the number to adjust system size
5. **No ambiguity** - Count is stated, not inferred from structure

**Round-Trip Guarantee:**
Import markup → Edit in Web UI → Export markup preserves system grouping intent:
```xml
<!-- Import -->
<system 3/>| 1 2 3 4 |
| 5 6 7 1 |
| 2 3 4 5 |

<!-- User edits in web UI (clicks gutter to change «3 to «2) -->

<!-- Export -->
<system 2/>| 1 2 3 4 |
| 5 6 7 1 |
<system 1/>| 2 3 4 5 |
```

**Overlap Handling:**
If systems overlap (e.g., `<system 3/>` on line 0 and `<system 2/>` on line 2), the editor automatically truncates the first system:
```xml
<!-- Input (overlap) -->
<system 3/>| 1 2 3 4 |
| 5 6 7 1 |
<system 2/>| 2 3 4 5 |
| 6 7 1 2 |

<!-- After import (auto-truncated) -->
Line 0: system_start_count = 2 (truncated from 3)
Line 1: (in system)
Line 2: system_start_count = 2 (starts new system)
Line 3: (in system)
```

The truncated system will show a pulse animation in the web UI to notify the user.

**Comparison: Block vs. Inline**

Both syntaxes are supported for import:

**Block Style** (traditional XML):
```xml
<system>
| 1 2 3 4 |
| 5 6 7 1 |
| 2 3 4 5 |
</system>
```
- Counts 3 lines → sets first line's `system_start_count = 3`
- More verbose but familiar XML structure

**Inline Style** (web-UI parallel):
```xml
<system 3/>| 1 2 3 4 |
| 5 6 7 1 |
| 2 3 4 5 |
```
- Explicit count → sets `system_start_count = 3` directly
- More concise, easier to edit

**Export Preference:**
By default, the editor exports using inline style `<system N/>` because:
- More concise
- Direct parallel to web UI
- Explicit count (no inferring)
- Easier to edit programmatically

---

### Inline Tags (Within Systems)

#### `<lyrics>...</lyrics>`
**Purpose:** Attach lyrics syllables to a musical line
**Placement:** Anywhere within a line (can appear multiple times)
**Content:** Space-separated syllables with optional hyphens
**Aliases:** `<lyr>` (short form)

**Syllable Distribution:**
The editor automatically distributes syllables to notes using an intelligent algorithm:
- One syllable per note (default)
- Multiple notes share syllables during slurs (melismas)
- Hyphens indicate syllable continuation

**Examples:**

Simple word mapping:
```xml
| 1 2 3 4 | <lyrics>do re mi fa</lyrics>
```
Result: "do" → 1, "re" → 2, "mi" → 3, "fa" → 4

Hyphenated syllables:
```xml
| 1 2 3 4 | <lyrics>hel-lo wor-ld</lyrics>
```
Result: "hel-" → 1, "lo" → 2, "wor-" → 3, "ld" → 4

Multiple tags (concatenated):
```xml
1 2 <lyrics>do re</lyrics> 3 4 <lyrics>mi fa</lyrics>
```
Result: Equivalent to `<lyrics>do re mi fa</lyrics>`

---

#### `<tala>...</tala>`
**Purpose:** Attach rhythmic cycle markers (tala/sam) to a line
**Placement:** Anywhere within a line (can appear multiple times)
**Content:** Tala syllables or symbols
**Usage:** Similar to lyrics, distributed across notes

**Example:**
```xml
| 1 2 3 4 | <tala>S . . .</tala>
```

**Common Tala Notation:**
- `S` = Sam (downbeat/cycle start)
- `.` = Empty beat
- `X` = Accent/emphasis
- `O` = Khali (wave/empty section)

---

#### `<nl/>`
**Purpose:** Insert a line break within a system
**Placement:** Anywhere within `<system>` content
**Type:** Self-closing tag
**Use Case:** Compact formatting without physical newlines

**Example:**
```xml
<system>1 2 3 4<nl/>5 6 7 1</system>
```

Equivalent to:
```xml
<system>
1 2 3 4
5 6 7 1
</system>
```

---

### Notation Modifiers (Inline, Self-Closing)

These tags modify the immediately following note/character.

#### Octave Markers

| Tag | Meaning | Offset |
|-----|---------|--------|
| `<up/>` or `<uper/>` | Upper octave | +1 |
| `<up2/>` or `<hi/>` | Two octaves up | +2 |
| `<down/>` or `<low/>` | Lower octave | -1 |
| `<down2/>` or `<lowest/>` | Two octaves down | -2 |
| `<mid/>` | Middle octave (reset) | 0 |

**Example:**
```xml
1 <up/>1 <up2/>1   <!-- Three "1" notes at different octaves -->
```

---

#### Accidentals

| Tag | Symbol | Meaning |
|-----|--------|---------|
| `<#/>` | ♯ | Sharp (raise half-step) |
| `<b/>` | ♭ | Flat (lower half-step) |
| `<x/>` | 𝄪 | Double sharp (raise whole-step) |
| `<bb/>` | 𝄫 | Double flat (lower whole-step) |
| `<hb/>` | ♭̷ | Half-flat (quarter-tone lower) |
| `<n/>` | ♮ | Natural (cancel accidental) |

**Example:**
```xml
1 <#/>1 <b/>2   <!-- Note 1, sharp-1, flat-2 -->
```

---

#### Musical Expression

##### `<sup>...</sup>`
**Purpose:** Grace notes / superscript notation
**Content:** Notes to render as grace notes (smaller, rhythmically transparent)
**Example:**
```xml
<sup>12</sup>3   <!-- Grace notes 1,2 before main note 3 -->
```

---

##### `<slur>...</slur>`
**Purpose:** Mark notes to be played smoothly (legato), creates visual curve above
**Content:** Notes within the slur
**Example:**
```xml
<slur>1 2 3</slur> 4
```

**Visual Effect:** Notes 1, 2, 3 connected by a curved line above (overline in text representation)

---

## Notation Characters

The actual musical content uses single characters from the chosen pitch system.

### Two Input Formats

**1. Plaintext Notation (Human-Readable)**

For authoring by hand or generating with LLMs:

| System | Characters |
|--------|------------|
| Number | `1 2 3 4 5 6 7` |
| Western | `C D E F G A B` |
| Sargam | `S r R g G m M P d D n N` (lowercase = komal, uppercase = shuddha/tivra) |
| Doremi | `d r m f s l t` |

**2. NotationFont PUA Codepoints (Copy/Paste)**

The editor's Text tab exports notation using Unicode Private Use Area (PUA) glyphs. These codepoints can be directly pasted into markup:

```xml
<!-- Copied from Text tab (contains PUA glyphs) -->
<system>󠀀󠀁󠀂󠀃</system>
```

**Why support both?**
- **Plaintext:** Easy to type, read, edit, share, version control
- **PUA codepoints:** Perfect round-trip when copying from editor's Text tab

**Parser behavior (automatic mode detection):**

The parser automatically detects which format is used per line:

1. **Codepoint mode:** If line contains any NotationFont PUA character (U+E000-U+F8FF or U+F0000-U+FFFFD)
   - All PUA chars → use directly as cell codepoints
   - Spaces, `|`, `-`, `'` → preserved (structural)
   - Unknown chars (ASCII letters, emoji, etc.) → **ERROR** (strict mode preserves alignment)

2. **Token mode:** Otherwise (no PUA chars detected)
   - Parse as plaintext notation (`1 2 3`, `C D E`, etc.)
   - Unknown chars → silently skipped

**Rationale:** Strict errors in codepoint mode prevent silent corruption when copy/pasting from editor. Token mode is lenient for human typing flexibility.

### Special Characters

| Character | Meaning |
|-----------|---------|
| `-` | Dash (rhythmic extension or rest) |
| `'` | Breath mark (phrase separator) |
| `\|` | Barline (measure separator) |
| ` ` | Space (beat separator) |

---

## Rhythm and Spacing

### The Space = Beat Principle

**Fundamental Rule:** Horizontal space represents time.

```
1 2 3 4     <!-- Four beats, one note each -->
1---        <!-- One note lasting four beats -->
1 '---      <!-- Note (1 beat) + breath + rest (3 beats) -->
```

### Dashes for Duration

- Each character position = one subdivision
- Dashes extend the previous note
- Dashes after breath marks create rests

**Examples:**

```
1--2--   <!-- Note 1 (3 units), Note 2 (2 units) -->
1' --    <!-- Note 1, breath, then 2-unit rest -->
```

See `RHYTHM.md` for detailed rhythm notation rules.

---

## Complete Examples

### Example 1: Simple Song
```xml
<title>Mary Had a Little Lamb</title>
<composer>Traditional</composer>

<system>
| 3 2 1 2 | <lyrics>Ma-ry had a</lyrics>
| 3 3 3-- | <lyrics>lit-tle lamb</lyrics>
| 2 2 2-- | <lyrics>lit-tle lamb</lyrics>
| 3 5 5-- | <lyrics>lit-tle lamb</lyrics>
</system>
```

---

### Example 2: Multi-System Composition
```xml
<title>Practice Exercise</title>
<composer>Study Material</composer>

<system>
| 1 2 3 4 | <lyrics>Verse one be-gins</lyrics>
| 5 6 7 1 | <lyrics>climb-ing up high</lyrics>
</system>

<system>
| 7 6 5 4 | <lyrics>Cho-rus comes down</lyrics>
| 3 2 1-- | <lyrics>end-ing low</lyrics>
</system>
```

---

### Example 3: Complex Features
```xml
<title>Advanced Example</title>

<system>
<!-- Grace notes and slurs -->
<sup>12</sup>3 <slur>4 5 6</slur> 7 <lyrics>Gra-ce notes and le-ga-to</lyrics>

<!-- Octave changes and accidentals -->
1 <up/>1 <#/>2 <b/>3 <lyrics>Oct-aves and ac-ci-dent-als</lyrics>

<!-- Tala markers -->
| 1 2 3 4 | <tala>S . . .</tala> <lyrics>Rhythm cy-cle marks</lyrics>
</system>
```

---

### Example 4: Compact Format
```xml
<title>Compact Song</title>
<system>1 2 3 4<nl/><lyrics>do re mi fa</lyrics><nl/>5 6 7 1<nl/><lyrics>sol la ti do</lyrics></system>
```

---

## Parsing Rules

### Tag Processing Order

The parser processes markup in a specific order to ensure consistent results:

```
1. Document-level extraction
   ├─ Extract <title> content
   ├─ Extract <composer> content
   └─ Validate no duplicate document tags

2. System-level splitting
   ├─ Split on <system> boundaries
   └─ Each system is processed independently

3. Line-level processing (within each system)
   ├─ Expand <nl/> to actual newlines
   ├─ Split into individual lines
   └─ For each line:
       ├─ Extract all <lyrics> tags → concatenate → store in line.lyrics
       ├─ Extract all <tala> tags → concatenate → store in line.tala
       ├─ Strip ALL tags from line text
       └─ Parse remaining text as notation

4. Notation parsing (tags removed)
   ├─ Each character represents a musical element
   ├─ Spaces = beat boundaries
   ├─ Character count = subdivision count
   └─ Apply beat grouping and slurs
```

**Critical:** Tags are **completely removed** before rhythm/spacing calculation. This ensures:
- Tags don't affect column alignment
- Spacing has consistent rhythmic meaning
- Inline metadata doesn't corrupt timing

**Example:**
```xml
Input:  | 1 2 3 4 | <lyrics>do re mi fa</lyrics>
Step 1: Extract lyrics → "do re mi fa"
Step 2: Strip tags → | 1 2 3 4 |
Step 3: Parse rhythm → 8 characters = 8 subdivisions
Result: Line with 4 notes + lyrics metadata
```

### Whitespace Handling

- Leading/trailing whitespace ignored
- Multiple spaces collapse to single space
- Newlines within `<system>` create separate lines (unless using `<nl/>`)

### Tag Nesting

**Allowed:**
- `<slur>` and `<sup>` can contain notation characters
- Multiple `<lyrics>` tags in one line (concatenated)
- Multiple `<tala>` tags in one line (concatenated)

**Forbidden:**
- Nesting `<lyrics>` inside `<lyrics>`
- Nesting `<tala>` inside `<tala>`
- Document tags (`<title>`, `<composer>`) within `<system>`
- `<system>` tags nested inside other `<system>` tags

**Why these restrictions?**
- Prevents parsing ambiguity
- Keeps implementation simple
- Matches musical semantics (a line has one lyrics string, not nested lyrics)

---

## Use Cases

### 1. Quick Import
Copy-paste notation from email, chat, or documents directly into the editor.

### 2. Templating
Create reusable patterns:
```xml
<system>
| 1 2 3 4 | <lyrics>__ __ __ __</lyrics>
</system>
```

### 3. Version Control
Track notation changes in git:
```bash
git diff song.notation
```

### 4. Batch Processing
Generate variations programmatically:
```python
for key in keys:
    notation = f"<title>Scale in {key}</title>\n<system>1 2 3 4 5 6 7 1</system>"
```

### 5. Collaboration
Share musical ideas as plain text without requiring the editor.

---

## Grammar Summary (Informal)

```
document     := metadata* system+
metadata     := title | composer
title        := <title> text </title>
composer     := <composer> text </composer>
system       := <system> line+ </system>
line         := (notation | inline-tag | nl)*
inline-tag   := lyrics | tala | slur | sup
lyrics       := <lyrics> syllables </lyrics>
tala         := <tala> symbols </tala>
slur         := <slur> notation </slur>
sup          := <sup> notation </sup>
nl           := <nl/>
notation     := (note | modifier | special)+
modifier     := octave | accidental
octave       := <up/> | <down/> | <up2/> | <down2/> | <mid/>
accidental   := <#/> | <b/> | <x/> | <bb/> | <hb/> | <n/>
note         := pitch-char
special      := '-' | "'" | '|' | ' '
```

---

## Future Extensions

Potential additions being considered (not yet implemented):

### Document-Level Extensions
- `<tempo>120</tempo>` - Set tempo (BPM)
- `<key>C major</key>` - Key signature declaration
- `<time>4/4</time>` - Time signature
- `<tonic>C</tonic>` - Reference pitch for movable-do systems

### Line-Level Extensions
- `<dynamic>mf</dynamic>` - Volume/expression markings
- `<articulation>staccato</articulation>` - Note articulation
- `<chord>CEG</chord>` - Chord symbols above staff

### Structural Extensions
- `<part name="Violin">...</part>` - Multi-part scores
- `<repeat count="2">...</repeat>` - Repetition markers
- `<section name="Chorus">...</section>` - Named sections

### Directive-Style Tags (Alternative Design)
If inline tags prove problematic, could adopt directive style:
```xml
<@tempo 120>
<@key C major>

<system>
...notation...
</system>
```

**Decision criteria:** Add new tags only when:
1. Clear musical need (not just "nice to have")
2. Cannot be expressed in existing syntax
3. Community consensus on syntax
4. Implementation capacity exists

---

## Error Handling

### Malformed Tags
Unclosed or mismatched tags will result in parse errors:
```xml
<title>Missing closing tag    <!-- ERROR: Unclosed tag -->
<lyrics>Unclosed lyrics        <!-- ERROR: Unclosed tag -->
<title>First</title><title>Second</title>  <!-- ERROR: Duplicate document tag -->
```

**Error recovery:**
- Parser stops at first error
- Returns descriptive error message
- No partial import (all-or-nothing)

### Unknown Tags
Unknown tags are **ignored** during parsing (graceful degradation):
```xml
<unknown>This is ignored</unknown>
<future-feature>Also ignored</future-feature>
```

**Rationale:** Forward compatibility. Documents with newer tags can still be read by older parsers.

**Strict mode (future):** Could warn/error on unknown tags to catch typos.

### Invalid Characters

**Token mode (plaintext):** Non-musical characters are **silently skipped**:
```xml
1 2 @ 3   <!-- @ is ignored, parses as: 1 2 3 -->
```

**Valid characters:**
- Pitch characters (1-7, A-G, S-N, d-t depending on system)
- Special characters: `-`, `'`, `|`, space

**Codepoint mode (PUA glyphs):** Unknown characters cause **parse errors**:
```xml
<system>text</system>  <!-- ERROR: Invalid char 't' in codepoint mode -->
```

**Rationale:**
- Token mode: Lenient for human typing (typos don't break import)
- Codepoint mode: Strict to preserve alignment (critical for copy/paste round-trip)

### Escaping

**Current behavior:** No escaping needed (tags are stripped before text processing)

**Future consideration:** If literal `<` is needed in lyrics/tala:
```xml
<lyrics>less \< than</lyrics>  <!-- Backslash escaping -->
```

---

## Implementation Notes

### Pitch System Selection
The pitch system (Number, Western, Sargam, Doremi) is selected when importing:
- Via UI dropdown in the editor
- Specified in function calls: `importNotationMarkup(pitchSystem, markup)`

### Lyrics Distribution Algorithm
Uses a finite state machine (FSM) to intelligently assign syllables:
- One syllable per note (default)
- Multiple notes share one syllable during slurs (melismas)
- Respects hyphenation for multi-syllable words

See `src/renderers/lyrics.rs` for implementation details.

### Overlay Positioning
Lyrics and tala markers are positioned using the MirrorDivService:
- Character-level precision
- Automatically syncs with horizontal scrolling
- Renders above (tala) and below (lyrics) the notation line

---

## Comparison to Other Formats

### vs. MusicXML
- **MusicXML:** Comprehensive, verbose, machine-optimized
- **Notation Markup:** Minimal, human-readable, text-optimized

### vs. ABC Notation
- **ABC:** Established standard with complex rhythm syntax
- **Notation Markup:** Simpler, space-based rhythm, inline metadata

### vs. LilyPond
- **LilyPond:** Turing-complete language, publication-quality output
- **Notation Markup:** Import-focused, editor-native representation

---

## License and Attribution

This specification is part of the Music Notation Editor project.

---

## Design Rationale: Why Not Directive-Only?

Some markup languages separate all metadata into header directives:

```
<title: My Song>
<notation: sargam>

S r g m | P d n S' |
```

**Why we chose inline tags for lyrics/tala:**

1. **Musical reality:** Each line can have different lyrics. Separating them requires complex line-matching logic.

2. **Readability:** Lyrics next to their notes is more intuitive:
   ```xml
   | 1 2 3 4 | <lyrics>do re mi fa</lyrics>  <!-- Clear association -->
   ```
   vs.
   ```xml
   <lyrics-line-1: do re mi fa>
   <lyrics-line-2: sol la ti do>

   | 1 2 3 4 |
   | 5 6 7 1 |  <!-- Which lyrics go with which line? -->
   ```

3. **Multi-system support:** Different systems can have independent lyrics without complex indexing.

4. **No rhythm corruption:** Tags are stripped before parsing, so they don't affect spacing/timing.

**Trade-off accepted:** Slightly more complex parsing logic in exchange for better usability and clearer musical semantics.

---

## Appendix: Quick Reference Card

```
DOCUMENT TAGS
  <title>...</title>          Song title
  <composer>...</composer>     Composer name
  <system>...</system>         Musical system (group of lines)

INLINE TAGS
  <lyrics>...</lyrics>         Lyrics syllables
  <tala>...</tala>             Rhythmic cycle markers
  <sup>...</sup>               Grace notes
  <slur>...</slur>             Legato phrasing
  <nl/>                        Line break

MODIFIERS (before note)
  <up/> <down/>                Octave ±1
  <up2/> <down2/>              Octave ±2
  <#/> <b/>                    Sharp / Flat
  <x/> <bb/>                   Double sharp / Double flat
  <n/>                         Natural

NOTATION
  1234567                      Number system
  CDEFGAB                      Western system
  SrRgGmMPdDnN                 Sargam system
  drmfslt                      Doremi system
  - (dash)                     Duration / Rest
  ' (apostrophe)               Breath mark
  | (pipe)                     Barline
  (space)                      Beat separator
```

---

**End of Specification**
