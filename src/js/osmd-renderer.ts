// OSMD (OpenSheetMusicDisplay) renderer for VexFlow staff notation output
// Implements IndexedDB caching for fast startup (FR-032)
// @ts-ignore - osmd-audio-player loaded from CDN
import PlaybackEngine from 'osmd-audio-player';
import logger, { LOG_CATEGORIES } from './logger.js';

// Declare global OSMD from CDN
declare global {
  interface Window {
    opensheetmusicdisplay: any;
    Vex?: { Flow?: any };
    VexFlow?: any;
  }
}

const opensheetmusicdisplay = window.opensheetmusicdisplay;

interface VFStaveNote {
  attrs?: { el?: SVGElement };
  modifiers?: any[];
}

interface GraphicalVoiceEntry {
  vfStaveNote?: VFStaveNote;
  parentVoiceEntry?: {
    Notes?: Array<{ IsGraceNote?: boolean }>;
    IsGrace?: boolean;
    graceAfterMainNote?: boolean;
  };
  notes?: Array<{
    sourceNote?: {
      GraceNotesAfter?: any[];
    };
  }>;
}

interface StaffEntry {
  graphicalVoiceEntries?: GraphicalVoiceEntry[];
}

interface StaffMeasure {
  staffEntries?: StaffEntry[];
}

interface OSMDInstance {
  Sheet?: {
    Instruments?: any[];
    SourceMeasures?: any[];
  };
  EngravingRules?: {
    MinimumDistanceBetweenNotes?: number;
    MinimumNoteDistance?: number;
  };
  graphic?: {
    measureList?: StaffMeasure[][];
  };
  cursor?: {
    Iterator?: {
      CurrentVoiceEntries?: any[];
    };
  };
  Zoom?: number;
  load: (musicxml: string) => Promise<void>;
  render: () => Promise<void>;
  setLogLevel: (level: string) => void;
}

interface AudioPlayer {
  state?: string;
  ready?: boolean;
  availableInstruments?: Array<{ name: string }>;
  scoreInstruments?: Array<{ Name: string }>;
  loadScore: (osmd: any) => Promise<void>;
  setBpm: (bpm: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  playbackSettings?: {
    masterVolume: number;
  };
}

export class OSMDRenderer {
  private containerId: string;
  public osmd: OSMDInstance | null = null;
  public audioPlayer: AudioPlayer | null = null;
  private renderToken: number = 0;
  private cache: IDBDatabase | null = null;
  public lastMusicXmlHash: string | null = null;
  private vexflowPatched: boolean = false;
  private afterGraceFlags: boolean[] = [];

  // Cache version - bump this to invalidate all cached renders
  // v17: Polyphonic export with measurization layer (part concatenation + rest padding)
  static CACHE_VERSION = 'v17';

  // Track which grace notes are after-grace (from MusicXML parsing)
  afterGraceNoteCount: number = 0;

  constructor(containerId: string) {
    this.containerId = containerId;
    this.initCache();
  }

