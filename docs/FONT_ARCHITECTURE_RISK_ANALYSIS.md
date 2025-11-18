# Font Architecture Migration - Risk Analysis

**Generated:** 2025-11-17
**Context:** Proposed refactoring to move magic numbers to atoms.yaml

---

## Executive Summary

**Overall Risk Level: MEDIUM-HIGH** ⚠️

The proposed migration has **significant benefits** but carries **real risks** of breaking existing fonts, user documents, and cross-layer integration (Rust/Python/JavaScript).

**Key Risk:** Font generation is a **build-time dependency** for the entire application. Broken fonts = broken application.

---

## Risk Matrix

| Risk Category | Probability | Impact | Severity | Mitigation Difficulty |
|---------------|-------------|--------|----------|----------------------|
| **Font Breakage** | HIGH | CRITICAL | 🔴 **CRITICAL** | Easy |
| **Codepoint Drift** | MEDIUM | CRITICAL | 🔴 **CRITICAL** | Medium |
| **Cross-Layer Desync** | MEDIUM | HIGH | 🟠 **HIGH** | Hard |
| **Build Failures** | MEDIUM | MEDIUM | 🟡 **MEDIUM** | Easy |
| **Performance Regression** | LOW | LOW | 🟢 **LOW** | Easy |
| **Data Loss** | LOW | CRITICAL | 🟠 **HIGH** | Easy |

---

## CRITICAL RISKS (Stop-Ship Level)

### Risk #1: Font Codepoint Drift 🔴

**Scenario:** Changing accidental/octave ordering breaks existing user documents.

**Example:**
```yaml
# OLD (current):
accidental_order: [natural, flat, halfflat, doubleflat, doublesharp, sharp]

# NEW (hypothetical mistake):
accidental_order: [natural, sharp, flat, halfflat, doubleflat, doublesharp]
```

**Impact:**
- User opens existing document with "1♭" (codepoint U+E005)
- Font now maps U+E005 to "1♯" instead of "1♭"
- **All accidentals in existing documents are wrong!**
- **User data corruption**

**Probability:** MEDIUM (easy typo during YAML editing)

**Mitigation:**
1. ✅ **Lock ordering** - Make accidental_order and octave_order **immutable**
2. ✅ **Add validation** - Fail build if ordering changes from known-good baseline
3. ✅ **Version fonts** - Embed ordering hash in font metadata
4. ✅ **Test backward compatibility** - Load old documents, verify glyphs unchanged
5. ✅ **Snapshot testing** - Store expected codepoint→glyph mappings

**Code:**
```python
# generate.py - validation
CANONICAL_ACCIDENTAL_ORDER = ['natural', 'flat', 'halfflat', 'doubleflat', 'doublesharp', 'sharp']
CANONICAL_OCTAVE_ORDER = [0, -2, -1, 1, 2]

def validate_ordering(config):
    if config['accidental_order'] != CANONICAL_ACCIDENTAL_ORDER:
        raise ValueError("⚠️ CRITICAL: Accidental ordering changed! This breaks existing documents!")
    if config['octave_order'] != CANONICAL_OCTAVE_ORDER:
        raise ValueError("⚠️ CRITICAL: Octave ordering changed! This breaks existing documents!")
```

---

### Risk #2: Python/Rust/JavaScript Desync 🔴

**Scenario:** Python generates font with one ordering, Rust lookup tables use different ordering.

**Example:**
```python
# generate.py (after migration)
accidental_order = atoms_yaml['glyph_variants']['accidental_order']  # [natural, flat, ...]

# build.rs (forgot to update!)
const ACCIDENTAL_TYPES: [&str; 6] = ["natural", "sharp", "flat", ...];  # ❌ WRONG ORDER
```

**Impact:**
- Font has flat at variant_index 1
- Rust code looks up sharp at variant_index 1
- **JavaScript displays wrong glyphs for all accidentals**
- **Silent data corruption** (no compile error, just wrong output)

**Probability:** HIGH (easy to forget to update all three layers)

**Mitigation:**
1. ✅ **Single source of truth** - atoms.yaml generates BOTH Python and Rust
2. ✅ **Compile-time validation** - build.rs reads atoms.yaml, generates constants
3. ✅ **Cross-layer tests** - E2E test verifies Python-generated font matches Rust lookups
4. ✅ **Hash-based validation** - Embed ordering hash in font, verify at runtime

**Code:**
```rust
// build.rs - auto-generate from atoms.yaml
let atoms_yaml = fs::read_to_string("tools/fontgen/atoms.yaml")?;
let config: AtomsConfig = serde_yaml::from_str(&atoms_yaml)?;

// Generate Rust constants from YAML (single source of truth)
writeln!(out, "const ACCIDENTAL_ORDER: &[&str] = &{:?};", config.glyph_variants.accidental_order)?;
writeln!(out, "const OCTAVE_ORDER: &[i8] = &{:?};", config.glyph_variants.octave_order)?;
```

---

