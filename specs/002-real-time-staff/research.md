# Research Findings: Staff Notation Rendering

## Decision 1: MusicXML Export Format

**Decision**: Use MusicXML 3.1 format with `score-partwise` root element structure

**Rationale**:
- MusicXML is the industry standard for digital sheet music interchange, supported by all major notation software (MuseScore, Finale, Sibelius, Dorico)
- The `score-partwise` format is the most common structure (measures within parts), preferred by 95%+ of applications
- Version 3.1 provides excellent compatibility while being mature and stable
- The archive project already has a working MusicXML 3.1 exporter that can be ported directly

**Alternatives Considered**:
- **MusicXML 4.0/4.1**: Latest version but less universally supported; 3.1 provides better compatibility
- **MEI (Music Encoding Initiative)**: More academic, less tool support, steeper learning curve
- **ABC Notation**: Simple text format but limited notation capabilities
- **score-timewise**: Alternative MusicXML root structure but rarely used in practice

**Key Requirements**:
- Root element: `<score-partwise version="3.1">`
- Mandatory score header with `<part-list>` containing at least one `<score-part>`
- At least one `<part>` element with measures
- `<attributes>` in first measure: `<divisions>`, `<key>`, `<clef>`
- Note elements: `<pitch>` (step/alter/octave), `<duration>`, `<type>`
- Rest elements: `<rest/>`, `<duration>`, `<type>`
- Support for barlines, ties, beaming, tuplets, system breaks

## Decision 2: OSMD Integration Pattern

**Decision**: Use OpenSheetMusicDisplay (OSMD) 1.7.6+ with IndexedDB caching layer

**Rationale**:
- OSMD is mature, actively maintained TypeScript library for rendering MusicXML in browsers
- Built on VexFlow, providing high-quality engraving without manual positioning
- Version 1.7.6 is stable and production-ready
- Performance: 300-600ms for medium scores, with caching reducing to <50ms
- The archive project has a working OSMD renderer with caching that can be ported directly

**Alternatives Considered**:
- **VexFlow (direct)**: Too low-level, requires manual positioning
- **abcjs**: Only supports ABC notation format
- **Verovio**: Excellent quality but optimized for MEI format
- **Custom Canvas renderer**: Too much development time

**Implementation Notes**:
```javascript
const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(containerId, {
    backend: 'svg',
    autoBeam: true,
    drawTitle: false,
    newSystemFromXML: true
});
await osmd.load(musicXmlString);
osmd.Zoom = 0.5;
await osmd.render();
```

## Decision 3: Code Porting Strategy

**Decision**: Direct port with minimal adaptations - copy helper modules unchanged, rewrite only iteration logic

**Rationale**:
- Archive and current project share nearly identical data structures
- Helper modules (duration, pitch, builder) are pure functions
- Only main export needs rewriting for Cell iteration instead of Node traversal
- Minimizes development time while leveraging proven algorithms

**Modules to Port**:

| Module | Source | Changes | Complexity |
|--------|--------|---------|------------|
| duration.rs | archive | None | Copy |
| pitch.rs | archive | None | Copy |
| builder.rs | archive | None | Copy |
| mod.rs | archive | Medium (rewrite iteration) | Moderate |
| osmd-renderer.js | archive | None | Copy |

**Adaptation Required**:

Archive uses `Node::Root { elements: Vec<Node::Line { elements }> }`
Current uses `Document.lines: Vec<Line { cells: Vec<Cell> }>`

Change: `&[Node]` → `&[Cell]`, match on `cell.kind` instead of enum variants

**Key Challenge**: Current project uses `Pitch` struct with `PitchSystem` enum, archive used 35-variant `PitchCode` enum. Need adapter function to map current model to MusicXML step/alter format.

## Technical Specifications

### MusicXML Minimal Document

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
    "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name></part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>
```

### OSMD API Pattern

```javascript
// Load from CDN
<script src="https://unpkg.com/opensheetmusicdisplay@1.7.6/build/opensheetmusicdisplay.min.js"></script>

// Initialize
const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(containerId, options);

// Render
await osmd.load(musicXmlString);
await osmd.render();

// With caching
const hash = hashMusicXml(musicXmlString);
const cached = await getCachedRender(hash);
if (cached) {
    container.innerHTML = cached;  // <50ms
} else {
    await osmd.render();
    await setCachedRender(hash, container.innerHTML);
}
```

### Performance Characteristics

- **Simple scores** (1-2 measures): 100-200ms
- **Medium scores** (5-10 measures): 300-600ms
- **Large scores** (50+ measures): 1000-2000ms
- **Cached renders**: <50ms (10-20x improvement)

**Optimizations**:
1. IndexedDB caching (hash-based)
2. 100ms debouncing after keystrokes
3. SVG backend for quality
4. Appropriate zoom level (0.5 typical)

## Risks and Mitigations

### Risk 1: Pitch System Incompatibility
**Severity**: Medium
**Mitigation**: Create adapter function mapping current Pitch model to MusicXML step/alter. Focus on Number/Western systems initially. Test thoroughly.

### Risk 2: Performance on Large Documents
**Severity**: Low-Medium
**Mitigation**: IndexedDB caching makes repeats <50ms. Debouncing prevents excessive renders. Most documents under 50 measures (<1s render).

### Risk 3: OSMD Version Compatibility
**Severity**: Low
**Mitigation**: Version 1.7.6 stable and proven. Can upgrade later if needed. Pin CDN version.

### Risk 4: Browser Compatibility
**Severity**: Low
**Mitigation**: IndexedDB has 95%+ coverage. Graceful degradation if caching fails. OSMD works via SVG in all modern browsers.

### Risk 5: MusicXML Export Complexity
**Severity**: Medium
**Mitigation**: Archive solved these problems. Port proven algorithms. Comprehensive test suite. Start simple, add complexity incrementally.

### Risk 6: Data Structure Adaptation Bugs
**Severity**: Medium
**Mitigation**: Port helpers unchanged (zero risk). Only rewrite iteration (smaller surface). Comprehensive tests comparing archive output.

### Risk 7: Missing Cell Model Fields
**Severity**: Low
**Mitigation**: Archive plan confirms compatibility. Cell has all necessary fields. Can extend struct if needed (non-breaking).
