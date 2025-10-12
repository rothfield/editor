# Rust Compilation Settings and WASM Optimization for <10ms Beat Derivation

**Date**: 2025-10-11
**Target**: Music Notation Editor POC with <10ms beat derivation performance
**Context**: Performance-critical operations for CharCell-based text processing and beat extraction

## Executive Summary

Achieving <10ms beat derivation performance requires careful optimization across multiple layers: Rust compiler settings, WASM-specific optimizations, memory management, and algorithm efficiency. This research provides specific configurations and patterns for the Music Notation Editor POC.

## 1. Cargo.toml Configuration for WASM Optimization

### 1.1 Release Profile Settings

```toml
[package]
name = "ecs-editor-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.90"
wee_alloc = { version = "0.4.5", optional = true }
console_error_panic_hook = { version = "0.1.7", optional = true }

[profile.release]
# Maximum optimization level
opt-level = 3
# Link-time optimization for better performance
lto = true
# Remove debug symbols for smaller binary
debug = false
# Optimize for code size (use 's' for size-optimized, 'z' for minimal size)
opt-level = "s"  # Use "s" for balanced performance/size, or "3" for pure speed
# Remove panic unwind information to reduce binary size
panic = "abort"
# Enable all optimizations
codegen-units = 1

[profile.release.package."*"]
# Additional optimizations for dependencies
opt-level = "s"

[features]
default = ["console_error_panic_hook"]
console_error_panic_hook = ["dep:console_error_panic_hook"]
wee_alloc = ["dep:wee_alloc"]
```

### 1.2 WASM-Specific Dependencies

```toml
[dependencies]
# Core WASM interop
wasm-bindgen = { version = "0.2.90", features = ["serde-serialize"] }
js-sys = "0.3.67"
web-sys = "0.3.67"

# Performance optimizations
wee_alloc = { version = "0.4.5", optional = true }

# Error handling in WASM
console_error_panic_hook = { version = "0.1.7", optional = true }

# Fast collections
hashbrown = "0.14.3"
smallvec = { version = "1.11.2", features = ["const_generics"] }

# Serialization for JS interop
serde = { version = "1.0.195", features = ["derive"] }
serde-wasm-bindgen = "0.6.3"
```

## 2. Rust Code Patterns for High-Performance Text Processing

### 2.1 Memory-Efficient CharCell Data Structure

```rust
use core::mem::{self, MaybeUninit};
use hashbrown::HashSet;
use smallvec::SmallVec;

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct CharCell {
    // Use u32 for compact storage with packed flags
    grapheme: u32,          // Index into string interner
    kind: u8,              // ElementKind enum
    lane: u8,              // LaneKind enum
    flags: u8,             // Packed boolean flags
    reserved: u8,          // Alignment padding
}

impl CharCell {
    #[inline]
    pub const fn new(grapheme: u32, kind: ElementKind, lane: LaneKind) -> Self {
        Self {
            grapheme,
            kind: kind as u8,
            lane: lane as u8,
            flags: 0,
            reserved: 0,
        }
    }

    #[inline(always)]
    pub fn is_temporal(&self) -> bool {
        matches!(self.kind(), ElementKind::PitchedElement | ElementKind::UnpitchedElement)
    }

    #[inline(always)]
    pub fn set_head(&mut self, is_head: bool) {
        if is_head {
            self.flags |= 0x01;
        } else {
            self.flags &= !0x01;
        }
    }

    #[inline(always)]
    pub fn is_head(&self) -> bool {
        self.flags & 0x01 != 0
    }
}

// Use string interning to reduce memory usage for repeated characters
pub struct StringInterner {
    strings: Vec<String>,
    map: hashbrown::HashMap<String, u32>,
}

impl StringInterner {
    pub fn new() -> Self {
        Self {
            strings: Vec::with_capacity(256),
            map: hashbrown::HashMap::with_capacity(256),
        }
    }

    pub fn intern(&mut self, s: String) -> u32 {
        if let Some(&idx) = self.map.get(&s) {
            idx
        } else {
            let idx = self.strings.len() as u32;
            self.map.insert(s.clone(), idx);
            self.strings.push(s);
            idx
        }
    }
}
```

