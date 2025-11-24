//! Default values for MIDI export
//!
//! Provides sensible defaults for tempo, velocity, channel assignment, etc.

/// Default tempo in beats per minute
pub const DEFAULT_TEMPO_BPM: f64 = 120.0;

/// Default MIDI velocity (1-127, where 64 is "normal")
pub const DEFAULT_VELOCITY: u8 = 64;

/// Default MIDI program (0 = Acoustic Grand Piano in General MIDI)
pub const DEFAULT_PROGRAM: u8 = 0;

/// Default ticks per quarter note (MIDI resolution)
/// 480 is standard and provides good resolution
pub const DEFAULT_TPQ: u16 = 480;

/// Assign MIDI channel from part index
/// - Channels 0-15 are available
/// - Channel 9 (10 in 1-indexed) is reserved for drums
/// - Skip channel 9 for melodic instruments
pub fn assign_channel(part_index: usize) -> u8 {
    let channel = part_index % 16;
    if channel >= 9 {
        // Skip channel 9 (drums), map 9→10, 10→11, etc.
        ((channel + 1) % 16) as u8
    } else {
        channel as u8
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_assign_channel() {
        assert_eq!(assign_channel(0), 0);
        assert_eq!(assign_channel(1), 1);
        assert_eq!(assign_channel(8), 8);
        assert_eq!(assign_channel(9), 10);  // Skip channel 9
        assert_eq!(assign_channel(10), 11);
        assert_eq!(assign_channel(15), 0);  // Wrap around
    }

    #[test]
    fn test_defaults() {
        assert_eq!(DEFAULT_TEMPO_BPM, 120.0);
        assert_eq!(DEFAULT_VELOCITY, 64);
        assert_eq!(DEFAULT_PROGRAM, 0);
        assert_eq!(DEFAULT_TPQ, 480);
    }
}
