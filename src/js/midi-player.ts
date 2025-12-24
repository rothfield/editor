/**
 * MIDI Player Module
 * Implements MIDI playback for the music notation editor using Tone.js
 */

// @ts-ignore - Tone.js is loaded from CDN
import * as Tone from 'tone';

interface PlaybackEvent {
  time: number;
  pitch: number;
  duration: number;
  velocity: number;
  channel: number;
}

interface EventListeners {
  play: Array<(data: any) => void>;
  pause: Array<(data: any) => void>;
  stop: Array<(data: any) => void>;
  note: Array<(data: any) => void>;
  beat: Array<(data: any) => void>;
  end: Array<(data: any) => void>;
  [key: string]: Array<(data: any) => void>;
}

export class MidiPlayer {
  private bpm: number = 120;
  private playing: boolean = false;
  private currentPosition: number = 0;
  private synth: any = null;
  private events: PlaybackEvent[] = [];
  private currentDocument: unknown = null;
  private eventListeners: EventListeners;

  constructor() {
    this.eventListeners = {
      play: [],
      pause: [],
      stop: [],
      note: [],
      beat: [],
      end: []
    };

    this.init();
  }

  async init(): Promise<void> {
    try {
      console.log('✅ MIDI Player initialized (audio will start on user interaction)');
    } catch (error) {
      console.error('Failed to initialize MIDI Player:', error);
      throw error;
    }
  }

  // Playback Control Methods
  async play(musicXML: string | null = null): Promise<void> {
    try {
      // Ensure Tone.js is started (requires user interaction)
      if (Tone.context.state !== 'running') {
        console.log('🔊 Starting audio context...');
        await Tone.start();
        console.log('🔊 Audio context started, state:', Tone.context.state);
      }

      // Create audio components if not already created
      if (!this.synth) {
        this.synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "triangle" },
          envelope: {
            attack: 0.005,
            decay: 0.1,
            sustain: 0.3,
            release: 1
          }
        }).toDestination();

