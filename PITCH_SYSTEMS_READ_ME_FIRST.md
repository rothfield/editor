# READ ME FIRST: Pitch Systems Exploration

You requested an exploration of how pitch systems are currently implemented, with focus on adding support for the Doremi system.

## What You'll Find

Six comprehensive documentation files have been created and saved to this directory:

### Quick Start (Read in Order)

1. **This file** - You are here
2. **PITCH_SYSTEMS_INDEX.md** - Navigation guide
3. **PITCH_SYSTEMS_SUMMARY.md** - 5-minute overview
4. **PITCH_SYSTEMS_DIAGRAM.txt** - Visual architecture
5. **PITCH_SYSTEMS.md** - Deep dive (if you want details)
6. **PITCH_SYSTEMS_IMPLEMENTATION_GUIDE.md** - For implementation
7. **PITCH_SYSTEMS_CODE_REFERENCE.md** - Code inventory

## The Essential Answer

**All pitch systems map to a universal internal representation called `PitchCode`.**

```
User Input (any notation)
    ↓
PitchCode::from_string(input, pitch_system)
    ↓
System-specific parser
    ↓
PitchCode (universal enum with 35 variants)
    ↓
Document stores PitchCode
    ↓
PitchCode::to_string(pitch_system)
    ↓
Display in user's chosen notation
```

This hub-and-spoke architecture means:
- Adding Doremi requires NO architectural changes
- All 5 current systems work the same way
- Complete extensibility without breaking changes

## About Doremi

**Not yet implemented.** Ready to be added.

Recommended approach:
- Notation: `do`, `do#`, `dob`, `do##`, `dobb`
- Effort: 4-6 hours
- Code: ~200 lines
- Files: 3 to modify, 1 to create
- Breaking changes: 0

See `PITCH_SYSTEMS_IMPLEMENTATION_GUIDE.md` for step-by-step instructions.

## Current Systems

| System | Notation | Notes |
|--------|----------|-------|
| Number | 1-7 with #/b | Default, simplest |
| Western | c-b with #/b | Standard notation |
| Sargam | S R G M P D N | Indian classical, case-sensitive |
| Bhatkhande | S R G M P D N | Formal Indian (= Sargam) |
| Tabla | dhin, dha, tin, etc. | Percussion bols |

## Key Insights

1. **Universal enum** - All systems map to 35 `PitchCode` variants (7 notes × 5 accidental states)

2. **Case sensitivity intentional** - Sargam uses `S` vs `s` to encode musical meaning

3. **Longest-match parsing** - Critical for multi-character notations

4. **Compiler safety** - Exhaustive pattern matching enforces consistency

5. **Zero direct conversion** - All system-to-system conversions route through `PitchCode`

## Where to Find Things

**In documentation:**
- Architecture: `PITCH_SYSTEMS.md`
- Visuals: `PITCH_SYSTEMS_DIAGRAM.txt`
- How to implement: `PITCH_SYSTEMS_IMPLEMENTATION_GUIDE.md`
- Code inventory: `PITCH_SYSTEMS_CODE_REFERENCE.md`
- Navigation: `PITCH_SYSTEMS_INDEX.md`

**In codebase:**
- Universal enum: `src/models/pitch_code.rs` (572 lines)
- System selector: `src/models/elements.rs` (lines 223-241)
- Implementations: `src/models/pitch_systems/` (5 systems)
- Parsing: `src/parse/grammar.rs`

## Before You Code

If you're planning to implement Doremi or any new system:

1. Read `PITCH_SYSTEMS_SUMMARY.md` (understand architecture)
2. Read `PITCH_SYSTEMS_IMPLEMENTATION_GUIDE.md` (copy-paste ready code)
3. Have this reference nearby: `PITCH_SYSTEMS_CODE_REFERENCE.md` (know where to edit)

All three together have everything needed to implement.

## Questions Answered

**What's the pitch system?**
→ Universal `PitchCode` enum that all notation systems map to

**How does it work?**
→ Hub-and-spoke: User notation → PitchCode → Document → Display notation

**How are notes stored?**
→ As `PitchCode` enum variants (N1, N2, N1s, N1b, N1ss, N1bb, etc.)

**How are notes displayed?**
→ `PitchCode::to_string(pitch_system)` converts to user's notation

**Can I add Doremi?**
→ Yes, 4-6 hours work, no breaking changes

**What about "fa"?**
→ Maps to degree 4 (same as "4" in Number system, "f" in Western, "m" in Sargam)

**Is it well-designed?**
→ Yes, production-grade architecture with excellent extensibility

## Next Step

Open **PITCH_SYSTEMS_SUMMARY.md** for a 5-minute overview, then decide which other files you need based on your goals.

---

**Documentation Generated**: November 7, 2025  
**Total Content**: 1,848 lines across 6 files  
**All Absolute File Paths**: Included throughout documentation
