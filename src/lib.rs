//! Music Notation Editor WASM Module
//!
//! This is the main WASM module for the Music Notation Editor POC.
//! It provides core functionality for CharCell-based musical notation editing.

pub mod models;
pub mod parse;
pub mod renderers;
pub mod utils;

// Re-export commonly used types
pub use models::core::*;
pub use models::elements::*;
pub use models::notation::*;

use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// This is like the `main` function, but for WASM modules.
#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
    console_log::init_with_level(log::Level::Debug).expect("failed to initialize logger");

    log::info!("Music Notation Editor WASM module initialized");
}