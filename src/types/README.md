# TypeScript Type Definitions

This directory contains TypeScript type definitions for the music notation editor.

## Structure

- **`index.ts`** - Main barrel file, export all types from here
- **`wasm.ts`** - Core WASM types (Cell, Document, etc.) extending auto-generated types
- **`wasm-module.ts`** - Type-safe interface for WASM module functions
- **`editor.ts`** - Editor class interfaces and options
- **`events.ts`** - Event handler types
- **`renderer.ts`** - Renderer interfaces
- **`coordinators.ts`** - Coordinator interfaces (cursor, selection, clipboard, etc.)
- **`utils.ts`** - Utility types (Result, DeepPartial, branded types, etc.)

## Usage

Import types from the barrel file:

```typescript
import type { Cell, Document, WASMModule } from '@types';
```

Or import specific files:

```typescript
import type { IEditor } from '@types/editor';
import type { WASMModule } from '@types/wasm-module';
```

## Path Aliases

The `tsconfig.json` defines path aliases:

- `@types/*` → `src/types/*`
- `@/*` → `src/*`
- `@utils/*` → `src/js/utils/*`
- `@coordinators/*` → `src/js/coordinators/*`
- `@handlers/*` → `src/js/handlers/*`
- `@managers/*` → `src/js/managers/*`
- `@core/*` → `src/js/core/*`

## Guidelines

### Adding New Types

1. **Domain-specific types** go in their own files (e.g., `renderer.ts` for rendering types)
2. **Shared utility types** go in `utils.ts`
3. **Always export from `index.ts`** for consistency
4. **Use interfaces for objects** that will be implemented (classes, coordinators)
5. **Use types for unions, intersections, and mapped types**

### Naming Conventions

- **Interfaces**: Use `I` prefix for abstract interfaces (e.g., `IEditor`, `IRenderer`)
- **Concrete types**: No prefix (e.g., `Cell`, `Document`)
- **Type aliases**: PascalCase (e.g., `EditorEventType`, `CursorDirection`)
- **Branded types**: Descriptive suffix (e.g., `LineIndex`, `ColumnIndex`)

### WASM Boundary

The WASM boundary is the most critical area for type safety:

1. **Auto-generated types** from `dist/pkg/editor_wasm.d.ts` are the source of truth for WASM classes
2. **Extend, don't modify** - Use `wasm.ts` to add types for `any` return values
3. **WASMModule interface** in `wasm-module.ts` provides type-safe wrapper for all WASM functions
4. **Type guards** help ensure WASM module is initialized before use

Example:

```typescript
import type { WASMModule } from '@types/wasm-module';
import { isWASMModuleInitialized } from '@types/wasm-module';

if (isWASMModuleInitialized(this.wasmModule)) {
  // TypeScript knows wasmModule is WASMModule here
  const caretInfo = this.wasmModule.getCaretInfo();
}
```

## Migration Progress

### Phase 1: Foundation (Current)
- ✅ Type definitions created
- ✅ Path aliases configured
- ⏳ ESLint TypeScript support (next)

### Phase 2: Type Annotations
- Add JSDoc type annotations to existing JS files
- Create comprehensive interfaces for all coordinators

### Phase 3: Conversion
- Convert WASMBridge.js → WASMBridge.ts
- Convert editor.js → editor.ts
- Convert coordinators → TypeScript

## Related Files

- `/tsconfig.json` - TypeScript configuration
- `/dist/pkg/editor_wasm.d.ts` - Auto-generated WASM types (do not edit)
- `/eslint.config.js` - ESLint configuration with TypeScript support

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [wasm-bindgen TypeScript](https://rustwasm.github.io/wasm-bindgen/reference/typescript.html)
- [Type-safe WASM patterns](https://rustwasm.github.io/wasm-bindgen/examples/type-safe.html)
