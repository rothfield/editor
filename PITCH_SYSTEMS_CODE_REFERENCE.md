# Pitch Systems Code Reference

Complete reference to all source files related to pitch systems, with line numbers and key locations.

## Universal Pitch Code (The Hub)

**File**: `/home/john/editor/src/models/pitch_code.rs` (572 lines)

| Component | Lines | Purpose |
|-----------|-------|---------|
| AccidentalType enum | 6-13 | Sharp, Flat, DoubleSharp, DoubleFlat, None |
| PitchCode enum | 15-61 | 35 variants (N1-N7, sharps, flats, double) |
| degree() method | 63-75 | Extract 1-7 regardless of accidental |
| to_natural() method | 77-89 | Get natural form (remove accidentals) |
| accidental_type() method | 91-113 | Get the accidental (Sharp, Flat, etc.) |
| to_string() dispatcher | 119-128 | Route to system-specific to_*_string() |
| to_number_string() | 131-174 | "1", "4#", "7b", "3##", "5bb" |
| to_sargam_string() | 177-220 | "S", "M", "r", "G#", "mb" |
| to_western_string() | 223-266 | "c", "f#", "eb", "d##", "abb" |
| from_sargam() | 271-315 | Parse sargam notation |
| from_string() dispatcher | 318-327 | Route to system-specific from_*() |
| from_number() | 330-355 | Parse "1", "4#", "7b", etc. |
| from_western() | 358-383 | Parse "c", "f#", "eb", etc. |
| Tests | 386-571 | 20+ test functions covering all systems |

## Pitch System Enum Selector

**File**: `/home/john/editor/src/models/elements.rs` (Lines 223-341)

| Component | Lines | Purpose |
|-----------|-------|---------|
| PitchSystem enum | 223-241 | Selector for Number, Western, Sargam, Bhatkhande, Tabla |
| supports_accidentals() | 249-252 | True only for Number and Western |
| is_case_sensitive() | 254-257 | True for Western, Sargam, Bhatkhande |
| pitch_sequence() | 259-269 | Return ["1"..."7"], ["c"..."b"], etc. |
| name() | 271-281 | Return human-readable name |
| snake_case_name() | 283-293 | Return for JSON serialization |
| css_class() | 295-305 | Return CSS class for styling |
| validate_pitch() | 307-330 | Check if pitch valid for system |
| Default impl | 332-336 | Default is PitchSystem::Number |

## Individual Pitch System Implementations

### Number System
**File**: `/home/john/editor/src/models/pitch_systems/number.rs` (110 lines)

| Component | Lines | Purpose |
|-----------|-------|---------|
| NumberSystem struct | 11 | Marker struct |
| pitch_sequence() | 14-17 | ["1", "2", "3", "4", "5", "6", "7"] |
| validate_pitch() | 19-23 | Check if string matches 1-7 pattern |
| get_solfege() | 25-37 | Return do, re, mi, fa, sol, la, ti |
| to_western() | 39-53 | Convert to c-b notation |
| from_western() | 55-68 | Reverse conversion |
| PitchParser impl | 71-109 | parse_pitch() with longest-match |
| parse_pitch() | 72-109 | Try ##, #, b, bb, then natural |

### Western System
**File**: `/home/john/editor/src/models/pitch_systems/western.rs` (97 lines)

| Component | Lines | Purpose |
|-----------|-------|---------|
| WesternSystem struct | 11 | Marker struct |
| pitch_sequence() | 14-17 | ["c", "d", "e", "f", "g", "a", "b"] |
| validate_pitch() | 19-23 | Check if string matches c-b pattern |
| to_number() | 25-40 | Convert to 1-7 notation |
| get_solfege() | 42-55 | Return do, re, mi, fa, sol, la, ti |
| PitchParser impl | 58-97 | parse_pitch() with longest-match |
| parse_pitch() | 59-96 | Try ##, #, b, bb patterns |

### Sargam System (Indian Classical)
**File**: `/home/john/editor/src/models/pitch_systems/sargam.rs` (110 lines)