### 2.2 High-Performance Beat Extraction Algorithm

```rust
use smallvec::SmallVec;
use core::mem::MaybeUninit;

#[derive(Clone)]
pub struct BeatSpan {
    pub start: usize,
    pub end: usize,
    pub elements: SmallVec<[u32; 8]>, // Inline storage for small beats
}

// Optimized beat extraction with minimal allocations
pub fn extract_beats_optimized(
    cells: &[CharCell],
    exclude_set: &HashSet<u32>, // Use interned IDs
) -> Vec<BeatSpan> {
    let mut beats = Vec::with_capacity(cells.len() / 4); // Estimate capacity
    let mut current_start = None;
    let mut current_elements = SmallVec::<[u32; 8]>::new();

    for (idx, cell) in cells.iter().enumerate() {
        // Skip excluded cells
        if exclude_set.contains(&cell.grapheme) {
            if let Some(start) = current_start.take() {
                beats.push(BeatSpan {
                    start,
                    end: idx,
                    elements: mem::take(&mut current_elements),
                });
            }
            continue;
        }

        // Check if this is a beat separator
        if is_beat_separator(cell) {
            if let Some(start) = current_start.take() {
                beats.push(BeatSpan {
                    start,
                    end: idx,
                    elements: mem::take(&mut current_elements),
                });
            }
        } else if cell.is_temporal() {
            if current_start.is_none() {
                current_start = Some(idx);
            }
            current_elements.push(cell.grapheme);
        } else {
            // Non-temporal elements break beats
            if let Some(start) = current_start.take() {
                beats.push(BeatSpan {
                    start,
                    end: idx,
                    elements: mem::take(&mut current_elements),
                });
            }
        }
    }

    // Handle final beat
    if let Some(start) = current_start {
        beats.push(BeatSpan {
            start,
            end: cells.len(),
            elements: current_elements,
        });
    }

    beats
}

#[inline(always)]
fn is_beat_separator(cell: &CharCell) -> bool {
    match cell.kind() {
        ElementKind::Barline | ElementKind::Whitespace | ElementKind::BreathMark => true,
        _ => false,
    }
}
```

### 2.3 SIMD-Optimized Text Processing (where applicable)

```rust
#[cfg(target_arch = "wasm32")]
use std::arch::wasm32::*;

// SIMD-accelerated pattern matching for common sequences
#[cfg(target_arch = "wasm32")]
pub fn find_barlines_simd(text: &[u8]) -> Vec<usize> {
    let mut positions = Vec::new();
    let pattern = b'|';

    // Process 16 bytes at a time using SIMD
    let chunks = text.chunks_exact(16);
    let remainder = chunks.remainder();

    for (chunk_idx, chunk) in chunks.enumerate() {
        let bytes = v128_load(chunk.as_ptr() as *const v128);
        let pattern_vec = v128_load(&pattern as *const u8 as *const v128);

        // Compare each byte with the pattern
        let mask = u8x16_eq(bytes, pattern_vec);
        let bitmask = u8x16_bitmask(mask);

        // Extract set bits to find matching positions
        let mut bits = bitmask;
        while bits != 0 {
            let lz = bits.leading_zeros();
            let pos = chunk_idx * 16 + lz as usize;
            positions.push(pos);
            bits &= bits - 1; // Clear lowest set bit
        }
    }

    // Handle remaining bytes
    for (idx, &byte) in remainder.iter().enumerate() {
        if byte == pattern {
            positions.push(chunks.len() * 16 + idx);
        }
    }

    positions
}
```

## 3. Memory Management Strategies

### 3.1 Arena-Based Allocation

