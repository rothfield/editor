//! Helper utilities for MusicXML export
//!
//! Contains logging macros and mathematical utilities used across the MusicXML module.

/// Log a message for MusicXML export
pub fn log_musicxml(message: &str) {
    #[cfg(target_arch = "wasm32")]
    {
        web_sys::console::log_1(&format!("[MusicXML] {}", message).into());
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        println!("[MusicXML] {}", message);
    }
}

/// Logging macro for MusicXML export
#[macro_export]
macro_rules! musicxml_log {
    ($($arg:tt)*) => {
        $crate::renderers::musicxml::helpers::log_musicxml(&format!($($arg)*));
    };
}

/// Calculate least common multiple
pub fn lcm(a: usize, b: usize) -> usize {
    if a == 0 || b == 0 {
        return 0;
    }
    (a * b) / gcd(a, b)
}

/// Calculate greatest common divisor
pub fn gcd(a: usize, b: usize) -> usize {
    if b == 0 {
        a
    } else {
        gcd(b, a % b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gcd() {
        assert_eq!(gcd(12, 8), 4);
        assert_eq!(gcd(17, 5), 1);
        assert_eq!(gcd(100, 50), 50);
    }

    #[test]
    fn test_lcm() {
        assert_eq!(lcm(12, 8), 24);
        assert_eq!(lcm(4, 6), 12);
        assert_eq!(lcm(3, 5), 15);
    }
}