### Risk #3: Glyph Width Changes Break Layout 🔴

**Scenario:** Extracting positioning magic numbers changes glyph rendering.

**Example:**
```yaml
# OLD (hardcoded in Python):
dot_x_offset = bx_min + (base_width - dot_width) / 2 - dx_min + (dot_width * 0.8)

# NEW (extracted to YAML):
geometry:
  dots:
    horizontal_offset_ratio: 0.75  # ❌ Typo! Was 0.8
```

**Impact:**
- All octave dots shift left by 5%
- Existing documents look different
- User thinks fonts are broken

**Probability:** MEDIUM (typo during extraction)

**Mitigation:**
1. ✅ **Visual regression tests** - Snapshot rendered glyphs before/after migration
2. ✅ **Pixel-perfect comparison** - Export glyphs to SVG, compare against baseline
3. ✅ **Font Test tab verification** - Manual visual check of all variants
4. ✅ **Default to old values** - Use hardcoded values as defaults, YAML overrides

**Code:**
```python
# test_visual_regression.py
def test_glyph_visual_unchanged():
    old_font = fontforge.open("artifacts/baseline/NotationFont-Number.ttf")
    new_font = fontforge.open("dist/fonts/NotationFont-Number.ttf")

    for cp in range(0xE000, 0xE0D2):  # All Number system glyphs
        old_svg = export_glyph_svg(old_font[cp])
        new_svg = export_glyph_svg(new_font[cp])
        assert old_svg == new_svg, f"Glyph U+{cp:04X} changed!"
```

---

## HIGH RISKS

### Risk #4: YAML Parsing Failures 🟠

**Scenario:** Invalid YAML syntax crashes font generation.

**Example:**
```yaml
# Typo: missing colon
geometry
  dots:
    horizontal_offset_ratio: 0.8
```

**Impact:**
- `make fonts` fails
- Application won't build
- Development blocked

**Probability:** MEDIUM (typos during editing)

**Mitigation:**
1. ✅ **JSON Schema validation** - Validate YAML structure before processing
2. ✅ **Clear error messages** - Show line number and expected format
3. ✅ **CI/CD checks** - Fail fast in CI if atoms.yaml is invalid
4. ✅ **Editor integration** - Use YAML language server for autocomplete

---

### Risk #5: Build.rs Complexity Explosion 🟠

**Scenario:** build.rs becomes unreadable with YAML parsing, code generation, validation.

**Example:**
```rust
// build.rs (after migration) - 500+ lines of complex logic
fn generate_rust_constants(atoms_yaml: &AtomsConfig) -> Result<String> {
    // Parse YAML
    // Validate ordering
    // Generate accidental enums
    // Generate octave mappings
    // Generate lookup tables
    // Validate cross-references
    // ... (too complex!)
}
```

**Impact:**
- Build.rs becomes unmaintainable
- Developers afraid to touch it
- Bugs accumulate

**Probability:** MEDIUM (scope creep during implementation)

**Mitigation:**
1. ✅ **Keep build.rs simple** - Only read YAML, generate constants
2. ✅ **Extract to separate tool** - `tools/fontgen/validate_atoms.py` does heavy lifting
3. ✅ **Limit code generation** - Only generate simple const arrays, not complex logic
4. ✅ **Document thoroughly** - Explain WHY each generated constant exists

---

## MEDIUM RISKS

### Risk #6: Migration Incompleteness 🟡

**Scenario:** Some magic numbers moved to YAML, others still hardcoded.

**Example:**
```python
# Moved to YAML:
slash_width = config['geometry']['slash']['stroke_width']

# Forgot to move:
slash_y_bottom = 200  # ❌ Still hardcoded!
```

**Impact:**
- Inconsistent configuration
- Developers confused about where to change values
- Incomplete migration benefits

**Probability:** HIGH (easy to miss some magic numbers)

**Mitigation:**
1. ✅ **Grep for magic numbers** - Search codebase for numeric literals
2. ✅ **Checklist migration** - Track each magic number individually
3. ✅ **Strict mode** - `--strict` flag requires ALL values in YAML
4. ✅ **Code review** - Manual review of changes

---

### Risk #7: Performance Regression 🟡

**Scenario:** YAML parsing adds significant build time.

**Impact:**
- `make fonts` takes 2x longer
- Slow development iteration

**Probability:** LOW (YAML parsing is fast)

**Mitigation:**
1. ✅ **Cache parsed YAML** - Parse once, reuse
2. ✅ **Benchmark before/after** - Measure build time impact
3. ✅ **Profile if slow** - Identify bottlenecks

---

## LOW RISKS

### Risk #8: Schema Evolution 🟢

**Scenario:** Need to add new fields to atoms.yaml, breaking old configs.

**Impact:**
- Old atoms.yaml files don't work with new generator

**Probability:** LOW (planned evolution)

**Mitigation:**
1. ✅ **Semantic versioning** - Add `schema_version: 2` to atoms.yaml
2. ✅ **Backward compatibility** - Support multiple schema versions
3. ✅ **Migration scripts** - Auto-upgrade old YAML to new format

