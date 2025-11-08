# Pitch Systems Documentation Index

Complete exploration of the music editor's pitch system architecture, with focus on how to add new systems (like Doremi).

## Quick Navigation

### For Executives/Overview
**Start here**: [`PITCH_SYSTEMS_SUMMARY.md`](PITCH_SYSTEMS_SUMMARY.md)
- What is the pitch system?
- How does it work?
- Why is it well-designed?
- What about Doremi?
- Status and implementation effort estimate

### For Architects/Deep Dive
**Start here**: [`PITCH_SYSTEMS.md`](PITCH_SYSTEMS.md)
- Complete architecture breakdown
- All 5 current systems explained in detail
- Conversion flows (string ↔ PitchCode)
- File structure and organization
- Extensibility patterns
- Doremi implementation paths (3 approaches)
- Testing patterns and best practices

### For Visual Learners
**Start here**: [`PITCH_SYSTEMS_DIAGRAM.txt`](PITCH_SYSTEMS_DIAGRAM.txt)
- ASCII architecture diagrams
- Parsing flow visualization
- Display flow visualization
- Cross-system equivalence
- Step-by-step implementation map
- Extensibility guide

### For Implementers
**Start here**: [`PITCH_SYSTEMS_IMPLEMENTATION_GUIDE.md`](PITCH_SYSTEMS_IMPLEMENTATION_GUIDE.md)
- Copy-paste ready code examples
- Step-by-step implementation walkthrough
- 6 concrete implementation steps
- Code snippets for each file
- Testing checklist
- Common mistakes to avoid
- Verification checklist

## Current Pitch Systems

| System | Location | Notation | Notes |
|--------|----------|----------|-------|
| **Number** | `src/models/pitch_systems/number.rs` | 1-7 with #/b | Default, simplest |
| **Western** | `src/models/pitch_systems/western.rs` | c-b with #/b | Standard music notation |
| **Sargam** | `src/models/pitch_systems/sargam.rs` | S R G M P D N | Indian classical, case-sensitive |
| **Bhatkhande** | `src/models/pitch_systems/bhatkhande.rs` | S R G M P D N | Formal Indian notation (= Sargam) |
| **Tabla** | `src/models/pitch_systems/tabla.rs` | dhin, dha, tin, etc. | Percussion bols |

## The Doremi Question

### Status
Not yet implemented. Ready to be added without architectural changes.

### Recommended Notation
```
Naturals:        do, re, mi, fa, sol, la, ti
With sharps:     do#, re#, mi#, fa#, sol#, la#, ti#
With flats:      dob, reb, mib, fab, solb, lab, tib
With double acc: do##, dobb, sol##, solbb, etc.
```

### Implementation Effort
- Estimated: 4-6 hours
- Lines of code: ~200
- Files to create: 1 new (doremi.rs)
- Files to modify: 3 (elements.rs, pitch_code.rs, mod.rs)
- Breaking changes: 0
- Architectural changes: 0

### Key Files for Doremi
If implementing, you'll need to modify:
1. `/home/john/editor/src/models/elements.rs` - Add Doremi variant
2. `/home/john/editor/src/models/pitch_code.rs` - Add conversion methods
3. `/home/john/editor/src/models/pitch_systems/doremi.rs` - Create new parser
4. `/home/john/editor/src/models/pitch_systems/mod.rs` - Register module

## Architecture Highlights

### Universal Internal Representation
All pitch systems (past, present, future) map to the same `PitchCode` enum:
```rust
pub enum PitchCode {
    N1, N1s, N1b, N1ss, N1bb,   // Degree 1 (do) with accidentals
    N2, N2s, N2b, N2ss, N2bb,   // Degree 2 (re) with accidentals
    // ... N3-N7 same pattern
}
```

### Parsing Flow
```
User "4#" (Number) → PitchCode::N4s → "f#" (Western) / "M" (Sargam)
```

### Key Design Principle
**Longest-match parsing**: Parsers try patterns from longest to shortest
- Input "sol##" matches "sol##" (6 chars), not "sol#" (4 chars)
- Critical for multi-character notation systems