| Component | Lines | Purpose |
|-----------|-------|---------|
| SargamSystem struct | 10 | Marker struct |
| pitch_sequence() | 13-16 | ["S", "R", "G", "M", "P", "D", "N"] |
| validate_pitch() | 18-21 | Check if valid sargam pitch |
| get_svar_name() | 23-35 | Shadja, Rishabha, Gandhara, etc. |
| to_number() | 37-50 | Convert to 1-7 notation |
| PitchParser impl | 52-110 | parse_pitch() **CASE-SENSITIVE** |
| parse_pitch() | 53-109 | Handles S/s, R/r, G/g, m/M, P/p, D/d, N/n |
| Comments | 59 | "Case-sensitive (uppercase = shuddha, lowercase = komal)" |

### Bhatkhande System (Formal Indian)
**File**: `/home/john/editor/src/models/pitch_systems/bhatkhande.rs` (68 lines)

| Component | Lines | Purpose |
|-----------|-------|---------|
| BhatkhandeSystem struct | 8 | Marker struct |
| pitch_sequence() | 10-13 | ["S", "R", "G", "M", "P", "D", "N"] |
| PitchParser impl | 16-67 | parse_pitch() (identical to Sargam) |
| parse_pitch() | 17-67 | Same case-sensitive handling as Sargam |
| Comments | 22 | "Bhatkhande uses the same notation as Sargam" |

### Tabla System (Percussion)
**File**: `/home/john/editor/src/models/pitch_systems/tabla.rs` (109 lines)

| Component | Lines | Purpose |
|-----------|-------|---------|
| TablaSystem struct | 10 | Marker struct |
| all_bols() | 12-23 | All valid tabla bols, sorted longest first |
| pitch_sequence() | 25-28 | Subset: ["dha", "dhin", "na", "tin", "ta", "ke", "te"] |
| is_valid_bol() | 30-33 | Check if bol in all_bols() |
| match_bol_at() | 35-54 | Find bol at position (lookahead parsing) |
| PitchParser impl | 57-108 | parse_pitch() with arbitrary PitchCode mapping |
| parse_pitch() | 58-108 | Maps bols to N1-N7 for compatibility |
| Comments | 63-66 | "Tabla is percussion, mapping to pitch codes is arbitrary" |

## Pitch System Trait & Dispatcher

**File**: `/home/john/editor/src/models/pitch_systems/mod.rs`

| Component | Purpose |
|-----------|---------|
| PitchParser trait | Define parse_pitch(input) -> Option<(PitchCode, usize)> |
| PitchSystemHandler trait | (in parse/pitch_system.rs) |
| Tests | 45-193 lines covering all systems, longest-match behavior |

## Lexer/Parser Support

**File**: `/home/john/editor/src/parse/pitch_system.rs`

| Component | Purpose |
|-----------|---------|
| PitchSystemHandler trait | lookup(), get_valid_chars(), get_pitch_chars() |
| NumberPitchSystem impl | Handler for Number system |
| WesternPitchSystem impl | Handler for Western system |
| SargamPitchSystem impl | Handler for Sargam system |
| PitchSystemDispatcher | Routes to appropriate handler |
| get_handler() | Match PitchSystem -> handler |
| lookup() | Check if symbol valid in system |
| is_pitch_char() | Distinguish pitch from accidental |

## Grammar/Parsing

**File**: `/home/john/editor/src/parse/grammar.rs`

| Function | Purpose | Pitch System Support |
|----------|---------|----------------------|
| parse() | Main entry point | Takes PitchSystem parameter |
| parse_note() | Parse notes | Calls PitchCode::from_string() |
| parse_barline() | Parse barlines | N/A |
| parse_unpitched() | Parse rests | N/A |
| parse_text() | Fallback text | N/A |

Key line (line 18):
```rust
pub fn parse(s: &str, pitch_system: PitchSystem, column: usize) -> Cell
```

Key line (line 98):
```rust
let pitch_code = PitchCode::from_string(s, pitch_system)?;
```

## Test Locations

### Unit Tests in Pitch Code File
**File**: `src/models/pitch_code.rs` (lines 386-571)

