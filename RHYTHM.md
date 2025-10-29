# Spatial Rhythmic Notation System

## Overview

The core innovation of this notation system is using **horizontal space to represent musical time**. This document details the most complex aspect of the parser: converting spatial layout into precise rhythmic durations.

## Fundamental Concept

### Traditional vs. Spatial Notation

**Traditional Western Notation:**
```
♪ ♫ ♪    (uses note shapes for duration)
```

**Spatial Rhythmic Notation:**
```
S--r --g-    (uses horizontal space for duration)
```

The key insight: **Physical distance on the page = Musical time duration**

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
- **Rhythmic extensions** when following a pitch (extending the previous note's duration)
- **Rests** when appearing alone or in groups without a preceding pitch

This two-stage approach (lexical tokenization → rhythmic interpretation) allows the parser to maintain spatial relationships while correctly generating musical durations in the final output.

### 2. Beat Grouping

Spaces separate individual **beats** within a measure:
```
S--r  g-m-  P---
│     │     │
│     │     └─ Beat 3 (4 subdivisions)
│     └─────── Beat 2 (4 subdivisions) 
└─────────── Beat 1 (4 subdivisions)
```

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

**Input:** `--S-r`

**Processing:**
1. **Beat Detection:** 1 beat, 5 subdivisions
2. **Dash Consumption:**
   - First `--` = 2/5 rest
   - S gets position 3,4 → 2/5
   - r gets position 5 → 1/5
3. **LilyPond Output:** Uses tuplets for irregular divisions

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

Focuses on the core spatial→temporal conversion:

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

### Proportional Time

The system implements **proportional notation** where:
- Horizontal distance ∝ Time duration
- Character count = Rhythmic subdivision
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

- **Node Tree:** Hierarchical structure preserves spatial relationships
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

Verify end-to-end conversion from spatial notation to valid LilyPond:

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

The spatial rhythmic notation system represents a fundamental reimagining of how musical time can be represented in text, bridging the gap between intuitive spatial relationships and precise mathematical timing.