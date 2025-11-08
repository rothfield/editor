# Pitch System Architecture Analysis

## Executive Summary

The editor implements a **universal pitch system architecture** that supports multiple notation systems through a unified `PitchCode` enum. This design enables seamless switching between different pitch representations (Number, Western, Sargam, Bhatkhande, Tabla) while maintaining a single internal representation.

### Key Design Principle
**All pitch systems map to the same 35-element `PitchCode` enum** (7 natural notes + 7 sharps + 7 flats + 7 double sharps + 7 double flats), regardless of how they're displayed to the user.

---

## 1. Core Architecture

### 1.1 PitchCode Enum (Universal Representation)

**Location**: `/home/john/editor/src/models/pitch_code.rs`

Defines 35 pitch variants representing all chromatic pitches with accidentals:

```rust
pub enum PitchCode {
    // Naturals (7)
    N1, N2, N3, N4, N5, N6, N7,
    
    // Sharps (7)
    N1s, N2s, N3s, N4s, N5s, N6s, N7s,
    
    // Flats (7)
    N1b, N2b, N3b, N4b, N5b, N6b, N7b,
    
    // Double sharps (7)
    N1ss, N2ss, N3ss, N4ss, N5ss, N6ss, N7ss,
    
    // Double flats (7)
    N1bb, N2bb, N3bb, N4bb, N5bb, N6bb, N7bb,
}
```

**Key Methods**:
- `degree()` - Extract the 1-7 degree independent of accidentals
- `to_natural()` - Get the natural form (remove accidentals)
- `accidental_type()` - Get the accidental (Sharp, Flat, DoubleSharp, DoubleFlat, None)
- `to_string(pitch_system)` - Convert to notation-specific string
- `from_string(input, pitch_system)` - Parse from notation-specific string

### 1.2 PitchSystem Enum (Notation System Selector)

**Location**: `/home/john/editor/src/models/elements.rs` (lines 223-241)

```rust
pub enum PitchSystem {
    Unknown = 0,
    Number = 1,      // 1-7 with #/b
    Western = 2,     // c-b with #/b
    Sargam = 3,      // S R G M P D N (Indian classical)
    Bhatkhande = 4,  // S R G M P D N (Indian formal notation)
    Tabla = 5,       // Percussion bols (dha, dhin, na, tin, etc.)
}
```

**Metadata Methods**:
- `supports_accidentals()` - Number and Western only
- `is_case_sensitive()` - Western, Sargam, Bhatkhande
- `pitch_sequence()` - Get base pitch characters for the system

---

## 2. Pitch System Implementations

### 2.1 Number System (Default)

**Location**: `/home/john/editor/src/models/pitch_systems/number.rs`

- **Notation**: `1`, `2`, `3`, `4`, `5`, `6`, `7`
- **Accidentals**: `#` (sharp), `b` (flat)
- **Examples**: `1`, `4#`, `7b`, `3##`, `5bb`
- **Solfege**: do, re, mi, fa, sol, la, ti
- **Case-sensitive**: No
- **Parser**: Longest-match strategy
  - Tries `1##` before `1#` before `1`

### 2.2 Western System

**Location**: `/home/john/editor/src/models/pitch_systems/western.rs`

- **Notation**: `c`, `d`, `e`, `f`, `g`, `a`, `b` (lowercase)
- **Accidentals**: `#` (sharp), `b` (flat)
- **Examples**: `c`, `f#`, `eb`, `d##`, `abb`
- **Solfege**: do, re, mi, fa, sol, la, ti
- **Case-sensitive**: No (accepts uppercase, converts to lowercase)
- **Parser**: Longest-match strategy
  - Tries `c##` before `c#` before `c`

### 2.3 Sargam System (Indian Classical)

**Location**: `/home/john/editor/src/models/pitch_systems/sargam.rs`