```rust
pub struct CharCellArena {
    storage: Vec<CharCell>,
    free_list: Vec<usize>,
}

impl CharCellArena {
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            storage: Vec::with_capacity(capacity),
            free_list: Vec::new(),
        }
    }

    pub fn allocate(&mut self, cell: CharCell) -> usize {
        if let Some(idx) = self.free_list.pop() {
            self.storage[idx] = cell;
            idx
        } else {
            let idx = self.storage.len();
            self.storage.push(cell);
            idx
        }
    }

    pub fn deallocate(&mut self, idx: usize) {
        self.free_list.push(idx);
    }

    #[inline(always)]
    pub fn get(&self, idx: usize) -> &CharCell {
        &self.storage[idx]
    }

    #[inline(always)]
    pub fn get_mut(&mut self, idx: usize) -> &mut CharCell {
        &mut self.storage[idx]
    }
}
```

### 3.2 Zero-Copy Interop with JavaScript

```rust
use wasm_bindgen::prelude::*;
use js_sys::{Uint8Array, ArrayBuffer};

#[wasm_bindgen]
pub struct CharCellBuffer {
    data: Vec<CharCell>,
    length: usize,
}

#[wasm_bindgen]
impl CharCellBuffer {
    #[wasm_bindgen(constructor)]
    pub fn new(capacity: usize) -> CharCellBuffer {
        CharCellBuffer {
            data: Vec::with_capacity(capacity),
            length: 0,
        }
    }

    // Direct memory access without copying
    #[wasm_bindgen(js_name = getRawBuffer)]
    pub fn get_raw_buffer(&self) -> Uint8Array {
        let array_buffer = unsafe {
            ArrayBuffer::view(&self.data)
        };
        Uint8Array::new(&array_buffer)
    }

    #[wasm_bindgen]
    pub fn push(&mut self, cell: CharCell) {
        self.data.push(cell);
        self.length = self.data.len();
    }

    #[wasm_bindgen(getter)]
    pub fn length(&self) -> usize {
        self.length
    }
}
```

## 4. wasm-bindgen Configuration for Optimal Performance

### 4.1 Build Configuration

```toml
# wasm-pack.toml
[package]
authors = ["Your Name"]
description = "Music Notation Editor WASM Module"
license = "MIT"
repository = "https://github.com/yourusername/ecs-editor"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.90"

[profile.release]
opt-level = "s"
lto = true
panic = "abort"
```

### 4.2 JavaScript Interop Patterns

```rust
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[wasm_bindgen]
pub struct BeatResult {
    pub beats: Vec<BeatSpan>,
    pub processing_time_ms: f64,
}

#[wasm_bindgen]
pub struct BeatExtractor {
    interner: StringInterner,
    arena: CharCellArena,
    exclude_cache: HashSet<u32>,
}

#[wasm_bindgen]
impl BeatExtractor {
    #[wasm_bindgen(constructor)]
    pub fn new() -> BeatExtractor {
        BeatExtractor {
            interner: StringInterner::new(),
            arena: CharCellArena::with_capacity(1000),
            exclude_cache: HashSet::with_capacity(100),
        }
    }

    // High-performance beat extraction
    #[wasm_bindgen]
    pub fn extract_beats(&mut self, input: &str, exclude_ids: &[u32]) -> JsValue {
        let start = web_sys::window()
            .unwrap()
            .performance()
            .unwrap()
            .now();

        // Parse input into CharCells
        let cells = self.parse_input_optimized(input);

        // Update exclude cache efficiently
        self.exclude_cache.clear();
        self.exclude_cache.extend(exclude_ids);

        // Extract beats
        let beats = extract_beats_optimized(&cells, &self.exclude_cache);

        let end = web_sys::window()
            .unwrap()
            .performance()
            .unwrap()
            .now();

        let result = BeatResult {
            beats,
            processing_time_ms: end - start,
        };

        JsValue::from_serde(&result).unwrap()
    }

    // Optimized input parsing
    fn parse_input_optimized(&mut self, input: &str) -> Vec<CharCell> {
        let mut cells = Vec::with_capacity(input.len());

        // Use grapheme clustering for accurate tokenization
        let mut grapheme_iter = input.graphemes(true);

        while let Some(grapheme) = grapheme_iter.next() {
            let interned = self.interner.intern(grapheme.to_string());
            let kind = self.classify_grapheme(grapheme);
            let cell = CharCell::new(interned, kind, LaneKind::Letter);
            cells.push(cell);
        }

        cells
    }

    fn classify_grapheme(&self, grapheme: &str) -> ElementKind {
        // Fast classification using lookup table for common cases
        match grapheme {
            "1" | "2" | "3" | "4" | "5" | "6" | "7" => ElementKind::PitchedElement,
            "c" | "d" | "e" | "f" | "g" | "a" | "b" |
            "C" | "D" | "E" | "F" | "G" | "A" | "B" => ElementKind::PitchedElement,
            "-" | "--" => ElementKind::UnpitchedElement,
            "|" => ElementKind::Barline,
            " " => ElementKind::Whitespace,
            "'" => ElementKind::BreathMark,
            _ => {
                // Check for accidentals and complex patterns
                if self.has_accidental(grapheme) {
                    ElementKind::PitchedElement
                } else {
                    ElementKind::Text
                }
            }
        }
    }

    fn has_accidental(&self, grapheme: &str) -> bool {
        grapheme.contains('#') || grapheme.contains('b')
    }
}
```

