# Pulse/Subdivision Notation System

## Overview

This notation system uses **horizontal space to represent musical pulses and subdivisions**, a well-established approach commonly used in drum notation and rhythm pedagogy. This document details the most complex aspect of the parser: converting pulse/subdivision layout into precise rhythmic durations.

## Fundamental Concept

### Traditional vs. Pulse/Subdivision Notation

**Traditional Western Notation:**
```
♪ ♫ ♪    (uses note shapes for duration)
```

**Pulse/Subdivision Notation:**
```
S--r --g-    (uses horizontal space for pulses and subdivisions)
```

The key principle: **Each character = one subdivision of the pulse; spaces separate pulses (beats)**

## Core Principles

### 1. Dash-Based Duration

Dashes (`-`) serve as **rhythmic placeholders**:
- Each dash represents one time subdivision
- A pitch followed by dashes gets extended duration
- Consecutive dashes create rests

```
S      = 1 time unit
S-     = 2 time units  
S--    = 3 time units
S---   = 4 time units
```

**Important:** In the lexer, dashes are tokenized as individual PITCH tokens (not flat accidentals). During staff notation conversion, these dash tokens are processed as:
- **Rhythmic extensions** when there is a preceding pitch (extending the previous note's duration)
- **Rests** ONLY when there is NO preceding pitch

**Critical Rule: When Dashes Become Rests vs. Extensions**

Dashes become **rests** ONLY in these cases:
1. **No previous pitch** - Dashes at the very beginning of a line with no preceding note
2. **After a breath mark** - Breath marks reset the pitch context, so following dashes are rests
3. **After end of line** - New line starts with no pitch context

**Spaces (beat boundaries) do NOT reset the pitch context!** Dashes at the start of a beat will extend the previous note if there was a pitch before them.

**Default Behavior: Dashes Always Extend**

Otherwise, dashes always extend the previous pitch. This is represented in traditional music notation using **ties** - a fundamental feature of music notation that connects notes across beats, measures, or any rhythmic boundary.

Example: `1--2 --3-`
- Beat 1: `1--2` → "1" gets 3 subdivisions (dotted), "2" gets 1 subdivision
- Beat 2: `--3-` → The leading `--` **extends the previous "2"** (not a rest!), then "3" gets remaining subdivisions
- Result: `c8. d16~ d4 e4` (the "2" ties across the beat boundary)
- The tie (`~`) is a standard music notation element that extends notes beyond their written duration

This two-stage approach (lexical tokenization → rhythmic interpretation) allows the parser to maintain pulse/subdivision relationships while correctly generating musical durations in the final output.

### Breath Marks Reset Pitch Context

**The breath mark `'` is critical for controlling when dashes become rests.**

When a breath mark appears after a pitch, it **resets the pitch context**, causing following dashes to be **collected together into a rest** instead of extending the previous pitch.

**Dash Collection Behavior:**
- **After a pitch (no breath mark):** Consecutive dashes are collected to extend that pitch duration
- **After a breath mark:** Consecutive dashes are collected into a **single rest** of that total duration

**Examples:**

| Input | Output | Explanation |
|-------|--------|-------------|
| `1' -` | `c4 r4` | Breath mark resets context → 1 dash = quarter rest |
| `1' ---2` | `c4 r4. d8` | Breath mark → 3 dashes collected into dotted quarter rest |
| `1 -` | `c4~ c4` | No breath mark → dash extends note (tie across beats) |
| `1 ---` | `c4~ c4` | No breath mark → 3 dashes extend pitch (beat 1: c4, beat 2: 3 dashes = c4 tied) |
| `1---` | `c4` | Single beat: 1+3 dashes = 4 subdivisions = 1 quarter note |
| `1' 1` | `c4 c4` | Breath mark separates two distinct notes |
| `1 2' --3- --4-` | `c4 d4 r8 e8~ e8 f8` | "2" has breath mark → 2 dashes = eighth rest; "3" has no breath mark → 2 dashes extend "3" (tie) |

**Key Principle:**
- Dashes are always **collected consecutively** (whether for extensions or rests)
- The breath mark determines whether collected dashes extend a pitch or become a rest
- This mirrors the dash extension behavior: just as `1---` collects 3 dashes to extend pitch duration, `1' ---` collects 3 dashes to create rest duration

This allows precise control over articulation and phrasing in the pulse/subdivision notation system.

### 2. Beat Grouping

Spaces separate individual **beats** within a measure:
```
S--r  g-m-  P---
│     │     │
│     │     └─ Beat 3 (4 subdivisions)
│     └─────── Beat 2 (4 subdivisions)
└─────────── Beat 1 (4 subdivisions)
```

**See `src/parse/GRAMMAR.md` for the formal beat grammar.**

Key points:
- A beat must contain at least one **timed-element** (pitch or dash)
- Grace notes (superscripts) are **rhythm-transparent**: attached to beats but not part of them
- Underlines span timed-elements only; superscripts don't count toward subdivisions

### 3. Subdivision Counting

Within each beat, count **all characters** (pitches + dashes):
```
S--r = 4 characters = 4 subdivisions
  S gets positions 1,2,3 → 3/4 of the beat
  r gets position 4     → 1/4 of the beat
```

## Processing Algorithm

### Phase 1: Beat Detection

**Input:** `S--r  g-m-  P---`

**Algorithm:**
1. Split on spaces to identify beats
2. For each beat, count total characters
3. Track consecutive dashes vs. pitches

**Output:**
```rust
Beat 1: ["S", "-", "-", "r"] → 4 subdivisions
Beat 2: ["g", "-", "m", "-"] → 4 subdivisions  
Beat 3: ["P", "-", "-", "-"] → 4 subdivisions
```

### Phase 2: Dash Consumption

**Problem:** Avoid double-counting dashes that extend previous pitches

**Algorithm:**
```rust
fn process_beat(elements: Vec<Element>) -> Vec<(Pitch, Duration)> {
    let mut results = Vec::new();
    let mut i = 0;
    
    while i < elements.len() {
        if elements[i].is_pitch() {
            let mut duration = 1; // The pitch itself
            
            // Count trailing dashes
            while i + duration < elements.len() && 
                  elements[i + duration].is_dash() {
                duration += 1;
            }
            
            results.push((elements[i].pitch(), duration));
            i += duration; // Skip consumed dashes
        } else if elements[i].is_dash() {
            // Unconsumed dash = rest
            results.push((Rest, 1));
            i += 1;
        }
    }
    results
}
```

### Phase 3: Fractional Conversion

Convert subdivisions to musical fractions:

```rust
fn subdivision_to_fraction(subdivisions: usize, total_subdivisions: usize) -> Fraction {
    Fraction::new(subdivisions, total_subdivisions)
}
```

**Example:** `S--r` (4 total subdivisions)
- S: 3 subdivisions → 3/4 fraction
- r: 1 subdivision → 1/4 fraction

### Phase 4: LilyPond Duration Mapping

Map fractions to LilyPond note values:

```rust
let fraction_to_lilypond = HashMap::from([
    (Fraction::new(1, 1), "1"),    // whole note
    (Fraction::new(1, 2), "2"),    // half note  
    (Fraction::new(1, 4), "4"),    // quarter note
    (Fraction::new(1, 8), "8"),    // eighth note
    (Fraction::new(3, 8), "8."),   // dotted eighth
    (Fraction::new(5, 8), "4 16"), // quarter tied to sixteenth
]);
```

## Complex Examples

### Example 1: Uneven Subdivisions

**Input:** `S---R--g`

**Processing:**
1. **Beat Detection:** 1 beat, 8 subdivisions
2. **Dash Consumption:**
   - S gets positions 1,2,3,4 → 4/8 = 1/2
   - R gets positions 5,6,7 → 3/8  
   - g gets position 8 → 1/8
3. **LilyPond Output:** `c4 d8. e8`

### Example 2: Leading Rests

**Input:** `--1- 2---`

**Processing:**
1. **Beat Detection:** 2 beats
   - Beat 1: `--1-` → 4 subdivisions
   - Beat 2: `2---` → 4 subdivisions
2. **Dash Consumption:**
   - Beat 1: First `--` = 2/4 rest (no previous pitch), 1 gets 2/4
   - Beat 2: 2 gets 4/4 (whole beat)
3. **LilyPond Output:** `r8 c8 d4`

### Example 3: Multiple Beats

**Input:** `S-- r-  g-P`

**Processing:**
1. **Beat Detection:** 3 beats
   - Beat 1: `S--` → 3 subdivisions
   - Beat 2: `r-` → 2 subdivisions  
   - Beat 3: `g-P` → 3 subdivisions
2. **Fractional Analysis:**
   - Beat 1: S=3/3=whole beat → quarter note in 4/4
   - Beat 2: r=1/2, rest=1/2 → eighth + eighth rest
   - Beat 3: g=1/3, P=1/3 → triplet eighths

## Advanced Features

### Tuplet Generation

When subdivisions don't match standard note values, use tuplets:

```
S--r = 3 subdivisions = triplet
```

**LilyPond Output:**
```lilypond
\times 2/3 { c4 d8 }
```

### Cross-Beat Ties

Long notes that span multiple beats use ties:

```
S---- r  (S extends beyond beat boundary)
```

**LilyPond Output:**
```lilypond
c4~ c8 d8
```

### Mixed Subdivisions

Different beats can have different subdivision patterns:

```
S--r  g---m-  P
│     │       │
3+1   4+1+1   1
```

Each beat calculates independently, then normalized to common meter.

## Historical Evolution

### DoremiScript Implementation (Clojure)

The mature doremi-script system used sophisticated state machines:

```clojure
(defn ratio->lilypond-durations [numerator subdivisions]
  (let [ratio (/ numerator subdivisions)]
    (cond 
      (= ratio 1/4) ["4"]
      (= ratio 3/8) ["8."]
      (= ratio 5/8) ["4" "16"]
      ;; Complex table of fraction mappings
      )))
```

Benefits:
- Handled complex irregular subdivisions
- Proper tuplet generation  
- Tie resolution across measures
- Integration with ornaments and articulations

### Current Rust Implementation

Focuses on the core pulse/subdivision→temporal conversion:

```rust
fn fraction_to_lilypond_proper(frac: Fraction) -> Vec<String> {
    match frac {
        f if f == Fraction::new(1, 4) => vec!["4".to_string()],
        f if f == Fraction::new(3, 8) => vec!["8.".to_string()],
        f if f == Fraction::new(5, 8) => vec!["4".to_string(), "16".to_string()],
        // Simplified but robust mapping
    }
}
```

## Mathematical Foundation

### Pulse and Subdivision Model

The system implements **pulse/subdivision notation** where:
- Each character = One subdivision of the pulse
- Character count within a beat = Number of subdivisions
- Fraction arithmetic = Musical duration

### Fraction Arithmetic

```
Beat Duration = Σ(subdivision_durations)
Note Duration = (note_subdivisions / total_subdivisions) × beat_duration
```

### Normalization

Convert all durations to common denominator for consistent output:

```rust
fn normalize_durations(beats: Vec<Beat>) -> Vec<NormalizedBeat> {
    let lcm = calculate_lcm(beats.iter().map(|b| b.subdivisions));
    beats.into_iter().map(|beat| {
        beat.normalize_to_denominator(lcm)
    }).collect()
}
```

## Challenges and Solutions

### Challenge 1: Ambiguous Dash Interpretation

**Problem:** Is `S-R` one beat or two?

**Solution:** Use whitespace as beat delimiter
- `S-R` = 1 beat (3 subdivisions: S=1, dash=1, R=1)
- `S - R` = 2 beats (S=1 beat, R=1 beat with leading rest)

### Challenge 2: Complex Subdivision Ratios

**Problem:** `S----r--g` = 8 subdivisions, irregular grouping

**Solution:** Use LilyPond tuplets and ties
```lilypond
\times 8/8 { c2 d4 e4 }
```

### Challenge 3: Cross-Measure Boundaries

**Problem:** Notes extending beyond barlines

**Solution:** Automatic tie insertion
```
| S---- | r  |  →  | c4~ | c4 d4 |
```

## Performance Considerations

### Algorithmic Complexity

- **Beat Detection:** O(n) where n = input length
- **Dash Consumption:** O(n) single pass through elements  
- **Fraction Calculation:** O(1) arithmetic operations
- **LilyPond Mapping:** O(1) table lookup

### Memory Usage

- **Node Tree:** Hierarchical structure preserves pulse/subdivision relationships
- **Fraction Storage:** Rational arithmetic avoids floating-point errors
- **String Building:** Efficient string concatenation for output

## Testing Strategy

### Unit Tests

```rust
#[test]
fn test_simple_subdivision() {
    let input = "S--r";
    let expected = vec![
        (PitchCode::C, Fraction::new(3, 4)),
        (PitchCode::Db, Fraction::new(1, 4))
    ];
    assert_eq!(parse_rhythm(input), expected);
}
```

### Integration Tests

Verify end-to-end conversion from pulse/subdivision notation to valid LilyPond:

```rust
#[test] 
fn test_complex_rhythm_to_lilypond() {
    let input = "S---r- g--m P";
    let lilypond = convert_to_lilypond(input);
    assert!(lilypond.contains("c8. df16"));
}
```

### Property-Based Testing

Ensure rhythmic conservation:

```rust
#[test]
fn rhythm_duration_conservation() {
    // Total input duration should equal total output duration
    assert_eq!(input_total_duration(), output_total_duration());
}
```

## Future Enhancements

### 1. Advanced Tuplet Support
- Nested tuplets (tuplets within tuplets)
- Cross-rhythm patterns
- Polyrhythmic notation

### 2. Metric Modulation
- Changing subdivisions mid-piece
- Tempo relationships between sections
- Complex meter changes

### 3. Microtonal Rhythms
- Non-standard subdivisions
- Irrational time signatures  
- Spectral rhythm techniques

The pulse/subdivision notation system is commonly used in drum notation and rhythm pedagogy, bridging the gap between intuitive pulse relationships and precise mathematical timing.