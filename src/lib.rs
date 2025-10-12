//! Music Notation Editor WASM Module
//!
//! This is the main WASM module for the Music Notation Editor POC.
//! It provides core functionality for Cell-based musical notation editing.

pub mod models;
pub mod parse;
pub mod renderers;
pub mod utils;
pub mod api;

// Re-export commonly used types
pub use models::core::*;
pub use models::elements::*;
pub use models::notation::*;

use wasm_bindgen::prelude::*;

// This is like the `main` function, but for WASM modules.
#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
    console_log::init_with_level(log::Level::Debug).expect("failed to initialize logger");

    log::info!("Music Notation Editor WASM module initialized");
}