        console.log('🎹 Synthesizer created');
      }

      // Set tempo
      Tone.Transport.bpm.value = this.bpm;

      if (musicXML) {
        console.log('📝 Parsing MusicXML for playback...');
        this.events = this.musicXMLToPlaybackEvents(musicXML);
        this.currentPosition = 0;
        console.log(`✅ Parsed ${this.events.length} notes from MusicXML`);
      }

      if (!this.events || !this.events.length) {
        console.warn('⚠️ No events to play. MusicXML may be empty or invalid.');
        return;
      }

      // Clear any previous scheduled events
      Tone.Transport.cancel();
      Tone.Transport.position = 0;

      this.playing = true;

      // Play notes directly with absolute timing
      console.log('🎵 Scheduling playback events...');
      const now = Tone.now();

      for (const event of this.events) {
        const noteTime = now + event.time;
        const frequency = Tone.Frequency(event.pitch, "midi").toFrequency();

        this.synth.triggerAttackRelease(
          frequency,
          event.duration,
          noteTime,
          event.velocity / 127
        );
      }

      console.log(`✅ Scheduled ${this.events.length} notes for playback`);

      this.emit('play');
      console.log(`🎵 Playback started with ${this.events.length} events`);

    } catch (error) {
      console.error('Playback error:', error);
      this.playing = false;
    }
  }

  pause(): void {
    if (!this.playing) return;

    this.playing = false;
    Tone.Transport.pause();

    this.emit('pause');
    console.log('⏸️ Playback paused');
  }

  stop(): void {
    this.playing = false;
    this.currentPosition = 0;

    // Stop all sounds immediately
    if (this.synth) {
      this.synth.releaseAll();
    }

    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.position = 0;

    this.emit('stop');
    console.log('⏹️ Playback stopped');
  }

  // Configuration Methods
  setTempo(bpm: number): void {
    this.bpm = Math.max(40, Math.min(208, bpm));
    Tone.Transport.bpm.value = this.bpm;
    console.log(`🎼 Tempo set to ${this.bpm} BPM`);
  }

  setVolume(dB: number): void {
    const clampedVolume = Math.max(-60, Math.min(0, dB));
    if (this.synth) {
      this.synth.volume.value = clampedVolume;
    }
    console.log(`🔊 Volume set to ${clampedVolume} dB`);
  }

  // MusicXML Parsing
  musicXMLToPlaybackEvents(musicXMLString: string): PlaybackEvent[] {
    const events: PlaybackEvent[] = [];

    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(musicXMLString, 'text/xml');

      // Check for parsing errors
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        console.error('MusicXML parsing error:', parserError.textContent);
        return events;
      }

      let currentTime = 0;
      const divisions = parseInt(xmlDoc.querySelector('divisions')?.textContent || '1');
      const beatsPerMinute = this.bpm;
      const beatDuration = 60 / beatsPerMinute; // seconds per beat

      // Parse all notes from all measures
      const measures = xmlDoc.querySelectorAll('measure');
      console.log(`📊 Found ${measures.length} measures in MusicXML`);

      for (const measure of measures) {
        const notes = measure.querySelectorAll('note');

        for (const note of notes) {
          const isRest = note.querySelector('rest') !== null;

          if (!isRest) {
            // Get pitch information
            const pitch = note.querySelector('pitch');
            if (pitch) {
              const step = pitch.querySelector('step')?.textContent || 'C';
              const octave = parseInt(pitch.querySelector('octave')?.textContent || '4');
              const alter = parseInt(pitch.querySelector('alter')?.textContent || '0');

              // Convert to MIDI note number
              const midiNote = this.pitchToMIDI(step, octave, alter);

              // Get duration
              const duration = parseInt(note.querySelector('duration')?.textContent || String(divisions));
              const durationInSeconds = (duration / divisions) * beatDuration * 0.75; // 3/4 articulation

              events.push({
                time: currentTime,
                pitch: midiNote,
                duration: durationInSeconds,
                velocity: 80,
                channel: 0
              });

              console.log(`🎵 Note: ${step}${octave} (MIDI ${midiNote}) at ${currentTime.toFixed(2)}s for ${durationInSeconds.toFixed(2)}s`);
            }
          }

          // Advance time based on note duration
          const duration = parseInt(note.querySelector('duration')?.textContent || String(divisions));
          currentTime += (duration / divisions) * beatDuration;
        }
      }

      console.log(`✅ Parsed ${events.length} notes from MusicXML`);
      return events;

    } catch (error) {
      console.error('Error parsing MusicXML:', error);
      return events;
    }
  }

  pitchToMIDI(step: string, octave: number, alter: number = 0): number {
    const stepValues: Record<string, number> = {
      'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
    };

    const baseNote = stepValues[step] || 0;
    const midiNote = (octave + 1) * 12 + baseNote + alter;

    return midiNote;
  }

  // State Query Methods
  isPlaying(): boolean {
    return this.playing;
  }

  getCurrentTime(): number {
    return Tone.Transport.seconds;
  }

  getDuration(): number {
    if (!this.events.length) return 0;
    const lastEvent = this.events[this.events.length - 1];
    return lastEvent.time + lastEvent.duration;
  }

  // Event System
  on(event: string, callback: (data: any) => void): void {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback);
    }
  }

  off(event: string, callback: (data: any) => void): void {
    if (this.eventListeners[event]) {
      const index = this.eventListeners[event].indexOf(callback);
      if (index > -1) {
        this.eventListeners[event].splice(index, 1);
      }
    }
  }

  emit(event: string, data: any = null): void {
    if (this.eventListeners[event]) {
      for (const callback of this.eventListeners[event]) {
        callback(data);
      }
    }
  }

  // Cleanup
  dispose(): void {
    this.stop();

    if (this.synth) this.synth.dispose();

    this.eventListeners = { play: [], pause: [], stop: [], note: [], beat: [], end: [] };
    console.log('🗑️ MIDI Player disposed');
  }
}

export default MidiPlayer;
