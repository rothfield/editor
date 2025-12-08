# Research Report: Tonic vs. Key Signature in Non-Diatonic Music Notation

**Date:** 2025-11-25
**Purpose:** Understanding best practices for notating modal, microtonal, and non-Western music systems

---

## Executive Summary

This research examined how professional music notation handles the separation of **tonic** (the melodic/harmonic center) and **key signature** (visual accidental display) in non-diatonic musical traditions. The investigation covered:

- **Maqam music** (Arabic/Turkish)
- **Modal music** (Dorian, Phrygian, Mixolydian, etc.)
- **Hungarian folk music** (nota, verbunkos)
- **Ethnomusicological practices** (Bartók, Kodály, Brăiloiu)

**Key Finding:** The separation of tonic and key signature is not only justified but **essential** for accurately representing non-Western and modal music traditions.

---

## 1. Modal Music (Church Modes)

### Notation Approaches

There are **two competing approaches** for notating modal music:

#### **Approach A: Parallel Key Signatures** (Based on Tonic)
- D Dorian uses **D minor key signature** (1 flat: B♭), with B♮ added as accidentals
- E Phrygian uses **E minor key signature** (1 sharp: F♯), with F♮ added as accidentals
- G Mixolydian uses **G major key signature** (1 sharp: F♯), with F♮ added as accidentals

**Problem:** Generates many accidentals, defeating the purpose of key signatures.

#### **Approach B: Relative Key Signatures** (Minimize Accidentals)
- D Dorian uses **C major key signature** (no sharps/flats), since D is the 2nd degree of C major
- A Mixolydian uses **G major key signature** (F♯), since A is the 2nd degree of G major
- E Phrygian uses **D major key signature** (F♯, C♯), since E is the 2nd degree of D major

**Problem:** The key signature doesn't match the tonic, creating visual confusion about the tonal center.

### Modal Music Conclusion

**Neither approach is universally accepted.** The choice depends on:
- Performance context (jazz vs. classical vs. folk)
- Pedagogical goals (teaching modal thinking vs. minimizing accidentals)
- Prevalence of modulation (frequent mode changes favor relative approach)

**Implication for our editor:** Separating tonic from key signature allows users to choose either approach or create hybrid solutions.

---

## 2. Maqam Music (Arabic)

### Notation System

Arabic maqam uses **24-tone equal temperament** for notation (quarter-tones), though actual intonation is more nuanced and learned aurally.

**Key Signature Practice:**
- Maqams use the **key signature of their family** or neighboring family
- **Accidentals throughout** indicate deviations from the family scale
- The **title often indicates the specific maqam**, not the key signature

### Example: Maqam Hijaz (Hejaz)

Maqam Hijaz has the interval structure: **1 - ♭2 - 3 - 4 - 5 - ♭6 - ♭7**

**In D Hijaz:**
- Scale: D - E♭ - F♯ - G - A - B♭ - C
- Typical key signature: **1 flat (B♭)** or **2 flats (B♭, E♭)**
- Accidentals: F♯ and C♮ marked throughout

**Key insight:** The key signature provides a **rough framework**, not an exact specification. The tonic (D) is understood from context and melodic patterns, not from the key signature.

### Microtonal Notation

Quarter-tones (half-flats, half-sharps) use special symbols:
- **Half-flat:** ♭ with a slash or special quarter-flat symbol
- **Half-sharp:** ♯ with a slash or special quarter-sharp symbol

**LilyPond supports over 200 maqam key signatures**, each with specific tonic (karar) and family characteristics.

### Modulation Between Maqams

Pieces that **switch maqams frequently** (common in improvisatory *taqsim* sections):
- Often use **no key signature** (or minimal signature)
- **All accidentals written explicitly**
- Performer relies on **modal understanding** and **tonic awareness**, not key signature

**Critical point:** The **tonic is melodically determined**, not by key signature. The maqam's characteristic intervals and seyir (melodic route) define the mode, not the visual key signature.

---

## 3. Turkish Makam Music

### Notation System

Turkish makam uses **53-tone equal temperament** (53-TET) for notation, though only 24 of 53 commas are commonly used in practice.

**Microtonal notation:**
- Intervals expressed as multiples of **1/9 tone** (commas)
- Notation: `^1, ^2, ^3, ^4, ^5` indicate microtonal alterations
- MIDI: Octave divided into 53 equal divisions

### Key Signature Practice