## 5. Performance Measurement and Benchmarking

### 5.1 WASM Performance Profiling

```rust
use wasm_bindgen::prelude::*;
use web_sys::console;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn time(label: &str);

    #[wasm_bindgen(js_namespace = console)]
    fn timeEnd(label: &str);
}

#[wasm_bindgen]
pub struct PerformanceProfiler {
    measurements: Vec<f64>,
}

#[wasm_bindgen]
impl PerformanceProfiler {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PerformanceProfiler {
        PerformanceProfiler {
            measurements: Vec::with_capacity(1000),
        }
    }

    pub fn start_measurement(&self, label: &str) {
        console::time_1(label);
    }

    pub fn end_measurement(&mut self, label: &str) -> f64 {
        console::timeEnd_1(label);

        let time = web_sys::window()
            .unwrap()
            .performance()
            .unwrap()
            .now();

        self.measurements.push(time);
        time
    }

    pub fn get_average_time(&self) -> f64 {
        if self.measurements.is_empty() {
            return 0.0;
        }
        self.measurements.iter().sum::<f64>() / self.measurements.len() as f64
    }

    pub fn get_percentile(&self, percentile: f64) -> f64 {
        if self.measurements.is_empty() {
            return 0.0;
        }

        let mut sorted = self.measurements.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let index = ((sorted.len() as f64 - 1.0) * percentile / 100.0) as usize;
        sorted[index]
    }
}
```

### 5.2 Benchmark Test Suite

```rust
#[cfg(test)]
mod benchmarks {
    use super::*;
    use std::time::Instant;

    #[test]
    fn benchmark_beat_extraction_small() {
        let input = "1234|5678|";
        let mut extractor = BeatExtractor::new();

        let iterations = 10000;
        let start = Instant::now();

        for _ in 0..iterations {
            let _result = extractor.extract_beats(input, &[]);
        }

        let duration = start.elapsed();
        let avg_ms = duration.as_millis() as f64 / iterations as f64;

        println!("Average time for small input: {:.3}ms", avg_ms);
        assert!(avg_ms < 1.0, "Small input should process in <1ms");
    }

    #[test]
    fn benchmark_beat_extraction_large() {
        let input = "123456789012345678901234567890|".repeat(100);
        let mut extractor = BeatExtractor::new();

        let iterations = 1000;
        let start = Instant::now();

        for _ in 0..iterations {
            let _result = extractor.extract_beats(&input, &[]);
        }

        let duration = start.elapsed();
        let avg_ms = duration.as_millis() as f64 / iterations as f64;

        println!("Average time for large input: {:.3}ms", avg_ms);
        assert!(avg_ms < 10.0, "Large input should process in <10ms");
    }

    #[test]
    fn benchmark_memory_allocation() {
        let mut arena = CharCellArena::with_capacity(1000);
        let cells: Vec<usize> = (0..1000)
            .map(|_| arena.allocate(CharCell::new(0, ElementKind::Text, LaneKind::Letter)))
            .collect();

        let start = Instant::now();

        // Random allocation/deallocation pattern
        for i in 0..10000 {
            let idx = cells[i % cells.len()];
            arena.deallocate(idx);
            arena.allocate(CharCell::new(i as u32, ElementKind::Text, LaneKind::Letter));
        }

        let duration = start.elapsed();
        let avg_us = duration.as_micros() as f64 / 10000.0;

        println!("Average allocation time: {:.3}μs", avg_us);
        assert!(avg_us < 1.0, "Allocation should be <1μs");
    }
}
```

