# Quick Implementation Guide: Adding a New Pitch System

This guide walks through the exact steps needed to add a new pitch system (like Doremi) to the editor.

## Prerequisite Decision: Notation Style

Before implementing, decide how your pitch system represents notes:

### Option A: Simple Base + Explicit Accidentals (Recommended)
```
Base notes:      do, re, mi, fa, sol, la, ti
With accidentals: do#, dob, do##, dobb, etc.
Parser handles:  "do", "do#", "do##", "dob", "dobb" as separate tokens
```
**Best for**: Systems similar to Number (1-7 #/b) or Western (c-b #/b)

### Option B: Case-Sensitive Variants (Like Sargam)
```
Base notes:      do, re, mi, fa, sol, la, ti (lowercase)
With variants:   Do (uppercase), DO (capitalized), etc.
Parser handles:  Case differences carry meaning
```
**Best for**: Systems with musical/cultural variants (komal, tivra, etc.)

### Option C: Multi-Character Bols (Like Tabla)
```
Pattern:  "dhin", "dhir", "dha", "tin", etc.
Parser:   Longest-match (tries "dhin" before "dha" before "dh")
```
**Best for**: Percussion/rhythmic systems

This guide uses **Option A** for Doremi (recommended).

---

## Step-by-Step Implementation

### STEP 1: Update PitchSystem Enum

**File**: `/home/john/editor/src/models/elements.rs`

Find the `PitchSystem` enum and add your new variant:

```rust
#[wasm_bindgen]
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde_repr::Serialize_repr, serde_repr::Deserialize_repr)]
pub enum PitchSystem {
    Unknown = 0,
    Number = 1,
    Western = 2,
    Sargam = 3,
    Bhatkhande = 4,
    Tabla = 5,
    Doremi = 6,  // ADD THIS LINE
}
```

Then update all the methods in the `impl PitchSystem` block:

```rust
pub fn supports_accidentals(&self) -> bool {
    matches!(self, 
        PitchSystem::Number | 
        PitchSystem::Western |
        PitchSystem::Doremi  // ADD THIS
    )
}

pub fn is_case_sensitive(&self) -> bool {
    matches!(self, 
        PitchSystem::Western | 
        PitchSystem::Sargam | 
        PitchSystem::Bhatkhande
        // Doremi is NOT case-sensitive, so don't add it here
    )
}

pub fn pitch_sequence(&self) -> Vec<&'static str> {
    match self {
        PitchSystem::Number => vec!["1", "2", "3", "4", "5", "6", "7"],
        PitchSystem::Western => vec!["c", "d", "e", "f", "g", "a", "b"],
        PitchSystem::Sargam => vec!["S", "R", "G", "M", "P", "D", "N"],
        PitchSystem::Bhatkhande => vec!["S", "R", "G", "M", "P", "D", "N"],
        PitchSystem::Tabla => vec!["dha", "dhin", "na", "tin", "ta", "ke", "te"],
        PitchSystem::Doremi => vec!["do", "re", "mi", "fa", "sol", "la", "ti"],  // ADD THIS
        PitchSystem::Unknown => vec![],
    }
}

pub fn name(&self) -> &'static str {
    match self {
        PitchSystem::Unknown => "Unknown",
        PitchSystem::Number => "Number",
        PitchSystem::Western => "Western",
        PitchSystem::Sargam => "Sargam",
        PitchSystem::Bhatkhande => "Bhatkhande",
        PitchSystem::Tabla => "Tabla",
        PitchSystem::Doremi => "Doremi",  // ADD THIS
    }
}

pub fn snake_case_name(&self) -> &'static str {
    match self {
        PitchSystem::Unknown => "unknown",
        PitchSystem::Number => "number",
        PitchSystem::Western => "western",
        PitchSystem::Sargam => "sargam",
        PitchSystem::Bhatkhande => "bhatkhande",
        PitchSystem::Tabla => "tabla",
        PitchSystem::Doremi => "doremi",  // ADD THIS
    }
}

pub fn css_class(&self) -> &'static str {
    match self {
        PitchSystem::Unknown => "pitch-system-unknown",
        PitchSystem::Number => "pitch-system-number",
        PitchSystem::Western => "pitch-system-western",
        PitchSystem::Sargam => "pitch-system-sargam",
        PitchSystem::Bhatkhande => "pitch-system-bhatkhande",
        PitchSystem::Tabla => "pitch-system-tabla",
        PitchSystem::Doremi => "pitch-system-doremi",  // ADD THIS
    }
}
```

### STEP 2: Create the Pitch System Parser Module

**File**: `/home/john/editor/src/models/pitch_systems/doremi.rs` (NEW FILE)

Create this new file:

```rust
//! Doremi system pitch implementation
//!
//! The doremi system uses syllables do, re, mi, fa, sol, la, ti
//! to represent the seven degrees of the musical scale.

use crate::models::pitch_code::PitchCode;
use super::PitchParser;

/// Doremi system implementation
pub struct DoremiSystem;

impl DoremiSystem {
    /// Get the pitch sequence for doremi system
    pub fn pitch_sequence() -> Vec<&'static str> {
        vec!["do", "re", "mi", "fa", "sol", "la", "ti"]
    }

    /// Validate if a string is valid doremi system pitch
    pub fn validate_pitch(pitch: &str) -> bool {
        let base = pitch.trim_end_matches('#').trim_end_matches('b');
        Self::pitch_sequence().contains(&base)
    }

    /// Get solfege name for doremi
    pub fn get_solfege(doremi: &str) -> &'static str {
        match doremi {
            "do" => "do",
            "re" => "re",
            "mi" => "mi",
            "fa" => "fa",
            "sol" => "sol",
            "la" => "la",
            "ti" => "ti",
            _ => "do",
        }
    }

    /// Convert doremi to number system
    pub fn to_number(doremi: &str) -> String {
        match doremi {
            "do" => "1",
            "re" => "2",
            "mi" => "3",
            "fa" => "4",
            "sol" => "5",
            "la" => "6",
            "ti" => "7",
            _ => "1",
        }.to_string()
    }
}

impl PitchParser for DoremiSystem {
    fn parse_pitch(input: &str) -> Option<(PitchCode, usize)> {
        if input.is_empty() {
            return None;
        }

        // List of all possible doremi pitches, longest first for longest-match
        let patterns = [
            // Double sharps (5-6 chars: base + ##)
            ("sol##", PitchCode::N5ss),
            ("do##", PitchCode::N1ss),
            ("re##", PitchCode::N2ss),
            ("mi##", PitchCode::N3ss),
            ("fa##", PitchCode::N4ss),
            ("la##", PitchCode::N6ss),
            ("ti##", PitchCode::N7ss),
            
            // Double flats (5-6 chars: base + bb)
            ("sol##", PitchCode::N5ss),
            ("dobb", PitchCode::N1bb),
            ("rebb", PitchCode::N2bb),
            ("mibb", PitchCode::N3bb),
            ("fabb", PitchCode::N4bb),
            ("solbb", PitchCode::N5bb),
            ("labb", PitchCode::N6bb),
            ("tibb", PitchCode::N7bb),
            
            // Sharps (3-4 chars: base + #)
            ("do#", PitchCode::N1s),
            ("re#", PitchCode::N2s),
            ("mi#", PitchCode::N3s),
            ("fa#", PitchCode::N4s),
            ("sol#", PitchCode::N5s),
            ("la#", PitchCode::N6s),
            ("ti#", PitchCode::N7s),
            
            // Flats (3-4 chars: base + b)
            ("dob", PitchCode::N1b),
            ("reb", PitchCode::N2b),
            ("mib", PitchCode::N3b),
            ("fab", PitchCode::N4b),
            ("solb", PitchCode::N5b),
            ("lab", PitchCode::N6b),
            ("tib", PitchCode::N7b),
            
            // Naturals (2-3 chars)
            ("do", PitchCode::N1),
            ("re", PitchCode::N2),
            ("mi", PitchCode::N3),
            ("fa", PitchCode::N4),
            ("sol", PitchCode::N5),
            ("la", PitchCode::N6),
            ("ti", PitchCode::N7),
        ];

        // Try longest match first
        for (pattern, pitch_code) in &patterns {
            if input.starts_with(pattern) {
                return Some((*pitch_code, pattern.len()));
            }
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_doremi_longest_match() {
        // Test double sharps (longest match)
        assert_eq!(DoremiSystem::parse_pitch("sol##"), Some((PitchCode::N5ss, 6)));
        assert_eq!(DoremiSystem::parse_pitch("sol##xyz"), Some((PitchCode::N5ss, 6)));

        // Test single sharp
        assert_eq!(DoremiSystem::parse_pitch("do#"), Some((PitchCode::N1s, 3)));
        assert_eq!(DoremiSystem::parse_pitch("sol#"), Some((PitchCode::N5s, 4)));

        // Test naturals
        assert_eq!(DoremiSystem::parse_pitch("do"), Some((PitchCode::N1, 2)));
        assert_eq!(DoremiSystem::parse_pitch("sol"), Some((PitchCode::N5, 3)));

        // Test flats
        assert_eq!(DoremiSystem::parse_pitch("dob"), Some((PitchCode::N1b, 3)));
        assert_eq!(DoremiSystem::parse_pitch("solb"), Some((PitchCode::N5b, 4)));
        assert_eq!(DoremiSystem::parse_pitch("solbb"), Some((PitchCode::N5bb, 5)));

        // Test invalid
        assert_eq!(DoremiSystem::parse_pitch("x"), None);
        assert_eq!(DoremiSystem::parse_pitch(""), None);
    }

    #[test]
    fn test_doremi_with_trailing_text() {
        let (pitch, consumed) = DoremiSystem::parse_pitch("do#abc").unwrap();
        assert_eq!(pitch, PitchCode::N1s);
        assert_eq!(consumed, 3); // Only "do#", not "abc"

        let (pitch, consumed) = DoremiSystem::parse_pitch("solb_").unwrap();
        assert_eq!(pitch, PitchCode::N5b);
        assert_eq!(consumed, 4); // Only "solb", not "_"
    }
}
```

### STEP 3: Add Conversion Methods to PitchCode

**File**: `/home/john/editor/src/models/pitch_code.rs`

Find the `to_string()` method and update it:

```rust
pub fn to_string(&self, pitch_system: super::elements::PitchSystem) -> String {
    use super::elements::PitchSystem;

    match pitch_system {
        PitchSystem::Number => self.to_number_string(),
        PitchSystem::Western => self.to_western_string(),
        PitchSystem::Sargam => self.to_sargam_string(),
        PitchSystem::Doremi => self.to_doremi_string(),  // ADD THIS
        _ => self.to_number_string(), // Default fallback
    }
}
```

Now add the new conversion method to the impl block:

```rust
/// Convert to doremi notation string
fn to_doremi_string(&self) -> String {
    match self {
        // Naturals
        PitchCode::N1 => "do",
        PitchCode::N2 => "re",
        PitchCode::N3 => "mi",
        PitchCode::N4 => "fa",
        PitchCode::N5 => "sol",
        PitchCode::N6 => "la",
        PitchCode::N7 => "ti",
        
        // Sharps
        PitchCode::N1s => "do#",
        PitchCode::N2s => "re#",
        PitchCode::N3s => "mi#",
        PitchCode::N4s => "fa#",
        PitchCode::N5s => "sol#",
        PitchCode::N6s => "la#",
        PitchCode::N7s => "ti#",
        
        // Flats
        PitchCode::N1b => "dob",
        PitchCode::N2b => "reb",
        PitchCode::N3b => "mib",
        PitchCode::N4b => "fab",
        PitchCode::N5b => "solb",
        PitchCode::N6b => "lab",
        PitchCode::N7b => "tib",
        
        // Double sharps
        PitchCode::N1ss => "do##",
        PitchCode::N2ss => "re##",
        PitchCode::N3ss => "mi##",
        PitchCode::N4ss => "fa##",
        PitchCode::N5ss => "sol##",
        PitchCode::N6ss => "la##",
        PitchCode::N7ss => "ti##",
        
        // Double flats
        PitchCode::N1bb => "dobb",
        PitchCode::N2bb => "rebb",
        PitchCode::N3bb => "mibb",
        PitchCode::N4bb => "fabb",
        PitchCode::N5bb => "solbb",
        PitchCode::N6bb => "labb",
        PitchCode::N7bb => "tibb",
    }.to_string()
}
```

Also update the `from_string()` method:

```rust
pub fn from_string(input: &str, pitch_system: super::elements::PitchSystem) -> Option<Self> {
    use super::elements::PitchSystem;

    match pitch_system {
        PitchSystem::Number => Self::from_number(input),
        PitchSystem::Western => Self::from_western(input),
        PitchSystem::Sargam => Self::from_sargam(input),
        PitchSystem::Doremi => Self::from_doremi(input),  // ADD THIS
        _ => None,
    }
}
```

Add the new parsing method:

```rust
fn from_doremi(input: &str) -> Option<Self> {
    match input {
        // Naturals
        "do" => Some(PitchCode::N1),
        "re" => Some(PitchCode::N2),
        "mi" => Some(PitchCode::N3),
        "fa" => Some(PitchCode::N4),
        "sol" => Some(PitchCode::N5),
        "la" => Some(PitchCode::N6),
        "ti" => Some(PitchCode::N7),
        
        // Sharps
        "do#" => Some(PitchCode::N1s),
        "re#" => Some(PitchCode::N2s),
        "mi#" => Some(PitchCode::N3s),
        "fa#" => Some(PitchCode::N4s),
        "sol#" => Some(PitchCode::N5s),
        "la#" => Some(PitchCode::N6s),
        "ti#" => Some(PitchCode::N7s),
        
        // Flats
        "dob" => Some(PitchCode::N1b),
        "reb" => Some(PitchCode::N2b),
        "mib" => Some(PitchCode::N3b),
        "fab" => Some(PitchCode::N4b),
        "solb" => Some(PitchCode::N5b),
        "lab" => Some(PitchCode::N6b),
        "tib" => Some(PitchCode::N7b),
        
        // Double sharps
        "do##" => Some(PitchCode::N1ss),
        "re##" => Some(PitchCode::N2ss),
        "mi##" => Some(PitchCode::N3ss),
        "fa##" => Some(PitchCode::N4ss),
        "sol##" => Some(PitchCode::N5ss),
        "la##" => Some(PitchCode::N6ss),
        "ti##" => Some(PitchCode::N7ss),
        
        // Double flats
        "dobb" => Some(PitchCode::N1bb),
        "rebb" => Some(PitchCode::N2bb),
        "mibb" => Some(PitchCode::N3bb),
        "fabb" => Some(PitchCode::N4bb),
        "solbb" => Some(PitchCode::N5bb),
        "labb" => Some(PitchCode::N6bb),
        "tibb" => Some(PitchCode::N7bb),
        
        _ => None,
    }
}
```

### STEP 4: Register the New Module

**File**: `/home/john/editor/src/models/pitch_systems/mod.rs`

Add the module import at the top:

```rust
pub mod number;
pub mod western;
pub mod sargam;
pub mod bhatkhande;
pub mod tabla;
pub mod doremi;  // ADD THIS

// Re-export
pub use number::*;
pub use western::*;
pub use sargam::*;
pub use bhatkhande::*;
pub use tabla::*;
pub use doremi::*;  // ADD THIS
```

### STEP 5: Create Lexer Support (Optional)

**File**: `/home/john/editor/src/parse/pitch_system.rs`

Add the DoremiPitchSystem handler (if your lexer uses it):

```rust
/// Doremi notation pitch system
#[derive(Debug, Clone)]
pub struct DoremiPitchSystem;

impl PitchSystemHandler for DoremiPitchSystem {
    fn lookup(&self, symbol: &str) -> bool {
        matches!(symbol,
            // Naturals
            "do" | "re" | "mi" | "fa" | "sol" | "la" | "ti" |
            // Sharps
            "do#" | "re#" | "mi#" | "fa#" | "sol#" | "la#" | "ti#" |
            // Flats
            "dob" | "reb" | "mib" | "fab" | "solb" | "lab" | "tib" |
            // Double sharps
            "do##" | "re##" | "mi##" | "fa##" | "sol##" | "la##" | "ti##" |
            // Double flats
            "dobb" | "rebb" | "mibb" | "fabb" | "solbb" | "labb" | "tibb"
        )
    }

    fn get_valid_chars(&self) -> Vec<char> {
        vec!['d', 'o', 'r', 'e', 'm', 'i', 'f', 'a', 's', 'l', 'l', 't', '#', 'b']
    }

    fn get_pitch_chars(&self) -> Vec<char> {
        vec!['d', 'o', 'r', 'e', 'm', 'i', 'f', 'a', 's', 'l', 't']
    }
}
```

Then in the `PitchSystemDispatcher::get_handler()` method, add:

```rust
PitchSystem::Doremi => &self.doremi,
```

And add it to the dispatcher struct:

```rust
pub struct PitchSystemDispatcher {
    number: NumberPitchSystem,
    western: WesternPitchSystem,
    sargam: SargamPitchSystem,
    doremi: DoremiPitchSystem,  // ADD THIS
}
```

### STEP 6: Build and Test

```bash
# Build the WASM module
npm run build-wasm

# Run Rust tests
cargo test

# Look for any compilation errors related to match statements
# Update any remaining match statements on PitchSystem that don't handle Doremi
```

### STEP 7: Add Tests to PitchCode

**File**: `/home/john/editor/src/models/pitch_code.rs`

Add a test for roundtrip conversion:

```rust
#[test]
fn test_doremi_roundtrip_conversion() {
    // Test that converting to and from doremi preserves the pitch
    let pitches = [
        PitchCode::N1, PitchCode::N2, PitchCode::N3,
        PitchCode::N4, PitchCode::N5, PitchCode::N6, PitchCode::N7
    ];

    for pitch in pitches.iter() {
        let doremi_str = pitch.to_string(PitchSystem::Doremi);
        let parsed_pitch = PitchCode::from_string(&doremi_str, PitchSystem::Doremi);
        assert_eq!(Some(*pitch), parsed_pitch, "Roundtrip failed for pitch {:?}", pitch);
    }
}

#[test]
fn test_doremi_natural_notes() {
    assert_eq!(PitchCode::N1.to_string(PitchSystem::Doremi), "do");
    assert_eq!(PitchCode::N2.to_string(PitchSystem::Doremi), "re");
    assert_eq!(PitchCode::N3.to_string(PitchSystem::Doremi), "mi");
    assert_eq!(PitchCode::N4.to_string(PitchSystem::Doremi), "fa");
    assert_eq!(PitchCode::N5.to_string(PitchSystem::Doremi), "sol");
    assert_eq!(PitchCode::N6.to_string(PitchSystem::Doremi), "la");
    assert_eq!(PitchCode::N7.to_string(PitchSystem::Doremi), "ti");
}

#[test]
fn test_doremi_accidentals() {
    assert_eq!(PitchCode::N4s.to_string(PitchSystem::Doremi), "fa#");
    assert_eq!(PitchCode::N5b.to_string(PitchSystem::Doremi), "solb");
    assert_eq!(PitchCode::N1ss.to_string(PitchSystem::Doremi), "do##");
    assert_eq!(PitchCode::N2bb.to_string(PitchSystem::Doremi), "rebb");
}
```

---

## Verification Checklist

After implementation, verify:

- [ ] `cargo build` completes without errors
- [ ] `cargo test` passes all tests
- [ ] No compiler warnings from new code
- [ ] Roundtrip conversion works: to_string → from_string → same PitchCode
- [ ] Longest-match parsing works: "sol##" parsed before "sol#"
- [ ] All `match PitchSystem` statements include the new variant
- [ ] New system appears in UI if applicable
- [ ] E2E tests still pass

---

## Common Mistakes to Avoid

1. **Forgetting to update match statements** - Compiler will catch these as non-exhaustive
2. **Incorrect order in parser patterns** - Put longest patterns first!
3. **Case sensitivity mismatch** - Decide early and be consistent
4. **Forgetting byte length** - Return correct `usize` from parser (character count, not byte count)
5. **Incomplete rounding conversion** - Test both to_string() and from_string()
6. **Module registration** - Add to mod.rs AND update pub use statements

---

## Reference: File Locations

```
Key files to modify:
- src/models/elements.rs (PitchSystem enum)
- src/models/pitch_code.rs (conversion methods)
- src/models/pitch_systems/doremi.rs (NEW - parser)
- src/models/pitch_systems/mod.rs (module registration)
- src/parse/pitch_system.rs (lexer support - optional)

Test files (add tests here):
- src/models/pitch_code.rs (roundtrip tests)
- src/models/pitch_systems/doremi.rs (parser tests)
```

---

## Next Steps After Implementation

Once Doremi is implemented:

1. Add UI support for switching between pitch systems
2. Add default pitch system preference in user settings
3. Create example documents in Doremi notation
4. Update documentation and help text
5. Test cross-system document conversion
6. Add keyboard shortcuts for fast notation entry