  /**
   * Monkey-patch VexFlow's GraceNoteGroup to support RIGHT positioning.
   * Must be called BEFORE osmd.load()/osmd.render().
   *
   * Based on: https://github.com/0xfe/vexflow
   * VexFlow's GraceNoteGroup only supports LEFT positioning by default.
   */
  patchVexFlowGraceNoteGroup(): void {
    if (this.vexflowPatched) return;

    // Access VexFlow through OSMD's bundled version (available after OSMD instance is created)
    // Try multiple access paths since VexFlow location varies by OSMD version
    const VF = window.Vex?.Flow ||
               window.VexFlow ||
               opensheetmusicdisplay?.VexFlowPatch ||
               this.osmd?.vexflowBackend?.VexFlow;

    if (!VF) {
      logger.debug(LOG_CATEGORIES.OSMD, 'VexFlow not available for patching (will use default behavior)');
      return;
    }

    const GraceNoteGroup = VF.GraceNoteGroup;
    const Modifier = VF.Modifier;

    if (!GraceNoteGroup || !Modifier) {
      logger.warn(LOG_CATEGORIES.OSMD, 'GraceNoteGroup or Modifier not found');
      return;
    }

    logger.info(LOG_CATEGORIES.OSMD, 'Patching VexFlow GraceNoteGroup for RIGHT positioning');

    // 1) Patch format(): allocate RIGHT spacing if position is RIGHT
    const oldFormat = GraceNoteGroup.format;
    if (oldFormat) {
      GraceNoteGroup.format = function(groups: any[], state: any) {
        const left: any[] = [];
        const right: any[] = [];
        for (const g of (groups || [])) {
          (g.position === Modifier.Position.RIGHT ? right : left).push(g);
        }

        // Existing behavior for LEFT groups
        const didLeft = oldFormat.call(GraceNoteGroup, left, state);

        // New behavior for RIGHT groups
        if (right.length) {
          const spacing = 4;
          let groupShift = 0;
          for (const g of right) {
            if (g.preFormat) g.preFormat();
            groupShift = Math.max(groupShift, (g.getWidth?.() || 0) + spacing);
          }
          state.right_shift = (state.right_shift || 0) + groupShift;
          for (const g of right) {
            if (g.setSpacingFromNextModifier) g.setSpacingFromNextModifier(0);
          }
          return true;
        }
        return didLeft;
      };
    }

    // 2) Patch draw(): if RIGHT, anchor to tickContext X + right extras
    const oldDraw = GraceNoteGroup.prototype.draw;
    if (oldDraw) {
      GraceNoteGroup.prototype.draw = function(this: any) {
        if (this.position !== Modifier.Position.RIGHT) {
          return oldDraw.call(this);
        }

        this.checkContext();
        const note = this.getNote();
        if (!(note && (this.index !== null))) {
          throw new Error("GraceNoteGroup: missing parent note");
        }

        const tickContext = note.getTickContext();
        const extraPx = tickContext.getExtraPx?.() || { right: 0, extraRight: 0 };
        const baseX =
          tickContext.getX() +
          (extraPx.right || 0) +
          (extraPx.extraRight || 0) +
          (this.getSpacingFromNextModifier?.() || 0);

        // Move each grace note tick context to the right side
        if (this.grace_notes) {
          this.grace_notes.forEach((graceNote: any) => {
            const tc = graceNote.getTickContext();
            const xOffset = tc.getX();
            graceNote.setStave(note.stave);
            tc.setX(baseX + xOffset);
          });
        }

        // Draw like normal
        return oldDraw.call(this);
      };
    }

    this.vexflowPatched = true;
    logger.info(LOG_CATEGORIES.OSMD, 'VexFlow GraceNoteGroup patched successfully');
  }

  // Initialize IndexedDB cache for staff notation renders
  async initCache(): Promise<void> {
    try {
      const dbRequest = indexedDB.open('vexflow-staff-notation-cache', 1);

      dbRequest.onupgradeneeded = (e) => {
        const target = e.target as IDBOpenDBRequest;
        const db = target.result;
        if (!db.objectStoreNames.contains('renders')) {
          db.createObjectStore('renders');
        }
      };

      dbRequest.onsuccess = (e) => {
        const target = e.target as IDBOpenDBRequest;
        this.cache = target.result;
        logger.info(LOG_CATEGORIES.OSMD, 'Cache initialized');
      };

      dbRequest.onerror = (e) => {
        logger.warn(LOG_CATEGORIES.OSMD, 'Cache init failed, will render without cache', { error: e });
      };
    } catch (e) {
      logger.warn(LOG_CATEGORIES.OSMD, 'IndexedDB not available', { error: e });
    }
  }

