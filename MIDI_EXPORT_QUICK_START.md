# MIDI Export - Quick Start Guide

## ✅ Status: Implementation Complete

Full MusicXML → MIDI conversion with **tuplet support (2-63)** and complete UI integration.

---

## 🎯 Quick Start (30 seconds)

### 1. Start the Development Server
```bash
cd /home/john/editor
make serve
```

### 2. Open Browser
Navigate to: **http://localhost:8080**

### 3. Create Some Music
- Type notes (e.g., "1234567" in number system or "cdefgab" in western)
- Add accidentals (# for sharp, b for flat)
- Create tuplets if desired

### 4. Export to MIDI
1. Click **File** menu
2. Click **Export...**
3. Click **MIDI** button
4. 📥 MIDI file downloads automatically

---

## 📊 What's Included

### ✅ Export Formats
- **MIDI** (Standard MIDI File, Format 1, multi-track)
- **MusicXML** (existing)
- **LilyPond Source** (existing)

### ✅ MIDI Features
- Multi-part/multi-track support
- Tempo changes
- Time signatures
- All MIDI instruments
- Tuplets (2 to 63 tuplet ratios)
- Tied notes
- Chords
- Rests

### ✅ Tuplet Examples
- Triplets: 3 notes in time of 2
- Quintuplets: 5 notes in time of 4
- Septuplets: 7 notes in time of 4
- Any ratio from 2 to 63

---

## 🧪 Testing

### Run Unit Tests
```bash
# All 22 MIDI converter tests
cargo test --lib converters::musicxml::musicxml_to_midi

# Result: 22 passed ✅
```

### Run E2E Tests
```bash
# Make sure dev server is running
pytest tests/e2e/test_midi_export.py -v

# With browser visible
pytest tests/e2e/test_midi_export.py -v --headed
```

---

## 🎼 Supported Elements

| Element | Support | Example |
|---------|---------|---------|
| Notes | ✅ | C, D, E, F, G, A, B |
| Rests | ✅ | Rest between notes |
| Sharps | ✅ | C#, D#, E# |
| Flats | ✅ | Cb, Db, Eb |
| Double sharps | ✅ | C##, D## |
| Double flats | ✅ | Cbb, Dbb |
| Triplets | ✅ | 3 notes in time of 2 |
| Quintuplets | ✅ | 5 notes in time of 4 |
| Tied notes | ✅ | Merges into single note |
| Chords | ✅ | Multiple notes same time |
| Multi-part | ✅ | Multiple instruments |
| Tempos | ✅ | Tempo markings |
| Time signatures | ✅ | 4/4, 3/4, etc. |

---

## 🔍 Verifying Installation

### Check WASM Module
Open browser console (F12) and run:
```javascript
console.log(typeof window.editorWasm.exportMIDI)  // Should print: function
console.log(typeof window.editor.wasmModule.exportMIDI)  // Should print: function
```

### Check Files Exist
```bash
ls -la /home/john/editor/dist/pkg/editor_wasm*
ls -la /home/john/editor/dist/main.js
```

### Verify Development Server
```bash
curl -s http://localhost:8080 | head -20
```

---

## 🚀 Using MIDI Files

### Play in DAW
- Import the MIDI file into any DAW (Reaper, Ableton, Logic, etc.)
- All notes and timing will be preserved
- Tempo changes will be included
- Multi-track format ready for editing

### Convert to Audio
```bash
# Using fluidsynth (example)
fluidsynth -a pulseaudio -m alsa_seq \
  /usr/share/sounds/sf2/FluidR3_GM.sf2 \
  export.mid -F audio.wav -r 44100
```

### Edit Further
- Modify timing and velocity in DAW
- Add effects and mixing
- Export to MP3, WAV, etc.

---

## 📝 File Naming

Exported files are named with timestamp:
```
score-20251018-1430.mid
│      │ │ │ │ │ └─ minutes (14:30)
│      │ │ │ │ └─ hours
│      │ └─ date (2025-10-18)
└───── score title (or default "score")
```

---

## 🐛 Troubleshooting

### MIDI not exporting?
1. ✅ Ensure dev server running: `make serve`
2. ✅ Check console for errors (F12)
3. ✅ Verify WASM loaded: `typeof window.editorWasm.exportMIDI`
4. ✅ Rebuild if needed: `make build`

### MIDI file corrupt?
1. Check file size (should be > 100 bytes)
2. Verify with file command: `file export.mid`
3. Open in MIDI editor (MuseScore, etc.)

### Tuplets not exporting correctly?
1. Check MusicXML representation
2. Verify time-modification elements in MusicXML
3. Run unit test: `cargo test --lib converters::musicxml::musicxml_to_midi::parse::tests::test_parse_triplet`

---

## 💡 Pro Tips

### Export Multiple Formats
- Same score → MIDI for playback, MusicXML for editing, LilyPond for printing

### Full Workflow
1. Compose in editor (staff notation)
2. Export MIDI for playback testing
3. Export MusicXML for further editing in MuseScore
4. Export LilyPond for professional sheet music

### Batch Processing
- Export all parts separately
- Remix in DAW
- Create stereo mix

---

## 🎵 Example: Create and Export Tuplets

```
Editor input: "1 2 3"  (in number system)
              or
              "c d e"  (in western system)

With triplet time modification:
- 3 notes in the time of 2
- Creates 1/3-beat notes
- Perfect for jazz swing feel

Export to MIDI:
- All triplet timing preserved
- Playable in any DAW
- Can adjust tempo without losing timing
```

---

## 📞 Support

### Common Questions

**Q: What MIDI version is supported?**
A: Standard MIDI File (SMF) Format 1, compatible with all modern DAWs

**Q: Max tuplet ratio?**
A: Supports 2 to 63 tuplets (2:1, 3:2, ... 63:something)

**Q: Multi-track support?**
A: Yes! Each part becomes a separate track in MIDI

**Q: Compatibility?**
A: Works with: MuseScore, Logic, Reaper, Ableton, GarageBand, etc.

---

## ✨ Implementation Details

- **Language**: Rust (WASM compiled)
- **Music Library**: music21 algorithms ported to Rust
- **Format**: Standard MIDI File (SMF) Format 1
- **Tuplet Support**: All ratios from 2 to 63
- **Tests**: 22 unit tests + E2E test suite
- **Status**: Production ready ✅

---

**Ready to use! Happy composing! 🎼**

For detailed technical info, see: `IMPLEMENTATION_COMPLETE.md`
For test details, see: `MIDI_EXPORT_TESTS.md`
