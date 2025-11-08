# Pitch System Architecture - Executive Summary

## What You Found

The editor has a sophisticated, extensible pitch system architecture supporting multiple notation styles:

1. **Number System** (default): 1-7 with #/b accidentals
2. **Western System**: c-b with #/b accidentals  
3. **Sargam System**: Indian classical (S R G M P D N with case-sensitive variants)
4. **Bhatkhande System**: Formal Indian classical notation (identical to Sargam)
5. **Tabla System**: Percussion bols (dhin, dha, tin, etc.)

All systems route through a **universal internal representation** called `PitchCode` with 35 variants (7 degrees × 5 accidental states).

## Key Architecture Files

| File | Purpose |
|------|---------|
| `src/models/pitch_code.rs` | Universal 35-element enum (N1-N7, sharps, flats, double accidentals) |
| `src/models/elements.rs` | PitchSystem enum (selector for notation system) |
| `src/models/pitch_systems/` | System-specific implementations (number.rs, western.rs, sargam.rs, etc.) |
| `src/parse/grammar.rs` | Parsing logic using PitchCode::from_string() |
| `src/parse/pitch_system.rs` | Lexer support (PitchSystemDispatcher) |

## How It Works

```
User Input (any notation)
    ↓
PitchCode::from_string(input, pitch_system)
    ↓
System-specific parser (longest-match)
    ↓
Universal PitchCode (internal representation)
    ↓
Document model stores PitchCode
    ↓
PitchCode::to_string(pitch_system)
    ↓
User sees notation in their chosen system
```

## Doremi System Status

**Not yet implemented.** The architecture is ready for it.

**Recommended approach**: Follow Option A (explicit accidentals)
- Notation: `do`, `do#`, `dob`, `do##`, `dobb`
- Maps cleanly to Number/Western pattern
- Aligns with existing parser infrastructure

**Implementation effort**: Medium (~4-6 hours)
- 1 new file (doremi.rs parser)
- Updates to 3 existing files (elements.rs, pitch_code.rs, mod.rs)
- ~200 lines of code total
- No architectural changes needed

## Key Design Insights

1. **Universal Internal Representation**: All pitch systems map to the same `PitchCode` enum, enabling seamless conversion

2. **Longest-Match Parsing**: All parsers use longest-match strategy
   - Input "1##abc" → matches "1##" (3 chars), not "1#" (2 chars)
   - Critical for handling multi-character accidentals

3. **No Direct System-to-System Conversion**: Always routes through PitchCode
   - Number "4#" → PitchCode::N4s → Western "f#"
   - Ensures consistency, prevents mapping errors

4. **Case-Sensitive Support**: Sargam uses case to encode musical meaning
   - `S` = Sa, `s` = Sa (both same)
   - `M` = Tivra Ma (sharp), `m` = Shuddha Ma (natural)
   - Critical for Indian classical notation

5. **Extensible via Pattern Matching**: Adding systems doesn't require refactoring
   - Compiler enforces exhaustive matching
   - New systems integrate by implementing PitchParser trait

## For Future Work

To add Doremi (or any new system):

1. Add enum variant to PitchSystem
2. Create parser implementing PitchParser trait
3. Add to_doremi_string() and from_doremi() to PitchCode
4. Register module and update match statements
5. Write roundtrip tests

See `PITCH_SYSTEMS_IMPLEMENTATION_GUIDE.md` for step-by-step instructions.

## File Locations (Absolute Paths)

Generated documentation saved to:
- `/home/john/editor/PITCH_SYSTEMS.md` - Comprehensive analysis
- `/home/john/editor/PITCH_SYSTEMS_DIAGRAM.txt` - Architecture diagrams
- `/home/john/editor/PITCH_SYSTEMS_IMPLEMENTATION_GUIDE.md` - Implementation walkthrough
- `/home/john/editor/PITCH_SYSTEMS_SUMMARY.md` - This file

## Key Takeaways

- Pitch systems are **NOT a monolithic structure** - they're highly modular
- The **PitchCode enum is the hub** - all conversions flow through it
- **Parsers are stateless and reusable** - perfect for testing and extension
- **Case sensitivity is intentional** - not a bug, a feature for Sargam
- **Zero breaking changes needed** to add new systems - fully backward compatible

The architecture is production-grade and well-suited for supporting many notation systems. Doremi would integrate cleanly with minimal effort.