**LilyPond supports 200+ makam key signatures**, each with:
- Specific **tonic/finalis** (karar)
- Characteristic **intervallic structure**
- **Melodic development patterns** (seyir)

**Example: Makam Hüseyni**
- Tonic: A
- Key signature might show D major (F♯, C♯)
- But the **melodic center is A**, not D
- Performer navigates by **makam knowledge**, not key signature

### Modulation (Geçki)

Turkish makam compositions frequently modulate to related makams:
- Key signature **may change** or **may stay the same**
- **Accidentals indicate the transition**
- The **new tonic** is established melodically, not by key signature change

**Implication:** Tonic and key signature serve **different musical functions** in makam music.

---

## 4. Hungarian Folk Music (Nota, Verbunkos)

### Bartók and Kodály's Ethnomusicological Methods

Béla Bartók and Zoltán Kodály developed systematic methods for **transcribing Hungarian folk music**:

**Notation innovations:**
- **Unconventional key signatures** (not matching Western major/minor)
- **Articulatory signs** for ornamentation and vocal production
- **Pedal indications** for drone-like accompaniment
- **Frequent changes in rhythm and tempo** marked explicitly

### Hungarian Minor (Gypsy Scale)

**Interval structure:** W - H - + - H - H - + - H
(W = whole step, H = half step, + = augmented second)

**In C Hungarian Minor:**
- Scale: C - D - E♭ - F♯ - G - A♭ - B
- Contains **two augmented seconds** (E♭→F♯ and A♭→B)

**Key Signature Practice:**

#### Example 1: Liszt's Hungarian Rhapsody No. 2
- Written with **6 sharps** (F♯ major key signature)
- Requires **numerous accidentals** to create the Hungarian minor intervals
- The key signature is a **starting point**, not a complete description

#### Example 2: Brahms' Hungarian Dance No. 5
- Written in **D minor** (1 flat: B♭)
- Frequent use of **F♯** and **C♯** creates the Hungarian flavor
- The tonic (D) remains stable, but the key signature doesn't capture the modal character

**Bartók's approach:**
- Used **minimal key signatures** (often none)
- Wrote **all accidentals explicitly**
- Emphasized that folk scales **don't fit Western major/minor** categories

**Critical insight:** Bartók argued that imposing Western key signature conventions on folk music **distorts the modal character**. The tonic is a **melodic anchor**, while the key signature is a **notational convenience**.

---

## 5. Ethnomusicological Practices

### Bartók's Transcription Principles

From "Problems of Ethnomusicology" and ethnomusicological studies:

**Notation system features:**
1. **No assumed key signature** - write what you hear, not what fits theory
2. **Microtonal indicators** - small arrows, cent deviations, quarter-tone symbols
3. **Rhythmic precision** - dotted barlines for metric ambiguity
4. **Melodic contour** - graph-like representations for unclear pitch

**Philosophy:** Notation should **document performance**, not force it into Western theoretical categories.

### Kodály's Approach

Kodály's folk music collections used:
- **Relative solmization** (movable-do solfège) separate from key signature
- **Modal finals** (tonic) indicated separately from visual accidentals
- **Pedagogical notation** distinguishing "what children sing" from "how we write it"

### Constantin Brăiloiu's "Synoptic Transcription"

Brăiloiu developed methods for transcribing **variants** of the same folk melody:
- **No fixed key signature** across variants
- **Tonic pitch** marked explicitly
- **Accidentals relative to the tonic**, not to a key signature
- Focus on **intervallic relationships**, not absolute pitch classes

**Example from Romanian folk music:**
- Same melody sung in different villages with different pitch levels
- Tonic: G in one village, A in another, F in a third
- Key signature (if any) is **irrelevant** to the melodic identity
- What matters: **scale degrees relative to tonic**

---

## 6. Contemporary Notation Software

### LilyPond

**Supports explicit separation:**
```lilypond
\key d \major        % Key signature (2 sharps)
tonic = d           % Melodic center (separate property)
```

**Arabic/Turkish music modules:**
- 200+ predefined maqam/makam key signatures
- Each has **independent tonic** (karar) specification
- Microtonal accidentals beyond key signature

### MuseScore, Finale, Sibelius

Most commercial software **conflates key signature and tonic**:
- Key signature determines harmonic analysis
- Transposition assumes key signature = tonic
- **Limited support** for modal/maqam music