  // Simple hash function for MusicXML content (FR-032b)
  hashMusicXml(musicxml: string): string {
    let hash = 0;
    for (let i = 0; i < musicxml.length; i++) {
      const char = musicxml.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `${OSMDRenderer.CACHE_VERSION}_${hash.toString(36)}`;
  }

  // Get cached SVG from IndexedDB
  async getCachedRender(hash: string): Promise<string | null> {
    if (!this.cache) return null;

    return new Promise((resolve) => {
      try {
        const transaction = this.cache!.transaction(['renders'], 'readonly');
        const store = transaction.objectStore('renders');
        const request = store.get(hash);

        request.onsuccess = () => {
          resolve(request.result || null);
        };

        request.onerror = () => {
          logger.warn(LOG_CATEGORIES.OSMD, 'Cache read error');
          resolve(null);
        };
      } catch (e) {
        logger.warn(LOG_CATEGORIES.OSMD, 'Cache get failed', { error: e });
        resolve(null);
      }
    });
  }

  // Store rendered SVG in IndexedDB
  async setCachedRender(hash: string, svg: string): Promise<void> {
    if (!this.cache) return;

    try {
      const transaction = this.cache.transaction(['renders'], 'readwrite');
      const store = transaction.objectStore('renders');
      store.put(svg, hash);
    } catch (e) {
      logger.warn(LOG_CATEGORIES.OSMD, 'Cache write failed', { error: e });
    }
  }

  // Clear cached render for a specific hash
  async clearCachedRender(hash: string): Promise<void> {
    if (!this.cache) return;

    try {
      const transaction = this.cache.transaction(['renders'], 'readwrite');
      const store = transaction.objectStore('renders');
      store.delete(hash);
      logger.info(LOG_CATEGORIES.OSMD, 'Cleared cache for hash', { hash });
    } catch (e) {
      logger.warn(LOG_CATEGORIES.OSMD, 'Cache clear failed', { error: e });
    }
  }

  // Clear all cached renders
  async clearAllCache(): Promise<void> {
    if (!this.cache) return;

    try {
      const transaction = this.cache.transaction(['renders'], 'readwrite');
      const store = transaction.objectStore('renders');
      store.clear();
      logger.info(LOG_CATEGORIES.OSMD, 'Cleared all cached renders');
    } catch (e) {
      logger.warn(LOG_CATEGORIES.OSMD, 'Cache clear all failed', { error: e });
    }
  }

  async init(): Promise<void> {
    if (!this.osmd) {
      this.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(this.containerId, {
        backend: 'svg',
        drawingParameters: 'default',
        autoBeam: true,
        // Note: autoResize causes NaN errors if container size is not set
        // OSMD will still break lines based on container width at render time
        drawTitle: true,
        drawSubtitle: false,
        drawComposer: true,
        drawLyricist: false,
        drawPartNames: false,
        drawPartAbbreviations: false,
        drawCredits: false,
        drawMetronomeMarks: false,
        newSystemFromXML: true,  // Respect <print new-system="yes"/> directives
        // Optional: limit measures per line to prevent very long systems
        // fixedMeasuresPerLine: 4,
      });

      this.osmd.setLogLevel('warn');

      // Adjust spacing parameters
      const engravingRules = this.osmd.EngravingRules;
      if (engravingRules) {
        engravingRules.MinimumDistanceBetweenNotes = 2.0;
        engravingRules.MinimumNoteDistance = 2.0;
      }

      // Patch VexFlow AFTER OSMD instance is created (VexFlow is bundled inside OSMD)
      this.patchVexFlowGraceNoteGroup();
    }
  }

  async render(musicxml: string): Promise<void> {
    const myToken = ++this.renderToken;
    const hash = this.hashMusicXml(musicxml);

    // Skip if unchanged (dirty flag check - e.g., arrow key navigation)
    if (hash === this.lastMusicXmlHash) {
      logger.debug(LOG_CATEGORIES.OSMD, 'MusicXML unchanged, skipping render');
      return;
    }

    try {
      // **CRITICAL**: Clear container at the START to prevent duplication
      // This prevents accumulated renders if multiple render() calls are queued
      const container = document.getElementById(this.containerId);
      if (container) {
        container.innerHTML = '';
      }

      // Check cache first (FR-032a: display cached preview on load)
      const cachedSvg = await this.getCachedRender(hash);
      if (cachedSvg) {
        if (myToken !== this.renderToken) return; // canceled by newer update

        // **CRITICAL FIX**: Initialize OSMD first (for audio playback)
        // We MUST do this BEFORE setting cached SVG, then clear the DOM it adds
        await this.init();
        // Clear any DOM elements that init() may have added
        if (container) {
          container.innerHTML = '';
          // Set cached SVG
          container.innerHTML = cachedSvg;
        }

        // Load MusicXML into OSMD for audio processing (without re-rendering)
        await this.osmd!.load(musicxml);
        if (myToken !== this.renderToken) return; // canceled by newer update

        this.lastMusicXmlHash = hash; // Track what we rendered
        logger.debug(LOG_CATEGORIES.OSMD, 'Rendered from cache');

        // Reload audio player with new score if it exists
        await this.reloadAudioPlayerIfNeeded();
        return;
      }

      // Cache miss - perform full render (FR-032c: invalidate on content change)
      logger.debug(LOG_CATEGORIES.OSMD, 'Cache miss, rendering...');

      await this.init();
      await this.osmd!.load(musicxml);
      if (myToken !== this.renderToken) return; // canceled by newer update

      this.osmd!.Zoom = 0.75;  // Increased from 0.5 (1.5x bigger)
      await this.osmd!.render();

      // Parse MusicXML to detect which grace notes are after-grace (have steal-time-previous)
      this.parseAfterGraceNotes(musicxml);

      // Post-process: move after-grace notes to RIGHT of their anchor note via SVG manipulation
      this.moveAfterGraceNotesRight();

      // Store rendered SVG in cache
      // (container already obtained above before clearing)
      if (container) {
        const renderedSvg = container.innerHTML;
        await this.setCachedRender(hash, renderedSvg);
      }

      this.lastMusicXmlHash = hash; // Track what we rendered
      logger.debug(LOG_CATEGORIES.OSMD, 'Rendered successfully and cached');

      // Reload audio player with new score if it exists
      await this.reloadAudioPlayerIfNeeded();
    } catch (e) {
      logger.error(LOG_CATEGORIES.OSMD, 'Render error', { error: e });
    }
  }

  // Reload audio player with current score (called after render)
  async reloadAudioPlayerIfNeeded(): Promise<void> {
    if (this.audioPlayer && this.osmd && this.osmd.Sheet) {
      try {
        logger.debug(LOG_CATEGORIES.OSMD, 'Reloading audio player with updated score...');
        await this.audioPlayer.loadScore(this.osmd);
        logger.debug(LOG_CATEGORIES.OSMD, 'Audio player reloaded with new content');
      } catch (e) {
        logger.warn(LOG_CATEGORIES.OSMD, 'Failed to reload audio player', { error: e });
      }
    }
  }

  /**
   * Reposition grace notes by directly manipulating SVG transforms.
   * This approach works because VexFlow objects are recreated on re-render.
   */
  repositionAfterGraceNotesSVG(): void {
    if (!this.osmd || !this.osmd.graphic) {
      return;
    }

    try {
      const graphic = this.osmd.graphic;
      const measureList = graphic.measureList;
      if (!measureList) return;

      // Iterate through all measures to find grace notes and their anchor notes
      for (let m = 0; m < measureList.length; m++) {
        const measureStaves = measureList[m];
        if (!measureStaves) continue;

        for (let p = 0; p < measureStaves.length; p++) {
          const staffMeasure = measureStaves[p];
          if (!staffMeasure || !staffMeasure.staffEntries) continue;

          for (let s = 0; s < staffMeasure.staffEntries.length; s++) {
            const staffEntry = staffMeasure.staffEntries[s];
            if (!staffEntry || !staffEntry.graphicalVoiceEntries) continue;

            for (let v = 0; v < staffEntry.graphicalVoiceEntries.length; v++) {
              const voiceEntry = staffEntry.graphicalVoiceEntries[v];
              if (!voiceEntry) continue;

              const vfStaveNote = voiceEntry.vfStaveNote;
              if (!vfStaveNote) continue;

              // Find grace note modifiers
              for (const modifier of (vfStaveNote.modifiers || [])) {
                const isGrace = (modifier as any).getCategory?.() === 'gracenotegroups';
                console.log('[OSMD Grace SVG] Checking modifier:', {
                  category: (modifier as any).getCategory?.(),
                  isGrace,
                  constructorName: modifier.constructor.name,
                });

                if (isGrace) {
                  // Get SVG elements for grace notes and main note
                  const graceNotes = (modifier as any).grace_notes || [];
                  console.log('[OSMD Grace SVG] Grace notes count:', graceNotes.length);
                  if (graceNotes.length === 0) continue;

                  // TEMP: Force all to right for testing
                  const forceRight = true;

                  // Get the main note's SVG element position
                  const mainNoteSVG = vfStaveNote.attrs?.el;
                  console.log('[OSMD Grace SVG] Main note SVG:', {
                    exists: !!mainNoteSVG,
                    attrsKeys: vfStaveNote.attrs ? Object.keys(vfStaveNote.attrs) : [],
                  });
                  if (!mainNoteSVG) {
                    console.log('[OSMD Grace SVG] No main note SVG, skipping');
                    continue;
                  }

                  const mainBBox = (mainNoteSVG as SVGGraphicsElement).getBBox();
                  console.log('[OSMD Grace SVG] Main note bbox:', mainBBox);

                  // Try to find the grace note group's SVG elements
                  // The GraceNoteGroup modifier may have a reference to the SVG group
                  console.log('[OSMD Grace SVG] modifier keys:', Object.keys(modifier));

                  // Calculate offset based on main note position
                  // We want grace notes to appear AFTER (right of) the main note
                  const mainNoteX = mainBBox.x + mainBBox.width;

                  // Get the first grace note to determine current position
                  const firstGrace = graceNotes[0];
                  const firstGraceSVG = firstGrace?.attrs?.el;
                  if (firstGraceSVG) {
                    const firstGraceBBox = firstGraceSVG.getBBox();
                    const offsetX = mainNoteX - firstGraceBBox.x + 10; // 10px gap

                    console.log('[OSMD Grace SVG] Offset calculation:', {
                      mainNoteX,
                      graceX: firstGraceBBox.x,
                      offsetX
                    });

                    // Move ALL grace notes in the group together
                    for (const graceNote of graceNotes) {
                      const graceSVG = graceNote.attrs?.el;
                      if (!graceSVG) continue;

                      // Get current transform and add translation
                      const current = graceSVG.getAttribute('transform') || '';
                      // If already has a translate, we need to modify it
                      if (current.includes('translate')) {
                        // Parse existing translate and add offset
                        const match = current.match(/translate\(([^,]+),\s*([^)]+)\)/);
                        if (match) {
                          const existingX = parseFloat(match[1]);
                          const existingY = parseFloat(match[2]);
                          graceSVG.setAttribute('transform',
                            `translate(${existingX + offsetX}, ${existingY})`);
                        }
                      } else {
                        graceSVG.setAttribute('transform',
                          `${current} translate(${offsetX}, 0)`.trim());
                      }
                      console.log('[OSMD Grace SVG] Applied transform to grace note');
                    }

                    // Also try to move the beams and slurs if they exist
                    if ((modifier as any).beam) {
                      console.log('[OSMD Grace SVG] Found beam, would need to adjust');
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.log('[OSMD Grace SVG] Error:', (e as Error).message);
    }
  }

  /**
   * Parse MusicXML to detect which grace notes are after-grace (have steal-time-previous).
   * Stores an array of booleans, one per grace note in document order.
   */
  parseAfterGraceNotes(musicxml: string): void {
    this.afterGraceFlags = [];

    // Find all <grace> elements and check for steal-time-previous
    // Regex to match <grace.../> or <grace...> tags
    const graceRegex = /<grace[^>]*>/g;
    let match;

    while ((match = graceRegex.exec(musicxml)) !== null) {
      const graceTag = match[0];
      const isAfterGrace = graceTag.includes('steal-time-previous');
      this.afterGraceFlags.push(isAfterGrace);
      console.log('[Grace] Parsed grace note:', { graceTag, isAfterGrace });
    }

    console.log('[Grace] Total grace notes parsed:', this.afterGraceFlags.length,
                'after-grace:', this.afterGraceFlags.filter(x => x).length);
  }

  /**
   * Move after-grace notes to the RIGHT of their anchor note via SVG manipulation.
   *
   * The problem: Grace notes are attached to the FOLLOWING note in MusicXML/VexFlow,
   * so they appear LEFT of that note. But for after-grace (nachschlag), they should
   * appear RIGHT of the PREVIOUS note (their logical anchor).
   *
   * Solution: Find the GraceNoteGroup modifier and move the entire group's SVG.
   */
  moveAfterGraceNotesRight(): void {
    if (!this.osmd || !this.osmd.graphic) return;

    try {
      // Track which grace note we're on (to match with parsed afterGraceFlags)
      let graceNoteIndex = 0;

      // Collect all main notes first, then process grace notes
      const mainNotes: Array<{
        vfNote: VFStaveNote;
        staffEntry: StaffEntry;
        x: number;
        width: number;
        rightEdge: number;
      }> = [];

      for (const measureStaves of this.osmd.graphic.measureList || []) {
        for (const staffMeasure of measureStaves || []) {
          for (const staffEntry of staffMeasure?.staffEntries || []) {
            for (const voiceEntry of staffEntry?.graphicalVoiceEntries || []) {
              const vfNote = voiceEntry.vfStaveNote;
              if (!vfNote) continue;

              const pve = voiceEntry.parentVoiceEntry;
              const isGrace = pve?.Notes?.[0]?.IsGraceNote || pve?.IsGrace || false;

              if (!isGrace) {
                const svgEl = vfNote.attrs?.el;
                if (svgEl) {
                  const bbox = (svgEl as SVGGraphicsElement).getBBox();
                  mainNotes.push({
                    vfNote,
                    staffEntry,
                    x: bbox.x,
                    width: bbox.width,
                    rightEdge: bbox.x + bbox.width
                  });
                }
              }
            }
          }
        }
      }

      // Now find grace notes and position them after the PREVIOUS main note
      for (let i = 0; i < mainNotes.length; i++) {
        const noteInfo = mainNotes[i];
        const prevNoteInfo = i > 0 ? mainNotes[i - 1] : null;

        for (const modifier of (noteInfo.vfNote.modifiers || [])) {
          const category = (modifier as any).getCategory?.() || '';

          if (category === 'gracenotegroups' && (modifier as any).grace_notes?.length > 0 && prevNoteInfo) {
            const graceCount = (modifier as any).grace_notes.length;

            // Check if ALL grace notes in this group are after-grace
            // by looking at the parsed flags from MusicXML
            let isAfterGrace = true;
            for (let g = 0; g < graceCount; g++) {
              const flagIndex = graceNoteIndex + g;
              if (flagIndex >= (this.afterGraceFlags?.length || 0)) {
                console.log('[Grace] No more flags, assuming before-grace');
                isAfterGrace = false;
                break;
              }
              if (!this.afterGraceFlags[flagIndex]) {
                isAfterGrace = false;
                break;
              }
            }

            console.log('[Grace] Group detection:', {
              graceCount,
              graceNoteIndex,
              flags: this.afterGraceFlags?.slice(graceNoteIndex, graceNoteIndex + graceCount),
              isAfterGrace
            });

            // Advance the index past this group
            graceNoteIndex += graceCount;

            // Skip before-grace notes (they should stay left of following note)
            if (!isAfterGrace) {
              console.log('[Grace] Skipping before-grace note group');
              continue;
            }

            // Get first grace note element to find the container
            const firstGraceEl = (modifier as any).grace_notes[0]?.attrs?.el;
            if (!firstGraceEl) continue;

            // Find the vf-modifiers container
            const modifiersContainer = firstGraceEl.closest('.vf-modifiers');
            if (!modifiersContainer) continue;

            // Get bounding box of container and calculate offset
            const bbox = modifiersContainer.getBBox();
            const targetX = prevNoteInfo.rightEdge + 5; // Small gap after anchor note
            const offsetX = targetX - bbox.x;

            console.log('[Grace] Position debug:', {
              prevNoteRightEdge: prevNoteInfo.rightEdge,
              graceBoxX: bbox.x,
              graceBoxWidth: bbox.width,
              targetX,
              offsetX
            });

            // Move the entire vf-modifiers container (contains grace note heads and stems)
            const transformValue = `translate(${offsetX}, 0)`;
            modifiersContainer.setAttribute('transform', transformValue);
            console.log('[Grace] Set transform:', transformValue); // Used by test
          }
        }
      }
    } catch (e) {
      logger.error(LOG_CATEGORIES.OSMD, 'Error moving grace notes:', { error: (e as Error).message });
    }
  }

  /**
   * Determine if a GraceNoteGroup should be positioned on the RIGHT (after-grace/nachschlag).
   *
   * Detection strategy:
   * 1. Check staffEntry for grace VoiceEntries marked with graceAfterMainNote
   * 2. Check the anchor note's GraceNotesAfter array
   * 3. Check VexFlow grace notes for after-grace indicators
   *
   * NOTE: Currently returns false because OSMD doesn't parse steal-time-previous
   * into graceAfterMainNote. See repositionAfterGraceNotes() for details.
   */
  isAfterGraceGroup(graceGroup: any, voiceEntry: GraphicalVoiceEntry, staffEntry: StaffEntry): boolean {
    try {
      // Strategy 1: Check if any grace VE in the same staffEntry is marked as after-grace
      if (staffEntry?.graphicalVoiceEntries) {
        for (const ve of staffEntry.graphicalVoiceEntries) {
          const pve = ve.parentVoiceEntry;
          const isGrace = pve?.Notes?.[0]?.IsGraceNote || pve?.IsGrace;

          if (isGrace && pve?.graceAfterMainNote) {
            return true;
          }
        }
      }

      // Strategy 2: Check anchor note's grace properties
      if (voiceEntry?.notes) {
        for (const graphicalNote of voiceEntry.notes) {
          const sourceNote = graphicalNote?.sourceNote;
          if (sourceNote?.GraceNotesAfter?.length && sourceNote.GraceNotesAfter.length > 0) {
            return true;
          }
        }
      }

      // Strategy 3: Check VexFlow grace notes for after-grace indicators
      if (graceGroup?.grace_notes) {
        for (const gn of graceGroup.grace_notes) {
          if (gn.stealTimePrevious || gn.isAfterGrace || gn.afterGrace) {
            return true;
          }
        }
      }
    } catch (e) {
      logger.debug(LOG_CATEGORIES.OSMD, 'Error checking after-grace:', { error: (e as Error).message });
    }

    return false;
  }

  // Initialize audio player (called on first play, requires user gesture)
  async initAudioPlayer(): Promise<void> {
    if (this.audioPlayer) {
      // Already initialized, just reload the score
      logger.debug(LOG_CATEGORIES.OSMD, 'Reloading score into existing audio player...');
      await this.audioPlayer.loadScore(this.osmd!);
      logger.debug(LOG_CATEGORIES.OSMD, 'Audio player reloaded', { state: this.audioPlayer.state, ready: this.audioPlayer.ready });
      // @ts-ignore - accessing private property for debug logging
      logger.debug(LOG_CATEGORIES.OSMD, 'Iteration steps', { steps: (this.audioPlayer as any).iterationSteps });
      return;
    }

    if (!this.osmd || !this.osmd.Sheet) {
      throw new Error('OSMD not initialized or no sheet loaded. Please enter some notes first.');
    }

    logger.info(LOG_CATEGORIES.OSMD, 'Initializing audio player (first play)...');
    logger.debug(LOG_CATEGORIES.OSMD, 'OSMD instance details', {
      osmdInstance: this.osmd,
      osmdSheet: this.osmd.Sheet,
      sheetInstruments: this.osmd.Sheet.Instruments,
      sourceMeasures: this.osmd.Sheet.SourceMeasures
    });

    // Check if sheet has actual music content
    if (this.osmd.Sheet.SourceMeasures?.length === 0) {
      throw new Error('No measures in sheet. The score may not have loaded properly.');
    }

    this.audioPlayer = new PlaybackEngine();
    logger.debug(LOG_CATEGORIES.OSMD, 'PlaybackEngine created, loading score...');

    await this.audioPlayer.loadScore(this.osmd);
    logger.debug(LOG_CATEGORIES.OSMD, 'Score loaded', { state: this.audioPlayer.state, ready: this.audioPlayer.ready });

    this.audioPlayer.setBpm(120); // Default tempo
    logger.info(LOG_CATEGORIES.OSMD, 'Audio player initialized with BPM 120');
    // @ts-ignore - accessing private properties for debug logging
    logger.debug(LOG_CATEGORIES.OSMD, 'Audio player details', {
      availableInstruments: this.audioPlayer.availableInstruments?.map((i: any) => i.name),
      scoreInstruments: (this.audioPlayer as any).scoreInstruments?.map((i: any) => i.Name),
      // @ts-ignore - private property
      iterationSteps: (this.audioPlayer as any).iterationSteps,
      // @ts-ignore - private property
      scheduler: (this.audioPlayer as any).scheduler,
      // @ts-ignore - private property
      schedulerStepQueue: (this.audioPlayer as any).scheduler?.stepQueue
    });

    // Debug: Check if cursor works
    if (this.osmd.cursor) {
      logger.debug(LOG_CATEGORIES.OSMD, 'Cursor exists', { exists: !!this.osmd.cursor });
      logger.debug(LOG_CATEGORIES.OSMD, 'Cursor Iterator', { iterator: this.osmd.cursor.Iterator });
      logger.debug(LOG_CATEGORIES.OSMD, 'Current voice entries', { entries: this.osmd.cursor.Iterator?.CurrentVoiceEntries });
    } else {
      logger.error(LOG_CATEGORIES.OSMD, 'No cursor found!');
    }
  }
}