- **Base Notation**: 
  - Uppercase = Shuddha (natural): `S`, `R`, `G`, `M`, `P`, `D`, `N`
  - Lowercase = Komal (flat): `r`, `g`, `d`, `n`
  - Special uppercase = Tivra (sharp): `M` = tivra Ma (4#)
  
- **Accidentals**: `#` (sharp), `b` (flat) for explicit accidentals
- **Mapping to PitchCode**:
  - `S` → N1, `r` → N2b, `R` → N2, `g` → N3b, `G` → N3
  - `m` → N4, `M` → N4s, `P` → N5, `d` → N6b, `D` → N6, `n` → N7b, `N` → N7

- **Examples**: 
  - `S` (Sa), `r` (komal Re), `M` (tivra Ma), `G#`, `mb` (komal Ma)

- **Case-sensitive**: YES - crucial for notation (uppercase vs lowercase carry meaning)
- **Parser**: Longest-match strategy with explicit handling of case variants

### 2.4 Bhatkhande System

**Location**: `/home/john/editor/src/models/pitch_systems/bhatkhande.rs`

- **Status**: Identical to Sargam for notation purposes
- **Use Case**: Formal Indian classical music notation standard
- **Implementation**: Shares same parser logic as Sargam

### 2.5 Tabla System (Percussion)

**Location**: `/home/john/editor/src/models/pitch_systems/tabla.rs`

- **Notation**: Multi-character bols (strokes)
- **Examples**: 
  - 4-char: `dhin`, `dhir`, `tita`, `gadi`
  - 3-char: `dha`, `tin`, `tun`, `kat`, `tit`, `tet`, `dhet`, `gana`, `dina`
  - 2-char: `na`, `ta`, `te`, `ge`, `ka`, `ke`, `ti`, `tu`, `ra`, `re`, `ne`, `di`, `ga`

- **Purpose**: Notation, not melodic pitch
- **Parser**: Longest-match strategy (tries `dhin` before `dha` before `dh`)
- **Mapping**: Arbitrary mapping to PitchCode for system compatibility

---

## 3. Conversion Flow

### 3.1 String → PitchCode (Parsing)

```
User Input (any system)
    ↓
PitchCode::from_string(input, pitch_system)
    ↓
Match pitch_system and delegate to system parser:
    - NumberSystem::parse_pitch()
    - WesternSystem::parse_pitch()
    - SargamSystem::parse_pitch()
    - BhatkhandeSystem::parse_pitch()
    - TablaSystem::parse_pitch()
    ↓
Returns Option<(PitchCode, bytes_consumed)>
    ↓
Stored as PitchCode in document model
```

**Longest-Match Strategy**:
- Parsers try patterns in order of length (longest first)
- Example: For input `1##abc`, parse_pitch tries:
  1. `1##` (3 chars) → Success, returns (N1ss, 3)
  2. Never tries `1#` (2 chars) because longest match already found

### 3.2 PitchCode → String (Display)

```
Internal PitchCode (e.g., N4s)
    ↓
PitchCode::to_string(pitch_system)
    ↓
Match pitch_system and convert:
    - Number: "4#"
    - Western: "f#"
    - Sargam: "M"
    - Bhatkhande: "M"
    - Tabla: (arbitrary, not used for display)
    ↓
Returns String in target notation
```

### 3.3 System → System Conversion

```
Number "4#" ↔ Western "f#" ↔ Sargam "M"
    ↓
All convert through PitchCode::N4s
    ↓
Mapping:
    Number: 4 → degree 4
    Western: f → degree 4
    Sargam: M → degree 4
    ↓
All represent the same pitch (F#)
```

---

## 4. The Doremi System (Not Yet Implemented)

### 4.1 What is Doremi?

Doremi is a 7-note pitch system similar to solfege but with specific naming:
- **Do, Re, Mi, Fa, Sol, La, Ti** (Italian/Latin origin)
- **Variants**: 
  - movable-do system (common in music education)
  - fixed-do system (C=do, D=re, etc.)

### 4.2 Key Difference from Current Systems

**Current Sargam**: Uses uppercase/lowercase to denote variations
- `S` = Sa, `M` = Tivra Ma (sharp Ma), `m` = Shuddha Ma

**Potential Doremi**: Would use syllables with explicit accidentals
- `do`, `re`, `mi`, `fa`, `sol`, `la`, `ti`
- `do#`, `re#`, etc. (explicit accidentals)
- Or: `do`, `dob`, `dod` (variants with `b`=flat, `d`=double, etc.)

### 4.3 Implementation Path for Doremi

To add Doremi to the system:

1. **Add to PitchSystem enum** (elements.rs):
   ```rust
   pub enum PitchSystem {
       // ... existing ...
       Doremi = 6,  // New system
   }
   ```

2. **Create pitch system implementation** (src/models/pitch_systems/doremi.rs):
   ```rust
   pub struct DoremiSystem;
   
   impl DoremiSystem {
       pub fn pitch_sequence() -> Vec<&'static str> {
           vec!["do", "re", "mi", "fa", "sol", "la", "ti"]
       }
   }
   
   impl PitchParser for DoremiSystem {
       fn parse_pitch(input: &str) -> Option<(PitchCode, usize)> {
           // Implement doremi-specific parsing
           // Handle "do#", "re", "fa#", etc.
       }
   }
   ```

3. **Add conversion methods** to PitchCode:
   ```rust
   fn to_doremi_string(&self) -> String {
       match self {
           PitchCode::N1 => "do",
           PitchCode::N2 => "re",
           PitchCode::N3 => "mi",
           PitchCode::N4 => "fa",
           PitchCode::N5 => "sol",
           PitchCode::N6 => "la",
           PitchCode::N7 => "ti",
           // handle accidentals...
       }
   }
   
   fn from_doremi(input: &str) -> Option<Self> {
       // Parse doremi notation back to PitchCode
   }
   ```

4. **Update PitchSystemDispatcher** (parse/pitch_system.rs):
   ```rust
   pub struct DoremiPitchSystem;
   
   impl PitchSystemHandler for DoremiPitchSystem {
       fn lookup(&self, symbol: &str) -> bool {
           matches!(symbol,
               "do" | "re" | "mi" | "fa" | "sol" | "la" | "ti" |
               "do#" | "re#" | ... // accidentals
           )
       }
       // ...
   }
   ```

5. **Register in mod.rs**:
   ```rust
   pub mod doremi;
   pub use doremi::*;
   ```

6. **Update match statements** throughout the codebase where PitchSystem is matched

---

## 5. Current Data Flow in Grammar

**Location**: `/home/john/editor/src/parse/grammar.rs`

```rust
pub fn parse(s: &str, pitch_system: PitchSystem, column: usize) -> Cell {
    // Try parsing in order of specificity
    
    // 1. Try barlines (highest priority)
    if let Some(cell) = parse_barline(s, column) { return cell; }
    
    // 2. Try notes (pitch parsing)
    if let Some(cell) = parse_note(s, pitch_system, column) { return cell; }
        // Calls PitchCode::from_string(s, pitch_system)
        // Delegates to system-specific parser
    
    // 3. Try unpitched (rests/extensions)
    if let Some(cell) = parse_unpitched(s, column) { return cell; }
    
    // 4. Try text/other
    parse_text(s, column)
}

fn parse_note(s: &str, pitch_system: PitchSystem, column: usize) -> Option<Cell> {
    // Parse pitch code from string using the specified system
    let pitch_code = PitchCode::from_string(s, pitch_system)?;
    Some(Cell::Note(pitch_code))
}
```

---

## 6. File Structure Summary

```
src/models/
├── pitch_code.rs           # Universal 35-element PitchCode enum
├── pitch.rs                # Pitch with octave info
├── elements.rs             # PitchSystem enum (lines 223-241)
└── pitch_systems/
    ├── mod.rs              # PitchParser trait, dispatcher
    ├── number.rs           # 1-7 implementation
    ├── western.rs          # c-b implementation
    ├── sargam.rs           # S R G M P D N (Indian classical)
    ├── bhatkhande.rs       # Formal Indian notation
    └── tabla.rs            # Percussion bols

src/parse/
├── pitch_system.rs         # PitchSystemDispatcher, handlers
├── tokens.rs               # Token recognition
└── grammar.rs              # Parsing logic using PitchCode::from_string()
```

---

## 7. Extensibility

### 7.1 Adding a New Pitch System (Checklist)

1. **Define enum variant** in `PitchSystem` (elements.rs)
2. **Create parser module** (pitch_systems/newsystem.rs)
3. **Implement PitchParser trait** with `parse_pitch(input) -> Option<(PitchCode, usize)>`
4. **Add conversion methods** to PitchCode (`to_newsystem_string()`, `from_newsystem()`)
5. **Create PitchSystemHandler** (parse/pitch_system.rs) for lexer support
6. **Update match statements** in:
   - `PitchCode::to_string()`
   - `PitchCode::from_string()`
   - `PitchSystem::pitch_sequence()`
   - `PitchSystemDispatcher::get_handler()`

### 7.2 For Doremi Specifically

The hardest part will be deciding the notation:

**Option A: Syllables with explicit accidentals** (Recommended)
- `do`, `do#`, `do##`, `dob`, `dobb`
- `re`, `re#`, `re#`, `reb`, `rebb`
- etc.
- Pro: Consistent, minimal special cases
- Con: Longer notation

**Option B: Mixed notation (like Sargam)**
- `do` (natural), `do#` (sharp)
- Or: `d`, `d#`, `D` (uppercase variant for something)
- Pro: Shorter notation
- Con: Needs clear mapping convention

**Option C: Full syllables with variants**
- `do`, `dod` (do-diesis/sharp), `dob` (do-bemol/flat)
- `fa`, `fas` (fa-sharp), `fab` (fa-flat)
- Pro: Musicological consistency
- Con: Non-standard character sequences

The current Sargam system uses **Option B** (mixed case for meaning), which maps well to a pitch system that uses both case and punctuation for notation variants.

---

## 8. Testing Pattern

All pitch system modules include tests following this pattern:

```rust
#[test]
fn test_system_longest_match() {
    assert_eq!(SystemName::parse_pitch("1##"), Some((PitchCode::N1ss, 3)));
    assert_eq!(SystemName::parse_pitch("1##xyz"), Some((PitchCode::N1ss, 3)));
    // Verify longest match works
}

#[test]
fn test_roundtrip_conversion() {
    let pitch = PitchCode::N4s;
    let str_repr = pitch.to_string(PitchSystem::NewSystem);
    let parsed = PitchCode::from_string(&str_repr, PitchSystem::NewSystem);
    assert_eq!(Some(pitch), parsed);
}
```

---

## 9. Key Insights for Doremi

1. **Integration is straightforward** - Add enum variant, create parser, add conversion methods
2. **Longest-match parsing** is critical for multi-character notations like "dbin" vs "db"
3. **Decide on accidental notation** before implementing parser
4. **Case sensitivity** should be decided early (Sargam is case-sensitive, Doremi could be)
5. **All conversions flow through PitchCode** - never direct system-to-system conversion
6. **Roundtrip testing** is essential (to_string → from_string should yield same PitchCode)

---

## 10. Doremi Recommended Implementation

Based on the pattern in the codebase:

```
Display: "do", "dod#", "dob", "sol#", etc.

Mapping to PitchCode:
- do → N1
- dod# → N2 (do-diesis, which is degree 2 in doremi)
- dob → N7b (do-bemol, which is degree 7 flattened)
- re → N2
- mi → N3
- fa → N4
- sol → N5
- la → N6
- ti → N7
- With accidentals: sol#, labb, etc.

Or simpler (like Western):
- do → N1, re → N2, mi → N3, fa → N4, sol → N5, la → N6, ti → N7
- do# → N1s, dob → N1b, etc. (explicit accidentals)
```

The **explicit accidental** approach (Option A) aligns best with how Number and Western systems work, making it the easiest to implement and most consistent with the codebase.

---

