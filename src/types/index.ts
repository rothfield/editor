/**
 * Central type definitions for the music notation editor
 *
 * This barrel file exports all type definitions used throughout the application.
 * Import types from here in your code:
 *
 * ```typescript
 * import type { Cell, Document, WASMModule } from '@types';
 * ```
 */

// WASM types
export * from './wasm.js';
export * from './wasm-module.js';

// Editor types
export * from './editor.js';

// Event types
export * from './events.js';

// Renderer types
export * from './renderer.js';

// Coordinator types
export * from './coordinators.js';

// Utility types
export * from './utils.js';