## 6. Compilation Flags and Settings

### 6.1 Build Script Configuration

```rust
// build.rs
fn main() {
    println!("cargo:rustc-link-arg=-O3");
    println!("cargo:rustc-link-arg=-lto");
    println!("cargo:rustc-link-arg=-Ccodegen-units=1");

    // Target-specific optimizations
    if std::env::var("TARGET").unwrap().contains("wasm") {
        println!("cargo:rustc-link-arg=-Ctarget-feature=+bulk-memory,+mutable-globals");
        println!("cargo:rustc-link-arg=-Copt-level=s");
    }
}
```

### 6.2 Makefile for WASM Build

```makefile
# Makefile
.PHONY: build build-release test benchmark clean

WASM_PACK_VERSION = 0.12.0
WASM_OPT_PATH = $(shell which wasm-opt)

build:
	cargo build --target wasm32-unknown-unknown
	wasm-pack build --target web --out-dir pkg --dev

build-release:
	cargo build --target wasm32-unknown-unknown --release
	wasm-pack build --target web --out-dir pkg
ifdef WASM_OPT_PATH
	wasm-opt -Os pkg/ecs_editor_wasm_bg.wasm -o pkg/ecs_editor_wasm_bg.wasm
endif

test:
	cargo test --target wasm32-unknown-unknown

benchmark:
	cargo test --release benchmarks -- --nocapture

clean:
	cargo clean
	rm -rf pkg

install-tools:
	npm install -g wasm-pack@$(WASM_PACK_VERSION)
	@if [ -z "$(WASM_OPT_PATH)" ]; then \
		echo "Installing wasm-opt (binaryen)..."; \
		brew install binaryen || \
		sudo apt-get install binaryen || \
		echo "Please install wasm-opt manually"; \
	fi
```

## 7. JavaScript Integration Patterns

### 7.1 Efficient WASM Module Loading

```javascript
// js/wasm-loader.js
class WasmBeatExtractor {
    constructor() {
        this.module = null;
        this.instance = null;
        this.extractor = null;
    }

    async initialize() {
        try {
            // Load WASM module with streaming for better performance
            const { default: init } = await import('../pkg/ecs_editor_wasm.js');
            this.module = await init();

            // Create extractor instance
            this.extractor = new this.module.BeatExtractor();

            // Warm up the module
            this.extractor.extract_beats("", []);

            console.log('WASM BeatExtractor initialized');
        } catch (error) {
            console.error('Failed to initialize WASM module:', error);
            throw error;
        }
    }

    extractBeats(input, excludeIds = []) {
        if (!this.extractor) {
            throw new Error('WASM module not initialized');
        }

        const startTime = performance.now();
        const result = this.extractor.extract_beats(input, excludeIds);
        const endTime = performance.now();

        // Convert from WASM format to JavaScript
        const jsResult = {
            beats: Array.from(result.beats).map(beat => ({
                start: beat.start,
                end: beat.end,
                elements: Array.from(beat.elements)
            })),
            processingTimeMs: result.processing_time_ms,
            totalTimeMs: endTime - startTime
        };

        return jsResult;
    }

    // Batch processing for multiple lines
    extractBeatsBatch(lines, excludeIds = []) {
        const results = [];
        const startTime = performance.now();

        for (const line of lines) {
            const result = this.extractBeats(line, excludeIds);
            results.push(result);
        }

        const endTime = performance.now();

        return {
            results,
            totalProcessingTime: endTime - startTime,
            averageProcessingTime: (endTime - startTime) / lines.length
        };
    }
}

export default WasmBeatExtractor;
```

