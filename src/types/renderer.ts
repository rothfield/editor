/**
 * Renderer types
 */

import type { Cell, Document } from './wasm.js';

/**
 * Display list item (for rendering)
 */
export interface DisplayListItem {
  line: number;
  cells: Cell[];
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Render context
 */
export interface RenderContext {
  container: HTMLElement;
  baseFontSize: number;
  cellHeight: number;
  cellWidth: number;
  lineSpacing: number;
}

/**
 * Renderer interface
 */
export interface IRenderer {
  render(document: Document, context: RenderContext): void;
  clear(): void;
  requestRedraw(): void;
}

/**
 * SVG arc renderer (for slurs, beat loops)
 */
export interface IArcRenderer {
  renderSlur(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    direction: 'up' | 'down'
  ): SVGPathElement;

  renderBeatLoop(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): SVGPathElement;

  clear(): void;
}

/**
 * Export renderer options
 */
export interface ExportRendererOptions {
  format: 'musicxml' | 'lilypond' | 'pdf' | 'midi';
  includeTitle?: boolean;
  includeComposer?: boolean;
  pageSize?: 'letter' | 'a4' | 'legal';
}

/**
 * LilyPond renderer interface
 */
export interface ILilyPondRenderer {
  render(document: Document, options?: ExportRendererOptions): string;
}

/**
 * MusicXML renderer interface
 */
export interface IMusicXMLRenderer {
  render(document: Document, options?: ExportRendererOptions): string;
}

/**
 * OSMD renderer interface (OpenSheetMusicDisplay)
 */
export interface IOSMDRenderer {
  initialize(container: HTMLElement): Promise<void>;
  renderMusicXML(musicXML: string): Promise<void>;
  clear(): void;
}
