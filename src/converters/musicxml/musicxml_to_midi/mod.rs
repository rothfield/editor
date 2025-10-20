mod model;
mod parse;
mod write;

pub use model::*;
pub use parse::parse_musicxml;
pub use write::write_smf;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum MxError {
    #[error("xml parse error: {0}")]
    Xml(String),
    #[error("invalid musicxml: {0}")]
    Invalid(String),
    #[error("midi write error: {0}")]
    Midi(String),
}

pub type Result<T> = std::result::Result<T, MxError>;

/// Convert MusicXML bytes to SMF (Standard MIDI File) bytes
///
/// # Arguments
/// * `xml` - MusicXML document as bytes
/// * `tpq` - Ticks per quarter note (typically 480 or 960)
///
/// # Returns
/// * MIDI file bytes ready for download
pub fn musicxml_to_midi(xml: &[u8], tpq: u16) -> Result<Vec<u8>> {
    let mut score = parse_musicxml(xml)?;
    if tpq != 0 {
        score.tpq = tpq;
    }
    let mut out = Vec::new();
    write_smf(&score, &mut out)?;
    Ok(out)
}
