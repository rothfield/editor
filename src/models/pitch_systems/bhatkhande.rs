//! Bhatkhande system pitch implementation
//!
//! Bhatkhande notation is a standardized system for Indian classical music.

pub struct BhatkhandeSystem;

impl BhatkhandeSystem {
    pub fn pitch_sequence() -> Vec<&'static str> {
        vec!["S", "R", "G", "M", "P", "D", "N"]
    }
}