### 7.2 Performance Monitoring

```javascript
// js/performance-monitor.js
class PerformanceMonitor {
    constructor() {
        this.measurements = [];
        this.thresholds = {
            beatExtraction: 10, // ms
            inputProcessing: 1, // ms
            rendering: 16 // ms (60fps)
        };
    }

    startMeasurement(operation) {
        return {
            operation,
            startTime: performance.now(),
            end: () => this.endMeasurement(this)
        };
    }

    endMeasurement(measurement) {
        const endTime = performance.now();
        const duration = endTime - measurement.startTime;

        this.measurements.push({
            operation: measurement.operation,
            duration,
            timestamp: Date.now()
        });

        // Check against thresholds
        const threshold = this.thresholds[measurement.operation];
        if (threshold && duration > threshold) {
            console.warn(`Performance warning: ${measurement.operation} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`);
        }

        return duration;
    }

    getStats(operation = null) {
        let filtered = this.measurements;
        if (operation) {
            filtered = filtered.filter(m => m.operation === operation);
        }

        if (filtered.length === 0) {
            return null;
        }

        const durations = filtered.map(m => m.duration);
        durations.sort((a, b) => a - b);

        return {
            count: filtered.length,
            average: durations.reduce((a, b) => a + b, 0) / durations.length,
            median: durations[Math.floor(durations.length / 2)],
            p95: durations[Math.floor(durations.length * 0.95)],
            p99: durations[Math.floor(durations.length * 0.99)],
            min: durations[0],
            max: durations[durations.length - 1]
        };
    }

    clear() {
        this.measurements = [];
    }
}

export default PerformanceMonitor;
```

## 8. Optimization Checklist

### 8.1 Rust Compiler Optimizations
- [ ] Set `opt-level = "s"` for balanced performance/size
- [ ] Enable `lto = true` for link-time optimization
- [ ] Use `panic = "abort"` to reduce binary size
- [ ] Set `codegen-units = 1` for maximum optimization
- [ ] Use `wee_alloc` for smaller allocator
- [ ] Enable `console_error_panic_hook` for debugging

### 8.2 Memory Management
- [ ] Implement string interning for repeated characters
- [ ] Use arena allocation for CharCell storage
- [ ] Prefer `SmallVec` for small collections
- [ ] Use `HashSet` for fast lookups
- [ ] Minimize allocations in hot paths
- [ ] Use zero-copy interop patterns

### 8.3 Algorithm Optimizations
- [ ] Inline critical functions with `#[inline(always)]`
- [ ] Use SIMD for pattern matching where possible
- [ ] Pre-allocate vectors with estimated capacity
- [ ] Cache frequently accessed data
- [ ] Minimize branches in hot loops
- [ ] Use lookup tables for common classifications

### 8.4 JavaScript Integration
- [ ] Use streaming WASM loading
- [ ] Implement batch processing for multiple operations
- [ ] Warm up WASM module on initialization
- [ ] Use efficient data transfer patterns
- [ ] Implement performance monitoring
- [ ] Cache WASM instances for reuse

### 8.5 Performance Targets
- [ ] Beat extraction: <10ms for typical content
- [ ] Input processing: <1ms per character
- [ ] Memory usage: <10MB for 1000 CharCells
- [ ] WASM binary size: <500KB optimized
- [ ] Initialization time: <100ms
- [ ] JavaScript interop overhead: <1ms

## 9. Expected Performance Improvements

Based on the optimizations outlined above, we expect to achieve:

- **Beat extraction**: 3-5ms for typical single-line content (meeting <10ms target)
- **Memory usage**: 50-70% reduction through string interning and arena allocation
- **Binary size**: 60-80% reduction through LTO and size optimization
- **Startup time**: 70-90% faster loading through streaming and warm-up
- **Overall responsiveness**: Consistent <16ms operations for 60fps UI

These optimizations provide a solid foundation for meeting the <10ms beat derivation requirement specified in the Music Notation Editor POC while maintaining code maintainability and extensibility.