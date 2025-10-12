//! Tabla notation system implementation
//!
//! Tabla notation uses specific syllables for tabla bols.

pub struct TablaSystem;

impl TablaSystem {
    pub fn pitch_sequence() -> Vec<&'static str> {
        vec!["dha", "dhin", "na", "tin", "ta", "ke", "te"]
    }
}