---

## Risk Mitigation Strategy

### Phase 1: Preparation (No Code Changes)

1. **Create baseline snapshots** ✅
   ```bash
   # Save current font output as "known-good"
   cp dist/fonts/NotationFont-Number.ttf artifacts/baseline/
   python3 tools/fontgen/export_all_glyphs.py > artifacts/baseline/glyphs.json
   ```

2. **Write validation tests** ✅
   ```python
   # tests/test_font_unchanged.py
   def test_all_glyphs_unchanged():
       baseline = load_baseline_glyphs()
       current = load_current_glyphs()
       assert baseline == current
   ```

3. **Document current behavior** ✅
   - Why is octave order `[0, -2, -1, 1, 2]`?
   - Why does "3" need 17% shift but "4" only 4%?
   - Capture tribal knowledge BEFORE changing code

### Phase 2: Minimal Viable Migration

**Strategy:** Move ONE magic number at a time, validate at each step.

**Example (slash width):**
```yaml
# Step 1: Add to YAML (keep Python default)
geometry:
  slash:
    stroke_width: 80

# Step 2: Update Python (with fallback)
slash_width = config.get('geometry', {}).get('slash', {}).get('stroke_width', 80)

# Step 3: Validate unchanged
assert new_font[0xE00A].width == old_font[0xE00A].width

# Step 4: Remove Python default
slash_width = config['geometry']['slash']['stroke_width']  # Required now
```

**Benefits:**
- Each step is reversible
- Easy to identify which change broke something
- Low risk per iteration

### Phase 3: Validation Gates

**Pre-commit hooks:**
```bash
#!/bin/bash
# .git/hooks/pre-commit
python3 tools/fontgen/validate_atoms.py --strict || exit 1
make fonts || exit 1
python3 tests/test_font_unchanged.py || exit 1
```

**CI/CD pipeline:**
```yaml
# .github/workflows/fonts.yml
jobs:
  validate-fonts:
    steps:
      - name: Generate fonts
        run: make fonts

      - name: Visual regression test
        run: python3 tests/test_visual_regression.py

      - name: Codepoint validation
        run: python3 tests/test_codepoint_stability.py

      - name: Cross-layer sync check
        run: python3 tests/test_rust_python_sync.py
```

---

## Rollback Plan

If migration goes wrong:

1. **Git revert** - All changes in feature branch, easy rollback
2. **Keep old fonts** - artifacts/baseline/ has known-good fonts
3. **Document rollback procedure** - Step-by-step instructions
4. **Test rollback** - Practice rollback before migration starts

---

## Risk Acceptance Criteria

**DO NOT PROCEED** with migration unless:

1. ✅ Baseline snapshots captured (fonts + glyph JSON)
2. ✅ Visual regression tests written
3. ✅ Codepoint stability tests written
4. ✅ Cross-layer sync validation written
5. ✅ Rollback plan documented and tested
6. ✅ Team reviewed risk analysis
7. ✅ Time allocated (4-5 weeks + 1 week buffer)

**STOP IMMEDIATELY** if:

1. ❌ Any glyph changes visually (not just codepoint)
2. ❌ Any codepoint mapping changes
3. ❌ Build time increases >50%
4. ❌ Tests fail after migration
5. ❌ Team loses confidence in changes

---

## Recommended Approach

**Option A: Full Migration (HIGH RISK, HIGH REWARD)**
- 4-5 weeks effort
- All magic numbers moved to YAML
- Maximum flexibility
- Risk: High complexity, potential for breakage

**Option B: Incremental Migration (MEDIUM RISK, MEDIUM REWARD)** ⭐ **RECOMMENDED**
- Phase 1: Extract ONLY positioning adjustments (1-2 weeks)
- Phase 2: Add validation (3 days)
- Pause, evaluate, decide whether to continue
- Risk: Lower complexity, proven at each step

**Option C: Status Quo (LOW RISK, LOW REWARD)**
- No changes
- Keep magic numbers hardcoded
- Add comments explaining each value
- Risk: System remains difficult to extend

---

## Conclusion

**Migration is HIGH RISK but MANAGEABLE** with proper validation and incremental approach.

**Key Success Factors:**
1. ✅ Comprehensive baseline snapshots
2. ✅ Automated visual regression tests
3. ✅ Incremental migration (one magic number at a time)
4. ✅ Validation at every step
5. ✅ Clear rollback plan

**Red Flags (ABORT):**
- Any existing document renders differently
- Any codepoint mapping changes
- Cross-layer desync discovered late
- Team loses confidence

**Estimated Probability of Success:**
- **With full validation:** 85%
- **With incremental approach:** 95%
- **Without validation:** 40% (NOT RECOMMENDED)

**Recommendation:** Proceed with **Option B (Incremental Migration)** and **full validation suite**.

---

**END OF RISK ANALYSIS**