**Workaround:** Users often set key signature to **C major** (no accidentals) and write everything explicitly with accidentals, then manually specify the tonic for analysis purposes.

---

## 7. Practical Examples of Tonic/Key Signature Independence

### Case 1: D Dorian (Modal Jazz)

**Tonic:** D
**Key signature options:**
- **Option A:** D minor (1 flat) — matches tonic, requires B♮ accidentals
- **Option B:** C major (no sharps/flats) — minimizes accidentals, obscures tonic
- **Option C:** No key signature — write all accidentals explicitly

**Professional practice (Real Book, jazz charts):** Usually **Option B** (C major signature) with "D Dorian" written as text instruction.

**Why separate?** The performer needs to know:
1. **Tonic = D** (for improvisation, chord voicings)
2. **Key signature = C major** (for reading convenience)

### Case 2: Maqam Bayati in D

**Tonic:** D
**Scale:** D - E♭ - F - G - A - B♭ - C
**Key signature:** Typically **2 flats** (B♭, E♭)
**Accidentals needed:** F♮ throughout

**Why separate?**
- Key signature indicates **maqam family** (Bayati group)
- Tonic (D) indicates **specific transposition**
- Melodic development (seyir) depends on tonic, not key signature

### Case 3: Turkish Makam Hicaz in G

**Tonic:** G
**Microtonal scale:** G - A♭ - B - C - D - E♭ - F
(with quarter-tone adjustments on A♭ and E♭)

**Key signature:** Variable
- Some editions use **3 flats** (B♭, E♭, A♭)
- Some use **no key signature** and write everything explicitly

**Microtonal markings:** Half-flat symbols on A and E

**Why separate?**
- Tonic (G) is the **melodic anchor**
- Key signature is a **starting approximation**
- Microtonal accidentals **override** key signature assumptions

### Case 4: Bartók's "Mikrokosmos" No. 109 (In F# Minor)

**Tonic:** F♯
**Key signature:** **No sharps or flats**
**Actual pitches:** F♯ - G♯ - A - B - C♯ - D - E♯

**Why?**
- Bartók wanted performers to **think in absolute pitch**, not relative to a key
- The tonic (F♯) is **melodically obvious** from the bass notes and cadences
- No key signature forces **conscious awareness** of each pitch

---

## 8. The Confusion: Why Separate Tonic and Key Signature?

### Historical Context

Western classical music (1600-1900) established a **strong coupling** between tonic and key signature:
- **C major:** C is tonic, no sharps/flats
- **G major:** G is tonic, 1 sharp (F♯)
- **D major:** D is tonic, 2 sharps (F♯, C♯)

This worked because Western harmony was **functionally tonal** with clear major/minor modes.

### The Problem with Non-Western/Modal Music

**1. Modal music** doesn't have "dominant → tonic" functional harmony
**2. Maqam/makam** have microtonal intervals beyond 12-TET
**3. Folk music** often uses scales that don't fit major/minor
**4. Frequent modulation** makes key signature changes impractical

**Solution:** Decouple tonic (melodic center) from key signature (notational convenience).

---

## 9. Best Practices: Summary of Findings

### For Modal Music (Dorian, Phrygian, Mixolydian, etc.)

**Recommendation:**
- **Tonic:** Explicitly specify (e.g., "D Dorian")
- **Key signature:** Use relative approach (minimize accidentals) OR no key signature
- **Reason:** Modal music doesn't modulate to dominant/subdominant like tonal music

**Example:**
- Piece in A Mixolydian
- Tonic = A
- Key signature = G major (1 sharp: F♯)
- Result: F♯ in signature, G♮ written as accidental when needed

### For Maqam/Makam Music

**Recommendation:**
- **Tonic:** Specify maqam name + tonic pitch (e.g., "Maqam Hijaz on D")
- **Key signature:** Use family signature OR no signature
- **Microtonal accidentals:** Write explicitly (half-flats, half-sharps)
- **Reason:** Maqam identity comes from intervallic patterns, not key signature

**Example:**
- Maqam Rast on C
- Tonic = C
- Key signature = No sharps/flats (or 1 flat)
- Microtonal accidentals: E half-flat, B half-flat throughout

### For Hungarian/Eastern European Folk Music

**Recommendation (Bartók method):**
- **Tonic:** Marked explicitly or obvious from melodic structure
- **Key signature:** Minimal or none
- **All accidentals:** Written explicitly
- **Reason:** Exotic scales (double augmented 2nds, etc.) don't fit standard signatures

