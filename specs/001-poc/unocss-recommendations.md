# UnoCSS Integration Recommendations for Music Notation Editor

## Summary of Research Findings

Based on comprehensive research into UnoCSS best practices and the specific requirements of the Music Notation Editor POC, here are the key recommendations for Phase 1 implementation:

## 1. Recommended UnoCSS Configuration

### Core Setup
```typescript
// uno.config.ts
import { defineConfig, presetUno, presetAttributify } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),           // Tailwind-like utilities
    presetAttributify(),   // Attribute-based utilities
  ],
  theme: {
    fontFamily: {
      'cell': ['Consolas', 'Monaco', 'Ubuntu Mono', 'Liberation Mono', 'monospace'],
      'notation': ['Bravura', 'Leipzig', 'serif'],
    },
    fontSize: {
      '16': ['16px', '1.2'], // Fixed 16-point typeface for POC
    },
    spacing: {
      'char': '1ch',       // Character-based spacing
      'line': '1.2em',     // Line spacing for music
    }
  }
})
```

## 2. Essential Custom Utilities

### Cell Model Utilities
```typescript
rules: [
  ['char-cell', {
    fontFamily: 'theme("fontFamily.cell")',
    fontSize: '16px',
    lineHeight: '1.2',
    letterSpacing: '0',
    display: 'inline-block',
    minWidth: '1ch',
    textAlign: 'center',
    verticalAlign: 'baseline'
  }],

  ['char-selected', {
    backgroundColor: '#007acc',
    color: 'white',
    borderRadius: '2px'
  }],

  ['char-focus', {
    outline: '2px solid #007acc',
    outlineOffset: '1px',
    borderRadius: '2px'
  }]
]
```

### Music Notation Utilities
```typescript
rules: [
  ['beat-loop', {
    position: 'absolute',
    bottom: '-4px',
    left: '0',
    right: '0',
    height: '8px',
    borderBottom: '2px solid #333',
    borderRadius: '0 0 4px 4px'
  }],

  ['octave-above', {
    position: 'absolute',
    top: '-8px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '4px',
    height: '4px',
    backgroundColor: 'currentColor',
    borderRadius: '50%'
  }],

  ['octave-below', {
    position: 'absolute',
    bottom: '-8px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '4px',
    height: '4px',
    backgroundColor: 'currentColor',
    borderRadius: '50%'
  }],

  ['upper-annotation', {
    position: 'absolute',
    top: '-12px',
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: '10px',
    whiteSpace: 'nowrap'
  }],

  ['lower-annotation', {
    position: 'absolute',
    bottom: '-12px',
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: '10px',
    whiteSpace: 'nowrap'
  }]
]
```

## 3. Performance Optimization Strategy

### Critical CSS Pre-generation
```typescript
// Essential utilities for immediate render
safelist: [
  'font-mono', 'text-16', 'leading-tight', 'tracking-tight',
  'char-cell', 'char-selected', 'char-focus',
  'beat-loop', 'octave-above', 'octave-below',
  'upper-annotation', 'lower-annotation',
  'relative', 'absolute', 'z-10', 'z-20'
]
```

### Caching Strategy
- Implement intelligent caching for repeated cell states
- Use requestAnimationFrame for batch DOM updates
- Target >90% cache hit rate for styling operations

## 4. WASM Integration Approach

### Communication Protocol
```rust
// Rust side
#[wasm_bindgen]
pub struct StyleState {
    pub cell_position: usize,
    pub is_selected: bool,
    pub has_focus: bool,
    pub octave: i8,
    pub has_slur: bool,
    pub lane_kind: LaneKind,
}

#[wasm_bindgen]
impl StyleState {
    #[wasm_bindgen(js_name = computeUtilities)]
    pub fn compute_utilities(&self) -> String {
        // Generate utility class string based on state
    }
}
```

```javascript
// JavaScript side
class MusicNotationStyler {
  generateStyleForCell(cellState) {
    const utilities = this.wasm.computeUtilities(cellState)
    return this.uno.generate(utilities)
  }

  batchUpdateCells(cellUpdates) {
    requestAnimationFrame(() => {
      cellUpdates.forEach(([cellId, wasmState]) => {
        this.updateCellStyle(cellId, wasmState)
      })
    })
  }
}
```

## 5. Performance Targets

| Operation | Target Latency | Measurement Method |
|-----------|----------------|-------------------|
| CSS Generation | <5ms | UnoCSS.generate() timing |
| Style Application | <10ms | DOM update timing |
| Cache Lookup | <1ms | Map.get() timing |
| Batch Updates | <16ms | requestAnimationFrame timing |

## 6. Implementation Priority

### Phase 1 (Core Functionality)
1. **Base UnoCSS Configuration** - Monospace fonts, basic Cell utilities
2. **Music Notation Utilities** - Beat loops, octave dots, annotations
3. **Focus Management** - Keyboard navigation, selection highlighting
4. **Basic WASM Integration** - Style computation from Rust

### Phase 2 (Optimization)
1. **Performance Caching** - Intelligent state caching
2. **Batch Updates** - Optimized DOM manipulation
3. **Critical CSS Extraction** - Production optimization
4. **Advanced WASM Features** - Dynamic utility generation

## 7. Key Benefits

1. **Predictable Positioning**: Monospace fonts ensure consistent Cell alignment
2. **Performance**: UnoCSS instant generation meets <50ms latency requirements
3. **Maintainability**: Utility-first approach reduces custom CSS complexity
4. **Scalability**: WASM integration supports dynamic styling requirements
5. **Type Safety**: Configuration can be strongly typed with TypeScript

## 8. Risk Mitigation

- **Font Fallbacks**: Comprehensive font stack ensures cross-platform compatibility
- **Performance Monitoring**: Built-in timing validation for latency targets
- **Progressive Enhancement**: Core functionality works without WASM optimization
- **Browser Compatibility**: UnoCSS supports modern browsers with WASM

This configuration provides a solid foundation for implementing the Music Notation Editor POC while meeting the specific requirements for Cell-based positioning, real-time performance, and musical notation rendering.