## How to Use These Docs

1. **I want to understand the system**: Read SUMMARY, then ARCHITECTURE
2. **I'm implementing Doremi**: Read SUMMARY, then IMPLEMENTATION_GUIDE
3. **I'm adding a different system**: Read ARCHITECTURE first, then IMPLEMENTATION_GUIDE as template
4. **I need a quick visual**: Read DIAGRAM
5. **I have 5 minutes**: Read SUMMARY only

## Key Files in Codebase

### Core Architecture
- `src/models/pitch_code.rs` - Universal 35-element PitchCode enum (572 lines)
- `src/models/pitch.rs` - Pitch with octave info (283 lines)
- `src/models/elements.rs` - PitchSystem enum selector (lines 223-241)

### System Implementations
- `src/models/pitch_systems/mod.rs` - PitchParser trait + dispatcher
- `src/models/pitch_systems/number.rs` - 1-7 implementation (110 lines)
- `src/models/pitch_systems/western.rs` - c-b implementation (97 lines)
- `src/models/pitch_systems/sargam.rs` - Indian classical (110 lines)
- `src/models/pitch_systems/bhatkhande.rs` - Formal Indian (68 lines)
- `src/models/pitch_systems/tabla.rs` - Percussion (109 lines)

### Parsing/Lexing
- `src/parse/grammar.rs` - Uses PitchCode::from_string() for parsing
- `src/parse/pitch_system.rs` - PitchSystemDispatcher for lexer support

## Critical Insights

1. **No pitch system dependencies**: Each system is independent, can be enabled/disabled
2. **Compiler-enforced exhaustiveness**: Missing PitchSystem cases cause compile errors
3. **Roundtrip guaranteed**: to_string() followed by from_string() recovers original PitchCode
4. **Zero-cost abstraction**: All conversions are compile-time or simple lookups
5. **Fully backward compatible**: New systems don't break existing code

## Next Steps

### To Understand System Better
1. Read `PITCH_SYSTEMS_SUMMARY.md`
2. Browse `src/models/pitch_code.rs` to see the 35 variants
3. Read `src/models/pitch_systems/number.rs` as template
4. Look at `src/parse/grammar.rs` to see parsing in action

### To Implement Doremi
1. Read `PITCH_SYSTEMS_SUMMARY.md` for overview
2. Read `PITCH_SYSTEMS_IMPLEMENTATION_GUIDE.md` step 1-2
3. Follow the 6 implementation steps with code examples provided
4. Run verification checklist

### To Add a Different System
1. Read `PITCH_SYSTEMS.md` section 7 (Extensibility)
2. Decide on notation (read section 4.2 first)
3. Follow `PITCH_SYSTEMS_IMPLEMENTATION_GUIDE.md` as template
4. Adapt code examples to your notation

## Questions This Documentation Answers

- What is the pitch system? (SUMMARY)
- How does it work? (ARCHITECTURE)
- How are notes stored internally? (ARCHITECTURE section 1.1)
- How are notes displayed? (ARCHITECTURE section 3.2)
- How does parsing work? (ARCHITECTURE section 3.1)
- Can I add a new system? (GUIDE)
- How do I add Doremi? (GUIDE)
- What's the effort? (SUMMARY)
- Will it break anything? (GUIDE section on checklist)
- How do I test it? (GUIDE section 7)

## Technical Foundations

### Rust Features Used
- Enum with variants for PitchCode
- Pattern matching for conversion
- Trait implementation for extensibility
- Longest-match algorithm for parsing
- serde for serialization

### Design Patterns
- Strategy pattern (PitchParser trait)
- Dispatcher pattern (PitchSystemDispatcher)
- Visitor pattern (for conversions)
- Longest-match parsing

### Testing
- Unit tests in each system module
- Roundtrip conversion tests
- Longest-match tests
- Exhaustive pattern matching (compiler-enforced)

---

**Generated**: November 7, 2025

**Related Documentation**:
- See CLAUDE.md for development guidelines
- See RHYTHM.md for rhythmic notation system