Tests include:
- test_all_35_pitch_codes_defined()
- test_sargam_natural_notes()
- test_sargam_komal_variants()
- test_sargam_tivra_ma()
- test_case_sensitive_mapping()
- test_from_string_sargam()
- test_sargam_roundtrip_conversion()
- test_all_three_notation_systems()
- test_double_accidentals_sargam()

### System-Specific Tests
Each pitch system file (number.rs, western.rs, sargam.rs, etc.) includes tests:

- test_*_system_longest_match()
- test_*_system_with_trailing_text()
- test_pitch_code_*() - serialization, deserialization, copy/clone
- test_*_roundtrip()

Example from sargam.rs:
```rust
#[test]
fn test_sargam_system_longest_match() {
    assert_eq!(SargamSystem::parse_pitch("S##"), Some((PitchCode::N1ss, 3)));
    assert_eq!(SargamSystem::parse_pitch("S##xyz"), Some((PitchCode::N1ss, 3)));
}
```

## Key Code Patterns

### Pattern 1: Adding Conversion Method
```rust
// In pitch_code.rs, to_*_string() method
fn to_doremi_string(&self) -> String {
    match self {
        PitchCode::N1 => "do",
        PitchCode::N2 => "re",
        // ... 33 more matches
    }.to_string()
}
```

### Pattern 2: Creating Parser
```rust
// In pitch_systems/*.rs
impl PitchParser for SystemName {
    fn parse_pitch(input: &str) -> Option<(PitchCode, usize)> {
        let patterns = [
            // Longest patterns first
            ("pattern##", PitchCode::N1ss),
            ("pattern#", PitchCode::N1s),
            ("pattern", PitchCode::N1),
        ];
        for (pattern, pitch_code) in &patterns {
            if input.starts_with(pattern) {
                return Some((*pitch_code, pattern.len()));
            }
        }
        None
    }
}
```

### Pattern 3: Dispatcher in pitch_code.rs
```rust
pub fn from_string(input: &str, pitch_system: PitchSystem) -> Option<Self> {
    match pitch_system {
        PitchSystem::Number => Self::from_number(input),
        PitchSystem::Western => Self::from_western(input),
        PitchSystem::Sargam => Self::from_sargam(input),
        // Add: PitchSystem::Doremi => Self::from_doremi(input),
        _ => None,
    }
}
```

## Critical Match Statements

All of these need to be updated when adding a new system:

1. **PitchCode::to_string()** (pitch_code.rs:119)
2. **PitchCode::from_string()** (pitch_code.rs:318)
3. **PitchSystem::supports_accidentals()** (elements.rs:249)
4. **PitchSystem::is_case_sensitive()** (elements.rs:254)
5. **PitchSystem::pitch_sequence()** (elements.rs:259)
6. **PitchSystem::name()** (elements.rs:271)
7. **PitchSystem::snake_case_name()** (elements.rs:283)
8. **PitchSystem::css_class()** (elements.rs:295)
9. **PitchSystemDispatcher::get_handler()** (parse/pitch_system.rs)

Total: **9 match statements** to update when adding new system.

## File Size Reference

| File | Size | LOC |
|------|------|-----|
| pitch_code.rs | 14K | 572 |
| pitch.rs | 7K | 283 |
| number.rs | 4K | 110 |
| western.rs | 3K | 97 |
| sargam.rs | 4K | 110 |
| bhatkhande.rs | 2K | 68 |
| tabla.rs | 4K | 109 |
| pitch_system.rs (parse) | 5K | 149 |
| grammar.rs | 8K | 253 |

**Total**: ~51K of code, ~1,751 lines

---

## Next Steps

To navigate the code:

1. **Start with**: `src/models/pitch_code.rs` - Understand PitchCode enum
2. **Then read**: `src/models/pitch_systems/number.rs` - Simplest system
3. **Then read**: `src/models/pitch_systems/sargam.rs` - Complex system with cases
4. **Then read**: `src/parse/grammar.rs` - How parsing works
5. **Then update**: Use this reference when adding new systems

---

**Generated**: November 7, 2025