**Example:**
- Hungarian minor in D
- Tonic = D
- Key signature = None (or D minor as approximation)
- Write all accidentals: E♭, F♯, A♭, B throughout

### For Frequent Modulation

**Recommendation:**
- **No key signature** (or C major baseline)
- **Write all accidentals explicitly**
- **Mark tonic changes** with text ("→ G", "modulate to Hijaz", etc.)
- **Reason:** Constant key signature changes are harder to read than accidentals

---

## 10. Implications for Our Editor

### Current Architecture is Correct

The decision to **separate `tonic` and `key_signature` as independent fields** aligns with professional notation practices for:
- Modal music
- Maqam/makam music
- Folk music transcription
- Contemporary art music
- Jazz and improvisatory traditions

### Recommended Workflow

**For users:**
1. **Set tonic** → controls pitch transposition and scale degree interpretation
2. **Set key signature** (optional) → controls visual accidentals at staff start
3. **Accidentals** → written explicitly as needed

**Example use cases:**

#### Use Case 1: Jazz in D Dorian
```
setDocumentTonic('D')              // Tonic = D
setDocumentKeySignature('C')       // Key signature = C major (no sharps/flats)
// Input: 1 2 3 4 5 6 7
// Output: D E F G A B C (with B♮ written as accidental)
```

#### Use Case 2: Maqam Bayati in D
```
setDocumentTonic('D')              // Tonic = D
setDocumentKeySignature('Bb,Eb')   // 2 flats
// Input: 1 ♭2 ♮3 4 5 ♭6 ♭7
// Output: D E♭ F G A B♭ C (F requires ♮)
```

#### Use Case 3: Bartók-style (no key signature)
```
setDocumentTonic('F#')             // Tonic = F♯
setDocumentKeySignature(null)      // No key signature
// Input: 1 2 3 4 5 6 7
// Output: F♯ G♯ A B C♯ D E♯ (all accidentals explicit)
```

### UI/UX Recommendations

**To reduce user confusion:**

1. **Label clearly:**
   - "Tonic (melodic center)"
   - "Key Signature (visual accidentals)"

2. **Provide presets:**
   - "D Dorian" → sets tonic=D, key_signature=C
   - "Maqam Hijaz in D" → sets tonic=D, key_signature=Bb,Eb
   - "Hungarian Minor in C" → sets tonic=C, key_signature=none

3. **Educational tooltips:**
   - "Tonic controls transposition and scale degree meaning"
   - "Key signature is optional and only affects visual display"

4. **Validation warnings:**
   - If key_signature and tonic mismatch in a confusing way, show hint:
     "Tonic is D but key signature is C major. This is correct for D Dorian mode."

---

## 11. Conclusion

The research confirms that **separating tonic from key signature is essential** for accurately notating:
- Modal music (church modes, jazz modes)
- Maqam music (Arabic, Turkish, Persian)
- Makam music (Ottoman classical, Turkish folk)
- Hungarian and Eastern European folk music
- Contemporary art music and experimental tunings

**The confusion exists** because Western tonal music (major/minor) historically coupled these concepts. But **professional notation practice** in ethnomusicology, modal jazz, and world music has long recognized their independence.

**Our editor's architecture is correct and aligns with best practices.**

---

## References

### Key Sources Consulted

1. **LilyPond Notation Reference** - Arabic and Turkish music notation
2. **Music: Practice & Theory Stack Exchange** - Modal key signature discussions
3. **Béla Bartók ethnomusicological transcriptions** - Hungarian folk music methods
4. **Constantin Brăiloiu** - Synoptic transcription and folk music analysis
5. **Zoltán Kodály** - Hungarian folk song collections and notation methods
6. **Karl Signell** - "Makam: Modal Practice in Turkish Art Music"
7. **LilyPond Turkish and Arabic music modules** - 200+ maqam/makam key signatures

### Further Reading

- Bartók, Béla. *The Hungarian Folk Song* (1931)
- Signell, Karl. *Makam: Modal Practice in Turkish Art Music* (1977)
- Touma, Habib Hassan. *The Music of the Arabs* (1996)
- Brăiloiu, Constantin. *Problems of Ethnomusicology* (1984)
- Powers, Harold S. "Mode" in *New Grove Dictionary of Music and Musicians*

---

**Report compiled:** 2025-11-25
**Research scope:** Web search of scholarly sources, notation software documentation, and professional music theory resources
