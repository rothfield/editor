use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use crate::models::core::{Line, Cell, Document};
use crate::models::elements::PitchSystem;
use crate::parse::beats::BeatDeriver;
use crate::api::helpers::pitch_system_from_u8;
use crate::parse::grammar::parse_single;

// ============================================================================
// MARKUP TAG REGISTRY - Single Source of Truth
// ============================================================================

/// Category of markup tag
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TagCategory {
    /// Document-level metadata (title, composer)
    Document,
    /// Structural grouping (system)
    Structural,
    /// Line-level metadata (lyrics, tala)
    LineMeta,
    /// Span tags enclosing content (slur, sup)
    Span,
    /// Self-closing modifier tags (octave, accidental)
    Modifier,
    /// Configuration (pitch-system, notation)
    Config,
}

/// Definition of a supported markup tag
#[derive(Debug, Clone)]
pub struct TagDefinition {
    /// Primary tag name
    pub name: &'static str,
    /// Aliases (short forms)
    pub aliases: &'static [&'static str],
    /// Category
    pub category: TagCategory,
    /// Whether tag is self-closing
    pub self_closing: bool,
    /// Brief description
    pub description: &'static str,
}

/// Registry of all supported markup tags
pub struct MarkupTagRegistry;

impl MarkupTagRegistry {
    /// Get all supported tags
    pub fn all_tags() -> &'static [TagDefinition] {
        &[
            // Document-level tags
            TagDefinition {
                name: "title",
                aliases: &["tit"],
                category: TagCategory::Document,
                self_closing: false,
                description: "Composition title",
            },
            TagDefinition {
                name: "composer",
                aliases: &["com"],
                category: TagCategory::Document,
                self_closing: false,
                description: "Composer/author name",
            },

            // Structural tags
            TagDefinition {
                name: "system",
                aliases: &[],
                category: TagCategory::Structural,
                self_closing: false, // Can be block style <system>...</system> or inline <system N/>
                description: "Musical system grouping (block or inline with count)",
            },

            // Line metadata tags
            TagDefinition {
                name: "lyrics",
                aliases: &["lyr"],
                category: TagCategory::LineMeta,
                self_closing: false,
                description: "Lyrics syllables for the line",
            },
            TagDefinition {
                name: "tala",
                aliases: &[],
                category: TagCategory::LineMeta,
                self_closing: false,
                description: "Rhythmic cycle markers (tala/sam)",
            },

            // Span tags (enclosing content)
            TagDefinition {
                name: "sup",
                aliases: &[],
                category: TagCategory::Span,
                self_closing: false,
                description: "Grace notes (superscript notation)",
            },
            TagDefinition {
                name: "slur",
                aliases: &[],
                category: TagCategory::Span,
                self_closing: false,
                description: "Legato phrasing (curved line above)",
            },

            // Modifier tags (self-closing)
            TagDefinition {
                name: "nl",
                aliases: &[],
                category: TagCategory::Modifier,
                self_closing: true,
                description: "Line break within system",
            },
            TagDefinition {
                name: "up",
                aliases: &["uper"],
                category: TagCategory::Modifier,
                self_closing: true,
                description: "Upper octave (+1)",
            },
            TagDefinition {
                name: "down",
                aliases: &["low"],
                category: TagCategory::Modifier,
                self_closing: true,
                description: "Lower octave (-1)",
            },
            TagDefinition {
                name: "up2",
                aliases: &["hi"],
                category: TagCategory::Modifier,
                self_closing: true,
                description: "Two octaves up (+2)",
            },
            TagDefinition {
                name: "down2",
                aliases: &["lowest"],
                category: TagCategory::Modifier,
                self_closing: true,
                description: "Two octaves down (-2)",
            },
            TagDefinition {
                name: "mid",
                aliases: &[],
                category: TagCategory::Modifier,
                self_closing: true,
                description: "Middle octave (reset to 0)",
            },
            TagDefinition {
                name: "#",
                aliases: &[],
                category: TagCategory::Modifier,
                self_closing: true,
                description: "Sharp (raise half-step)",
            },
            TagDefinition {
                name: "b",
                aliases: &[],
                category: TagCategory::Modifier,
                self_closing: true,
                description: "Flat (lower half-step)",
            },
            TagDefinition {
                name: "n",
                aliases: &[],
                category: TagCategory::Modifier,
                self_closing: true,
                description: "Natural (cancel accidental)",
            },
            TagDefinition {
                name: "x",
                aliases: &[],
                category: TagCategory::Modifier,
                self_closing: true,
                description: "Double sharp (raise whole-step)",
            },
            TagDefinition {
                name: "bb",
                aliases: &[],
                category: TagCategory::Modifier,
                self_closing: true,
                description: "Double flat (lower whole-step)",
            },
            TagDefinition {
                name: "hb",
                aliases: &[],
                category: TagCategory::Modifier,
                self_closing: true,
                description: "Half-flat (quarter-tone lower)",
            },
            TagDefinition {
                name: "oct",
                aliases: &[],
                category: TagCategory::Modifier,
                self_closing: true,
                description: "Absolute octave (-2 to +2), e.g., <oct=1/>",
            },

            // Configuration tags
            TagDefinition {
                name: "notation",
                aliases: &["pitch-system", "lang"],
                category: TagCategory::Config,
                self_closing: false,
                description: "Pitch system selection (number/western/sargam)",
            },
        ]
    }

    /// Check if a tag name is supported (including aliases)
    pub fn is_supported(tag_name: &str) -> bool {
        Self::all_tags().iter().any(|def| {
            def.name == tag_name || def.aliases.contains(&tag_name)
        })
    }

    /// Get tag definition by name (including aliases)
    pub fn get_definition(tag_name: &str) -> Option<&'static TagDefinition> {
        Self::all_tags().iter().find(|def| {
            def.name == tag_name || def.aliases.contains(&tag_name)
        })
    }

    /// Get all tags in a category
    pub fn tags_by_category(category: TagCategory) -> Vec<&'static TagDefinition> {
        Self::all_tags().iter()
            .filter(|def| def.category == category)
            .collect()
    }

    /// Generate documentation for all supported tags
    pub fn generate_docs() -> String {
        let mut output = String::from("# Supported Markup Tags\n\n");

        for category in [
            TagCategory::Document,
            TagCategory::Structural,
            TagCategory::LineMeta,
            TagCategory::Span,
            TagCategory::Modifier,
            TagCategory::Config,
        ] {
            output.push_str(&format!("## {:?} Tags\n\n", category));

            let tags = Self::tags_by_category(category);
            for def in tags {
                let aliases_str = if !def.aliases.is_empty() {
                    format!(" (aliases: {})", def.aliases.join(", "))
                } else {
                    String::new()
                };

                let closing = if def.self_closing { "self-closing" } else { "paired" };

                output.push_str(&format!(
                    "- `<{}>` {}{} - {}\n",
                    def.name, closing, aliases_str, def.description
                ));
            }
            output.push('\n');
        }

        output
    }
}

// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct RenderedDocument {
    title: Option<String>,
    composer: Option<String>,
    systems: Vec<RenderedSystem>,
    lyrics: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenderedSystem {
    lines: Vec<RenderedLine>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenderedLine {
    text: String,
    cells: Vec<CellInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CellInfo {
    codepoint: u32,
    char: String,
}

/// Render notation markup to PUA codepoint strings (for preview/testing)
///
/// Supports tags:
/// - Document: <title>, <composer>, <system>, <lyrics> (or short: <tit>, <com>, <lyr>)
/// - Inline: <sup>, <slur>, <nl/>
/// - Octaves: <up/>, <down/>, <up2/>, <down2/> (or <uper/>, <low/>, <hi/>, <lowest/>, <mid/>)
/// - Accidentals: <#/>, <b/>, <n/>, <x/>, <bb/>, <hb/>
#[wasm_bindgen(js_name = renderNotation)]
pub fn render_notation(pitch_system: u8, markup: &str) -> Result<JsValue, JsValue> {
    let system = pitch_system_from_u8(pitch_system);

    let doc = parse_markup(markup, system)
        .map_err(|e| JsValue::from_str(&e))?;

    serde_wasm_bindgen::to_value(&doc)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Import notation markup and convert to Document structure
///
/// This function parses markup and creates a full Document that can be loaded
/// into the editor, replacing the current document content.
///
/// Supports all tags from renderNotation plus creates a proper Document structure.
#[wasm_bindgen(js_name = importNotationMarkup)]
pub fn import_notation_markup(pitch_system: u8, markup: &str) -> Result<JsValue, JsValue> {
    let system = pitch_system_from_u8(pitch_system);

    let document = markup_to_document(markup, system)
        .map_err(|e| JsValue::from_str(&e))?;

    serde_wasm_bindgen::to_value(&document)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Get documentation for all supported markup tags
///
/// Returns a markdown-formatted string listing all supported tags organized by category.
/// This is the single source of truth for markup language capabilities.
#[wasm_bindgen(js_name = getSupportedMarkupTags)]
pub fn get_supported_markup_tags() -> String {
    MarkupTagRegistry::generate_docs()
}

/// Check if a markup tag is supported
///
/// Returns true if the tag name (including aliases) is in the registry.
#[wasm_bindgen(js_name = isMarkupTagSupported)]
pub fn is_markup_tag_supported(tag_name: &str) -> bool {
    MarkupTagRegistry::is_supported(tag_name)
}

/// Convert markup to a full Document structure
pub fn markup_to_document(markup: &str, default_system: PitchSystem) -> Result<Document, String> {
    let mut document = Document::new();

    // Parse for pitch-system tag first
    let mut pitch_system = default_system;
    let mut pos = 0;
    let chars: Vec<char> = markup.chars().collect();

    // First pass: extract pitch-system if specified
    let mut temp_pos = 0;
    while temp_pos < chars.len() {
        skip_whitespace(&chars, &mut temp_pos);
        if temp_pos >= chars.len() {
            break;
        }

        if chars[temp_pos] == '<' {
            if let Ok((tag_name, content, _)) = parse_tag(&chars, temp_pos) {
                if tag_name == "notation" || tag_name == "pitch-system" || tag_name == "lang" {
                    pitch_system = match content.trim().to_lowercase().as_str() {
                        "number" | "1" | "num" => PitchSystem::Number,
                        "western" | "2" | "abc" | "staff" => PitchSystem::Western,
                        "sargam" | "3" | "indian" => PitchSystem::Sargam,
                        _ => return Err(format!("Unknown notation: {}", content)),
                    };
                    break;
                }
            }
        }
        temp_pos += 1;
    }

    // Set pitch system
    document.pitch_system = Some(pitch_system);

    // Second pass: parse all tags
    while pos < chars.len() {
        skip_whitespace(&chars, &mut pos);
        if pos >= chars.len() {
            break;
        }

        if chars[pos] == '<' {
            // Special handling for <system> tags with auto-close
            if is_tag_at(&chars, pos, "system") {
                let (content, end_pos) = parse_system_content_autoclose(&chars, pos)?;
                pos = end_pos;
                let lines = parse_system_to_lines(&content, pitch_system)?;
                document.lines.extend(lines);
                continue;
            }

            let (tag_name, content, end_pos) = parse_tag(&chars, pos)?;
            pos = end_pos;

            match tag_name.as_str() {
                "title" | "tit" => document.title = Some(content),
                "composer" | "com" => document.composer = Some(content),
                "notation" | "pitch-system" | "lang" => {
                    // Already handled in first pass
                }
                "system" => {
                    // Should not reach here due to special handling above
                    let lines = parse_system_to_lines(&content, pitch_system)?;
                    document.lines.extend(lines);
                }
                _ => {} // Ignore unknown document-level tags
            }
        } else {
            pos += 1;
        }
    }

    Ok(document)
}

/// Parse a <system> block and return Line objects
fn parse_system_to_lines(content: &str, system: PitchSystem) -> Result<Vec<Line>, String> {
    // Expand <nl/> to actual newlines
    let processed_content = expand_nl_tags(content)?;

    // Split by newlines - DON'T filter empty lines (they mark boundaries)
    let line_texts: Vec<&str> = processed_content.split('\n').collect();

    let mut lines = Vec::new();
    let mut pending_tala = String::new();
    let mut pending_lyrics = String::new();
    let mut after_blank_line = false;  // Track blank line boundaries

    for line_text in line_texts {
        // Check if this is a blank line
        if line_text.trim().is_empty() {
            after_blank_line = true;
            continue;
        }

        // Extract line metadata (lyrics, tala) and get notation text
        let (notation_text, line_metadata) = extract_line_metadata(line_text)?;

        if notation_text.trim().is_empty() {
            // Metadata-only line
            if !line_metadata.lyrics.is_empty() {
                if after_blank_line || lines.is_empty() {
                    // Forward attachment (after blank line or at start)
                    pending_lyrics = line_metadata.lyrics;
                } else {
                    // Backward attachment (to previous line)
                    let prev_line: &mut Line = lines.last_mut().unwrap();
                    if !prev_line.lyrics.is_empty() {
                        prev_line.lyrics.push(' ');
                    }
                    prev_line.lyrics.push_str(&line_metadata.lyrics);
                }
            }
            if !line_metadata.tala.is_empty() {
                // Tala always forward
                pending_tala = line_metadata.tala;
            }
            continue;
        }

        // Line with notation - create it
        // Process inline tags and modifiers to get notation characters
        let notation_chars = process_inline_modifiers(&notation_text, system)?;

        // Convert notation characters to cells
        let mut line = Line::new();
        line.pitch_system = Some(system);

        for notation_char in notation_chars {
            line.cells.push(notation_char.to_cell(system));
        }

        // Apply pending metadata (forward-attached)
        if !pending_tala.is_empty() {
            line.tala = pending_tala.clone();
            pending_tala.clear();
        }
        if !pending_lyrics.is_empty() {
            line.lyrics = pending_lyrics.clone();
            pending_lyrics.clear();
        }

        // Apply inline metadata
        if !line_metadata.tala.is_empty() {
            line.tala = line_metadata.tala;
        }
        if !line_metadata.lyrics.is_empty() {
            line.lyrics = line_metadata.lyrics;
        }
        if line_metadata.system_start_count.is_some() {
            line.system_start_count = line_metadata.system_start_count;
        }

        // Sync text from cells
        line.sync_text_from_cells();

        // Apply line variants (beat grouping and slurs)
        let beat_deriver = BeatDeriver::new();
        let beats = beat_deriver.extract_implicit_beats(&line.cells);
        line.draw_slurs()
            .draw_beat_groups(&beats)
            .apply_line_variants();

        lines.push(line);
        after_blank_line = false;  // Reset boundary flag
    }

    // Mark system boundaries
    // All <system> blocks get system_start_count set (even single-line)
    // This distinguishes them from plain unmarked text
    if !lines.is_empty() {
        lines.first_mut().unwrap().system_start_count = Some(lines.len());
    }

    Ok(lines)
}

/// Parse markup document into structured format
fn parse_markup(markup: &str, system: PitchSystem) -> Result<RenderedDocument, String> {
    let mut title = None;
    let mut composer = None;
    let mut systems = Vec::new();
    let mut lyrics = Vec::new();

    let mut pos = 0;
    let chars: Vec<char> = markup.chars().collect();

    while pos < chars.len() {
        skip_whitespace(&chars, &mut pos);
        if pos >= chars.len() {
            break;
        }

        if chars[pos] == '<' {
            let (tag_name, content, end_pos) = parse_tag(&chars, pos)?;
            pos = end_pos;

            match tag_name.as_str() {
                "title" | "tit" => title = Some(content),
                "composer" | "com" => composer = Some(content),
                "notation" | "pitch-system" | "lang" => {
                    // Ignore - pitch system is passed as parameter to this function
                }
                "lyrics" | "lyr" => lyrics.push(content),
                "system" => {
                    let rendered_system = parse_system(&content, system)?;
                    systems.push(rendered_system);
                }
                _ => return Err(format!("Unknown tag: {}", tag_name)),
            }
        } else {
            pos += 1;
        }
    }

    Ok(RenderedDocument {
        title,
        composer,
        systems,
        lyrics,
    })
}

/// Parse a <system> block containing notation with inline modifiers
fn parse_system(content: &str, system: PitchSystem) -> Result<RenderedSystem, String> {
    // Expand <nl/> to actual newlines and extract line metadata
    let processed_content = expand_nl_tags(content)?;

    // Split by newlines
    let line_texts: Vec<&str> = processed_content.split('\n')
        .filter(|s| !s.trim().is_empty())
        .collect();

    let mut rendered_lines = Vec::new();

    for line_text in line_texts {
        // Extract line metadata (lyrics, tala) and get notation text
        let (notation_text, line_metadata) = extract_line_metadata(line_text)?;

        // Process inline tags and modifiers to get notation characters
        let notation_chars = process_inline_modifiers(&notation_text, system)?;

        // Convert notation characters to cells
        let mut line = Line::new();
        line.pitch_system = Some(system);

        for notation_char in notation_chars {
            line.cells.push(notation_char.to_cell(system));
        }

        // Set line metadata
        if !line_metadata.lyrics.is_empty() {
            line.lyrics = line_metadata.lyrics;
        }
        if !line_metadata.tala.is_empty() {
            line.tala = line_metadata.tala;
        }

        // Sync text from cells
        line.sync_text_from_cells();

        // Apply line variants (beat grouping and slurs)
        let beat_deriver = BeatDeriver::new();
        let beats = beat_deriver.extract_implicit_beats(&line.cells);
        line.draw_slurs()
            .draw_beat_groups(&beats)
            .apply_line_variants();

        // Extract rendered text and cell info
        let text: String = line.cells.iter()
            .map(|c| c.get_char())
            .collect();

        let cells: Vec<CellInfo> = line.cells.iter()
            .map(|c| CellInfo {
                codepoint: c.get_codepoint(),
                char: c.get_char().to_string(),
            })
            .collect();

        rendered_lines.push(RenderedLine { text, cells });
    }

    Ok(RenderedSystem { lines: rendered_lines })
}

// ============================================================================
// Data Structures for Markup Parsing
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq)]
enum Accidental {
    Sharp,
    Flat,
    Natural,
    DoubleSharp,
    DoubleFlat,
    HalfFlat,
}

#[derive(Debug, Clone)]
struct LineMetadata {
    lyrics: String,
    tala: String,
    system_start_count: Option<usize>,
}

impl Default for LineMetadata {
    fn default() -> Self {
        Self {
            lyrics: String::new(),
            tala: String::new(),
            system_start_count: None,
        }
    }
}

#[derive(Debug, Clone)]
struct NotationChar {
    base_char: char,
    octave_offset: i8,
    accidental: Option<Accidental>,
    is_superscript: bool,
    slur_position: SlurPosition,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum SlurPosition {
    None,
    Start,
    Middle,
    End,
    Single, // Single-note slur (both start and end)
}

impl NotationChar {
    fn new(base_char: char) -> Self {
        Self {
            base_char,
            octave_offset: 0,
            accidental: None,
            is_superscript: false,
            slur_position: SlurPosition::None,
        }
    }

    fn to_cell(self, pitch_system: PitchSystem) -> Cell {
        use crate::renderers::font_utils::{to_superscript, glyph_for_pitch};

        // Start with parsing the base character
        let mut cell = parse_single(self.base_char, pitch_system, None);

        // Get pitch code if this is a pitched element
        let pitch_code = if let Some(pc) = cell.get_pitch_code() {
            pc
        } else {
            // Non-pitched element (barline, rest, etc.) - apply superscript only
            if self.is_superscript {
                if let Some(super_cp) = to_superscript(cell.codepoint) {
                    cell.codepoint = super_cp;
                }
            }
            return cell;
        };

        // Apply accidental to pitch code if specified
        let modified_pitch = if let Some(accidental) = self.accidental {
            match accidental {
                Accidental::Sharp => pitch_code.add_sharp().unwrap_or(pitch_code),
                Accidental::Flat => pitch_code.add_flat().unwrap_or(pitch_code),
                Accidental::Natural => pitch_code.to_natural(),
                Accidental::DoubleSharp => {
                    // Apply sharp twice
                    pitch_code.add_sharp()
                        .and_then(|pc| pc.add_sharp())
                        .unwrap_or(pitch_code)
                }
                Accidental::DoubleFlat => {
                    // Apply flat twice
                    pitch_code.add_flat()
                        .and_then(|pc| pc.add_flat())
                        .unwrap_or(pitch_code)
                }
                Accidental::HalfFlat => {
                    // Half-flat: try to construct from degree
                    use crate::models::pitch_code::PitchCode;
                    match pitch_code.degree() {
                        1 => PitchCode::N1hf,
                        2 => PitchCode::N2hf,
                        3 => PitchCode::N3hf,
                        4 => PitchCode::N4hf,
                        5 => PitchCode::N5hf,
                        6 => PitchCode::N6hf,
                        7 => PitchCode::N7hf,
                        _ => pitch_code,
                    }
                }
            }
        } else {
            pitch_code
        };

        // Apply octave offset by looking up the correct glyph
        let final_glyph = if self.octave_offset != 0 || self.accidental.is_some() {
            glyph_for_pitch(modified_pitch, self.octave_offset, pitch_system)
                .unwrap_or(self.base_char)
        } else {
            self.base_char
        };

        // Create new cell with the modified glyph
        cell.codepoint = final_glyph as u32;

        // Apply superscript if needed
        if self.is_superscript {
            if let Some(super_cp) = to_superscript(cell.codepoint) {
                cell.codepoint = super_cp;
            }
        }

        // Slur position will be handled by draw_slurs() later

        cell
    }
}

// ============================================================================
// Tag Processing Functions
// ============================================================================

/// Expand <nl/> tags to actual newlines
fn expand_nl_tags(content: &str) -> Result<String, String> {
    let mut result = String::new();
    let chars: Vec<char> = content.chars().collect();
    let mut pos = 0;

    while pos < chars.len() {
        let ch = chars[pos];

        if ch == '<' {
            if let Some(tag_end) = find_char(&chars, pos + 1, '>') {
                let tag_str: String = chars[pos+1..tag_end].iter().collect();

                if tag_str.ends_with('/') {
                    let tag_name = tag_str[..tag_str.len()-1].trim();

                    if tag_name == "nl" {
                        result.push('\n');
                        pos = tag_end + 1;
                        continue;
                    }
                }
            }
        }

        result.push(ch);
        pos += 1;
    }

    Ok(result)
}

/// Extract line metadata (<lyrics>, <tala>) from a line of text
/// Returns (notation_text, metadata)
fn extract_line_metadata(line: &str) -> Result<(String, LineMetadata), String> {
    let mut metadata = LineMetadata::default();
    let mut notation_text = String::new();

    let chars: Vec<char> = line.chars().collect();
    let mut pos = 0;

    while pos < chars.len() {
        let ch = chars[pos];

        if ch == '<' {
            if let Some(tag_end) = find_char(&chars, pos + 1, '>') {
                let tag_str: String = chars[pos+1..tag_end].iter().collect();
                let tag_name = tag_str.trim();

                // Check for self-closing <system N/> tag
                if tag_name.ends_with('/') {
                    let inner = tag_name[..tag_name.len()-1].trim();
                    if inner.starts_with("system ") {
                        let count_str = inner["system ".len()..].trim();
                        if let Ok(count) = count_str.parse::<usize>() {
                            metadata.system_start_count = Some(count);
                            pos = tag_end + 1;
                            continue;
                        }
                    }
                }

                // Check if this is a line metadata tag
                if matches!(tag_name, "lyrics" | "lyr" | "tala") {
                    // Find closing tag
                    let (_, content, end_pos) = parse_tag(&chars, pos)?;

                    match tag_name {
                        "lyrics" | "lyr" => {
                            if !metadata.lyrics.is_empty() {
                                metadata.lyrics.push(' ');
                            }
                            metadata.lyrics.push_str(&content);
                        }
                        "tala" => {
                            if !metadata.tala.is_empty() {
                                metadata.tala.push(' ');
                            }
                            metadata.tala.push_str(&content);
                        }
                        _ => {}
                    }

                    pos = end_pos;
                    continue;
                }
            }
        }

        notation_text.push(ch);
        pos += 1;
    }

    Ok((notation_text, metadata))
}

/// Process inline modifiers (<sup>, <slur>, <up/>, <#/>, etc.)
fn process_inline_modifiers(text: &str, _pitch_system: PitchSystem) -> Result<Vec<NotationChar>, String> {
    let mut result = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut pos = 0;

    // Track current modifiers to apply to next character
    let mut pending_octave: i8 = 0;
    let mut pending_accidental: Option<Accidental> = None;
    let mut in_superscript = false;
    let mut in_slur = false;
    let mut slur_chars: Vec<NotationChar> = Vec::new();

    while pos < chars.len() {
        let ch = chars[pos];

        if ch == '<' {
            if let Some(tag_end) = find_char(&chars, pos + 1, '>') {
                let tag_str: String = chars[pos+1..tag_end].iter().collect();

                // Handle self-closing tags (modifiers)
                if tag_str.ends_with('/') {
                    let tag_name = tag_str[..tag_str.len()-1].trim();

                    // Check for oct=N format (e.g., "oct=1", "oct=-2")
                    if tag_name.starts_with("oct=") {
                        if let Ok(oct_value) = tag_name[4..].parse::<i8>() {
                            pending_octave = oct_value.clamp(-2, 2);
                        }
                    } else {
                        match tag_name {
                            // Octave modifiers
                            "up" | "uper" => pending_octave = 1,
                            "up2" | "hi" => pending_octave = 2,
                            "down" | "low" => pending_octave = -1,
                            "down2" | "lowest" => pending_octave = -2,
                            "mid" => pending_octave = 0,

                            // Accidentals
                            "#" => pending_accidental = Some(Accidental::Sharp),
                            "b" => pending_accidental = Some(Accidental::Flat),
                            "n" => pending_accidental = Some(Accidental::Natural),
                            "x" => pending_accidental = Some(Accidental::DoubleSharp),
                            "bb" => pending_accidental = Some(Accidental::DoubleFlat),
                            "hb" => pending_accidental = Some(Accidental::HalfFlat),

                            _ => {} // Unknown self-closing tag, ignore
                        }
                    }

                    pos = tag_end + 1;
                    continue;
                }

                // Handle container tags
                let tag_name = tag_str.trim();

                if tag_name == "sup" {
                    // Start superscript mode
                    in_superscript = true;
                    pos = tag_end + 1;
                    continue;
                } else if tag_name == "/sup" {
                    // End superscript mode
                    in_superscript = false;
                    pos = tag_end + 1;
                    continue;
                } else if tag_name == "slur" {
                    // Start slur mode
                    in_slur = true;
                    slur_chars.clear();
                    pos = tag_end + 1;
                    continue;
                } else if tag_name == "/slur" {
                    // End slur mode and apply slur positions
                    let slur_len = slur_chars.len();
                    for (i, mut nc) in slur_chars.drain(..).enumerate() {
                        nc.slur_position = if slur_len == 1 {
                            SlurPosition::Single
                        } else if i == 0 {
                            SlurPosition::Start
                        } else if i == slur_len - 1 {
                            SlurPosition::End
                        } else {
                            SlurPosition::Middle
                        };
                        result.push(nc);
                    }
                    in_slur = false;
                    pos = tag_end + 1;
                    continue;
                }
            }
        }

        // Regular character - create NotationChar
        if !ch.is_whitespace() && ch != '<' && ch != '>' {
            let mut nc = NotationChar::new(ch);
            nc.octave_offset = pending_octave;
            nc.accidental = pending_accidental;
            nc.is_superscript = in_superscript;

            if in_slur {
                slur_chars.push(nc);
            } else {
                result.push(nc);
            }

            // Reset one-time modifiers after applying
            // NOTE: pending_octave persists until changed (not reset per-character)
            pending_accidental = None;
        } else if ch.is_whitespace() {
            // Preserve whitespace characters (spaces, newlines)
            result.push(NotationChar::new(ch));
        }

        pos += 1;
    }

    Ok(result)
}

// Helper functions

fn skip_whitespace(chars: &[char], pos: &mut usize) {
    while *pos < chars.len() && chars[*pos].is_whitespace() {
        *pos += 1;
    }
}

fn find_char(chars: &[char], start: usize, target: char) -> Option<usize> {
    for i in start..chars.len() {
        if chars[i] == target {
            return Some(i);
        }
    }
    None
}

/// Check if a specific opening tag is at the given position
/// Example: is_tag_at(&chars, 0, "system") checks for "<system>"
fn is_tag_at(chars: &[char], pos: usize, tag_name: &str) -> bool {
    if pos >= chars.len() || chars[pos] != '<' {
        return false;
    }

    let expected = format!("<{}", tag_name);
    let available: String = chars[pos..std::cmp::min(pos + expected.len() + 1, chars.len())]
        .iter()
        .collect();

    // Check for "<tagname>" or "<tagname " (with space/attributes)
    available.starts_with(&expected) &&
        (available.chars().nth(expected.len()) == Some('>') ||
         available.chars().nth(expected.len()) == Some(' '))
}

/// Parse system content with auto-closing behavior
/// Returns (content, end_position)
///
/// Auto-closes when:
/// - Finds explicit </system> tag
/// - Finds next <system> tag (implicit close)
/// - Reaches end of input (implicit close)
fn parse_system_content_autoclose(chars: &[char], start: usize) -> Result<(String, usize), String> {
    if !is_tag_at(chars, start, "system") {
        return Err("Expected <system> tag".to_string());
    }

    // Find the end of opening tag
    let tag_end = find_char(chars, start + 1, '>')
        .ok_or_else(|| "Unclosed <system> tag".to_string())?;

    let content_start = tag_end + 1;
    let mut pos = content_start;

    // Scan for: </system>, <system>, or EOF
    while pos < chars.len() {
        if chars[pos] == '<' {
            let remaining: String = chars[pos..].iter().collect();

            // Check for explicit closing tag </system>
            if remaining.starts_with("</system>") {
                let content: String = chars[content_start..pos].iter().collect();
                return Ok((content, pos + "</system>".len()));
            }

            // Check for implicit close: next <system> tag
            if is_tag_at(chars, pos, "system") {
                // Auto-close: return content up to this point, position stays at new <system>
                let content: String = chars[content_start..pos].iter().collect();
                return Ok((content, pos));
            }
        }
        pos += 1;
    }

    // EOF: auto-close
    let content: String = chars[content_start..].iter().collect();
    Ok((content, chars.len()))
}

/// Parse a tag and its content
/// Returns (tag_name, content, end_position)
fn parse_tag(chars: &[char], start: usize) -> Result<(String, String, usize), String> {
    if chars[start] != '<' {
        return Err("Expected '<' at start of tag".to_string());
    }

    // Find tag name end
    let tag_end = find_char(chars, start + 1, '>')
        .ok_or_else(|| "Unclosed tag".to_string())?;

    let tag_name: String = chars[start+1..tag_end].iter().collect();
    let tag_name = tag_name.trim().to_string();

    // Find closing tag
    let closing_tag = format!("</{}>", tag_name);
    let mut pos = tag_end + 1;
    let mut depth = 1;
    let content_start = pos;

    while pos < chars.len() && depth > 0 {
        if chars[pos] == '<' {
            // Check if this is our closing tag
            let remaining: String = chars[pos..].iter().collect();
            if remaining.starts_with(&closing_tag) {
                depth -= 1;
                if depth == 0 {
                    let content: String = chars[content_start..pos].iter().collect();
                    return Ok((tag_name, content, pos + closing_tag.len()));
                }
            } else if remaining[1..].starts_with(&tag_name) {
                depth += 1;
            }
        }
        pos += 1;
    }

    Err(format!("Unclosed tag: {}", tag_name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_tag() {
        let input = "<title>My Song</title>rest";
        let chars: Vec<char> = input.chars().collect();
        let (name, content, end) = parse_tag(&chars, 0).unwrap();
        assert_eq!(name, "title");
        assert_eq!(content, "My Song");
        assert_eq!(end, 22);
    }

    #[test]
    fn test_expand_nl_tags() {
        let input = "1 2<nl/>3 4";
        let result = expand_nl_tags(input).unwrap();
        assert_eq!(result, "1 2\n3 4");
    }

    #[test]
    fn test_expand_nl_tags_multiple() {
        let input = "line1<nl/>line2<nl/>line3";
        let result = expand_nl_tags(input).unwrap();
        assert_eq!(result, "line1\nline2\nline3");
    }

    #[test]
    fn test_extract_line_metadata_lyrics() {
        let input = "| 1 2 3 4 | <lyrics>do re mi fa</lyrics>";
        let (notation, metadata) = extract_line_metadata(input).unwrap();
        assert_eq!(notation, "| 1 2 3 4 | ");
        assert_eq!(metadata.lyrics, "do re mi fa");
        assert_eq!(metadata.tala, "");
    }

    #[test]
    fn test_extract_line_metadata_tala() {
        let input = "| 1 2 3 4 | <tala>S . . .</tala>";
        let (notation, metadata) = extract_line_metadata(input).unwrap();
        assert_eq!(notation, "| 1 2 3 4 | ");
        assert_eq!(metadata.tala, "S . . .");
        assert_eq!(metadata.lyrics, "");
    }

    #[test]
    fn test_extract_line_metadata_both() {
        let input = "| 1 2 3 4 | <lyrics>do re mi fa</lyrics> <tala>S . . .</tala>";
        let (notation, metadata) = extract_line_metadata(input).unwrap();
        assert_eq!(notation, "| 1 2 3 4 |  ");
        assert_eq!(metadata.lyrics, "do re mi fa");
        assert_eq!(metadata.tala, "S . . .");
    }

    #[test]
    fn test_extract_line_metadata_multiple_lyrics() {
        let input = "1 2 <lyrics>do re</lyrics> 3 4 <lyrics>mi fa</lyrics>";
        let (notation, metadata) = extract_line_metadata(input).unwrap();
        assert_eq!(notation, "1 2  3 4 ");
        assert_eq!(metadata.lyrics, "do re mi fa");
    }

    #[test]
    fn test_extract_line_metadata_short_form() {
        let input = "| 1 2 3 4 | <lyr>do re mi fa</lyr>";
        let (notation, metadata) = extract_line_metadata(input).unwrap();
        assert_eq!(metadata.lyrics, "do re mi fa");
    }

    #[test]
    fn test_process_inline_modifiers_simple() {
        let input = "1 2 3 4";
        let result = process_inline_modifiers(input, PitchSystem::Number).unwrap();
        assert_eq!(result.len(), 7); // 4 notes + 3 spaces
        assert_eq!(result[0].base_char, '1');
        assert_eq!(result[2].base_char, '2');
    }

    #[test]
    fn test_process_inline_modifiers_octave() {
        let input = "<up/>1 <down/>2";
        let result = process_inline_modifiers(input, PitchSystem::Number).unwrap();
        assert_eq!(result[0].octave_offset, 1);
        assert_eq!(result[0].base_char, '1');
        assert_eq!(result[2].octave_offset, -1);
        assert_eq!(result[2].base_char, '2');
    }

    #[test]
    fn test_process_inline_modifiers_accidental() {
        let input = "<#/>1 <b/>2";
        let result = process_inline_modifiers(input, PitchSystem::Number).unwrap();
        assert_eq!(result[0].accidental, Some(Accidental::Sharp));
        assert_eq!(result[2].accidental, Some(Accidental::Flat));
    }

    #[test]
    fn test_process_inline_modifiers_superscript() {
        let input = "<sup>12</sup>3";
        let result = process_inline_modifiers(input, PitchSystem::Number).unwrap();
        // Filter out non-notation characters
        let notes: Vec<_> = result.iter().filter(|nc| !nc.base_char.is_whitespace()).collect();
        assert_eq!(notes.len(), 3);
        assert!(notes[0].is_superscript); // 1
        assert!(notes[1].is_superscript); // 2
        assert!(!notes[2].is_superscript); // 3
    }

    #[test]
    fn test_process_inline_modifiers_slur() {
        let input = "<slur>1 2 3</slur> 4";
        let result = process_inline_modifiers(input, PitchSystem::Number).unwrap();
        let notes: Vec<_> = result.iter().filter(|nc| !nc.base_char.is_whitespace()).collect();
        assert_eq!(notes.len(), 4);
        assert_eq!(notes[0].slur_position, SlurPosition::Start);
        assert_eq!(notes[1].slur_position, SlurPosition::Middle);
        assert_eq!(notes[2].slur_position, SlurPosition::End);
        assert_eq!(notes[3].slur_position, SlurPosition::None);
    }

    #[test]
    fn test_process_inline_modifiers_slur_single() {
        let input = "<slur>1</slur>";
        let result = process_inline_modifiers(input, PitchSystem::Number).unwrap();
        assert_eq!(result[0].slur_position, SlurPosition::Single);
    }

    #[test]
    fn test_process_inline_modifiers_combined() {
        let input = "<sup><#/>1</sup> <up/><b/>2";
        let result = process_inline_modifiers(input, PitchSystem::Number).unwrap();
        let notes: Vec<_> = result.iter().filter(|nc| !nc.base_char.is_whitespace()).collect();
        assert_eq!(notes.len(), 2);
        // First note: superscript with sharp
        assert!(notes[0].is_superscript);
        assert_eq!(notes[0].accidental, Some(Accidental::Sharp));
        // Second note: up octave with flat
        assert_eq!(notes[1].octave_offset, 1);
        assert_eq!(notes[1].accidental, Some(Accidental::Flat));
    }

    #[test]
    fn test_process_inline_modifiers_octave_aliases() {
        let input = "<uper/>1 <hi/>2 <low/>3 <lowest/>4";
        let result = process_inline_modifiers(input, PitchSystem::Number).unwrap();
        let notes: Vec<_> = result.iter().filter(|nc| !nc.base_char.is_whitespace()).collect();
        assert_eq!(notes[0].octave_offset, 1);  // uper
        assert_eq!(notes[1].octave_offset, 2);  // hi
        assert_eq!(notes[2].octave_offset, -1); // low
        assert_eq!(notes[3].octave_offset, -2); // lowest
    }

    #[test]
    fn test_process_inline_modifiers_oct_absolute() {
        // Test <oct=N/> format for absolute octave setting
        let input = "<oct=1/>1 <oct=-1/>2 <oct=0/>3 <oct=2/>4";
        let result = process_inline_modifiers(input, PitchSystem::Number).unwrap();
        let notes: Vec<_> = result.iter().filter(|nc| !nc.base_char.is_whitespace()).collect();
        assert_eq!(notes[0].octave_offset, 1);   // oct=1
        assert_eq!(notes[1].octave_offset, -1);  // oct=-1
        assert_eq!(notes[2].octave_offset, 0);   // oct=0
        assert_eq!(notes[3].octave_offset, 2);   // oct=2
    }

    #[test]
    fn test_process_inline_modifiers_oct_clamping() {
        // Test that oct values are clamped to -2..2 range
        let input = "<oct=5/>1 <oct=-10/>2";
        let result = process_inline_modifiers(input, PitchSystem::Number).unwrap();
        let notes: Vec<_> = result.iter().filter(|nc| !nc.base_char.is_whitespace()).collect();
        assert_eq!(notes[0].octave_offset, 2);   // clamped from 5
        assert_eq!(notes[1].octave_offset, -2);  // clamped from -10
    }

    #[test]
    fn test_parse_markup_simple() {
        let markup = r#"<title>Test Song</title>
<composer>Test Composer</composer>

<system>
1 2 3 4
</system>"#;

        let result = parse_markup(markup, PitchSystem::Number);
        assert!(result.is_ok());
        let doc = result.unwrap();
        assert_eq!(doc.title, Some("Test Song".to_string()));
        assert_eq!(doc.composer, Some("Test Composer".to_string()));
        assert_eq!(doc.systems.len(), 1);
        assert_eq!(doc.systems[0].lines.len(), 1);
    }

    #[test]
    fn test_parse_markup_with_lyrics() {
        let markup = r#"<system>
| 1 2 3 4 | <lyrics>do re mi fa</lyrics>
</system>"#;

        let result = parse_markup(markup, PitchSystem::Number);
        assert!(result.is_ok());
        let doc = result.unwrap();
        assert_eq!(doc.systems.len(), 1);
        assert_eq!(doc.systems[0].lines.len(), 1);
        // Note: lyrics are stored on Line but not in RenderedDocument currently
    }

    #[test]
    fn test_parse_markup_compact_nl() {
        let markup = r#"<system>1 2 3 4<nl/>5 6 7 1</system>"#;

        let result = parse_markup(markup, PitchSystem::Number);
        assert!(result.is_ok());
        let doc = result.unwrap();
        assert_eq!(doc.systems.len(), 1);
        assert_eq!(doc.systems[0].lines.len(), 2); // Two lines due to <nl/>
    }

    #[test]
    fn test_parse_markup_notation_tag() {
        // Test new <notation> tag
        let markup = r#"<notation>western</notation>
<system>C D E F G A B</system>"#;

        let result = parse_markup(markup, PitchSystem::Number);
        assert!(result.is_ok(), "Should accept <notation> tag");
        let doc = result.unwrap();
        assert_eq!(doc.systems.len(), 1);
    }

    #[test]
    fn test_parse_markup_lyrics_on_separate_line() {
        // Test that lyrics on a separate line apply to the previous line
        let markup = r#"<notation>number</notation>
<system>
| 1 2 3 4 | 5 6 7 1 |
<lyrics>do re mi fa sol la ti do</lyrics>
</system>"#;

        let result = markup_to_document(markup, PitchSystem::Number);
        assert!(result.is_ok(), "Should parse markup with lyrics on separate line");
        let doc = result.unwrap();

        assert_eq!(doc.lines.len(), 1, "Should have exactly one line");
        assert_eq!(doc.lines[0].lyrics, "do re mi fa sol la ti do",
                   "Lyrics should be attached to the first line");
    }

    #[test]
    fn test_parse_markup_sargam_pitch_system() {
        let markup = r#"<title>Sargam Test</title>
<pitch-system>sargam</pitch-system>

<system>
S R G m P D N Ṡ
</system>"#;

        let result = parse_markup(markup, PitchSystem::Number); // Default is Number, but markup overrides
        if let Err(e) = &result {
            eprintln!("Parse error: {}", e);
        }
        assert!(result.is_ok());
        let doc = result.unwrap();
        assert_eq!(doc.title, Some("Sargam Test".to_string()));
        assert_eq!(doc.systems.len(), 1);
        assert_eq!(doc.systems[0].lines.len(), 1);
        // Should have parsed S R G m P D N successfully
    }

    #[test]
    #[cfg(target_arch = "wasm32")]
    fn test_importNotationMarkup_sargam() {
        let markup = r#"<pitch-system>sargam</pitch-system>
<system>S R G m</system>"#;

        let result = import_notation_markup(1, markup); // pitchSystem 1 = Number, but markup has sargam tag
        assert!(result.is_ok());
    }

    #[test]
    fn test_tala_forward_attachment() {
        let markup = r#"<system>
1 2 3 4
<tala>teentaal</tala>
5 6 7 1
</system>"#;

        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        // Tala always applies to NEXT line
        assert_eq!(doc.lines[0].tala, "");
        assert_eq!(doc.lines[1].tala, "teentaal");
    }

    #[test]
    fn test_lyrics_backward_attachment() {
        let markup = r#"<system>
| 1 2 3 4 |
<lyrics>do re mi fa</lyrics>
</system>"#;

        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        // No blank line → backward attachment
        assert_eq!(doc.lines[0].lyrics, "do re mi fa");
    }

    #[test]
    fn test_lyrics_forward_after_blank() {
        let markup = r#"<system>
| 1 2 3 4 |

<lyrics>do re mi fa</lyrics>
| 5 6 7 1 |
</system>"#;

        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        // Blank line boundary → forward attachment
        assert_eq!(doc.lines[0].lyrics, "");
        assert_eq!(doc.lines[1].lyrics, "do re mi fa");
    }

    #[test]
    fn test_multiline_system_polyphony() {
        let markup = r#"<system>
1 2 3 4
5 6 7 1
2 3 4 5
</system>"#;

        let mut doc = markup_to_document(markup, PitchSystem::Number).unwrap();
        doc.recalculate_system_and_part_ids();

        // Verify system start count
        assert_eq!(doc.lines[0].system_start_count, Some(3));
        assert_eq!(doc.lines[1].system_start_count, None);
        assert_eq!(doc.lines[2].system_start_count, None);

        // All in same system
        assert_eq!(doc.lines[0].system_id, 1);
        assert_eq!(doc.lines[1].system_id, 1);
        assert_eq!(doc.lines[2].system_id, 1);

        // Different voices (part_ids)
        assert_ne!(doc.lines[0].part_id, doc.lines[1].part_id);
        assert_ne!(doc.lines[1].part_id, doc.lines[2].part_id);
    }

    #[test]
    fn test_markup_octave_up() {
        // Test <up/> tag applies octave +1 to cells
        let markup = r#"<system><up/>1 2 3</system>"#;
        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        assert_eq!(doc.lines.len(), 1);
        let line = &doc.lines[0];

        // Filter out space cells, get only pitched cells
        let pitched_cells: Vec<_> = line.cells.iter()
            .filter(|c| c.get_pitch_code().is_some())
            .collect();

        assert_eq!(pitched_cells.len(), 3);
        assert_eq!(pitched_cells[0].get_octave(), 1, "First note should have octave +1");
        assert_eq!(pitched_cells[1].get_octave(), 1, "Second note should have octave +1");
        assert_eq!(pitched_cells[2].get_octave(), 1, "Third note should have octave +1");
    }

    #[test]
    fn test_markup_octave_down() {
        // Test <down/> tag applies octave -1 to cells
        let markup = r#"<system><low/>5 6 7</system>"#;
        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        assert_eq!(doc.lines.len(), 1);
        let pitched_cells: Vec<_> = doc.lines[0].cells.iter()
            .filter(|c| c.get_pitch_code().is_some())
            .collect();

        assert_eq!(pitched_cells.len(), 3);
        assert_eq!(pitched_cells[0].get_octave(), -1, "Should have octave -1");
        assert_eq!(pitched_cells[1].get_octave(), -1, "Should have octave -1");
        assert_eq!(pitched_cells[2].get_octave(), -1, "Should have octave -1");
    }

    #[test]
    fn test_markup_octave_hi() {
        // Test <hi/> tag applies octave +2 to cells
        let markup = r#"<system><hi/>1 2</system>"#;
        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        let pitched_cells: Vec<_> = doc.lines[0].cells.iter()
            .filter(|c| c.get_pitch_code().is_some())
            .collect();

        assert_eq!(pitched_cells[0].get_octave(), 2, "Should have octave +2");
        assert_eq!(pitched_cells[1].get_octave(), 2, "Should have octave +2");
    }

    #[test]
    fn test_markup_octave_lowest() {
        // Test <lowest/> tag applies octave -2 to cells
        let markup = r#"<system><lowest/>3 4</system>"#;
        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        let pitched_cells: Vec<_> = doc.lines[0].cells.iter()
            .filter(|c| c.get_pitch_code().is_some())
            .collect();

        assert_eq!(pitched_cells[0].get_octave(), -2, "Should have octave -2");
        assert_eq!(pitched_cells[1].get_octave(), -2, "Should have octave -2");
    }

    #[test]
    fn test_markup_octave_mid_reset() {
        // Test <mid/> tag resets to octave 0
        let markup = r#"<system><up/>1 <mid/>2 3</system>"#;
        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        let pitched_cells: Vec<_> = doc.lines[0].cells.iter()
            .filter(|c| c.get_pitch_code().is_some())
            .collect();

        assert_eq!(pitched_cells[0].get_octave(), 1, "First note should have octave +1");
        assert_eq!(pitched_cells[1].get_octave(), 0, "Second note should have octave 0 (mid reset)");
        assert_eq!(pitched_cells[2].get_octave(), 0, "Third note should have octave 0");
    }

    #[test]
    fn test_markup_accidental_sharp() {
        // Test <#/> tag applies sharp to pitch code
        use crate::models::pitch_code::PitchCode;

        let markup = r#"<system><#/>1</system>"#;
        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        let pitched_cells: Vec<_> = doc.lines[0].cells.iter()
            .filter(|c| c.get_pitch_code().is_some())
            .collect();

        assert_eq!(pitched_cells.len(), 1);
        assert_eq!(pitched_cells[0].get_pitch_code(), Some(PitchCode::N1s), "Should have sharp applied");
    }

    #[test]
    fn test_markup_accidental_flat() {
        // Test <b/> tag applies flat to pitch code
        use crate::models::pitch_code::PitchCode;

        let markup = r#"<system><b/>2</system>"#;
        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        let pitched_cells: Vec<_> = doc.lines[0].cells.iter()
            .filter(|c| c.get_pitch_code().is_some())
            .collect();

        assert_eq!(pitched_cells[0].get_pitch_code(), Some(PitchCode::N2b), "Should have flat applied");
    }

    #[test]
    fn test_markup_octave_and_accidental_combined() {
        // Test octave and accidental can be combined
        use crate::models::pitch_code::PitchCode;

        let markup = r#"<system><up/><#/>1</system>"#;
        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        let pitched_cells: Vec<_> = doc.lines[0].cells.iter()
            .filter(|c| c.get_pitch_code().is_some())
            .collect();

        assert_eq!(pitched_cells[0].get_pitch_code(), Some(PitchCode::N1s), "Should have sharp applied");
        assert_eq!(pitched_cells[0].get_octave(), 1, "Should have octave +1");
    }

    #[test]
    fn test_system_auto_close_on_new_system() {
        // Test that a new <system> tag auto-closes the previous one
        let markup = r#"<system>
1 2 3 4
<system>
5 6 7 1
</system>"#;

        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        assert_eq!(doc.lines.len(), 2, "Should have 2 lines from 2 systems");

        // After recalculation, should have 2 separate systems
        let mut doc = doc;
        doc.recalculate_system_and_part_ids();

        assert_eq!(doc.lines[0].system_id, 1, "First line should be system 1");
        assert_eq!(doc.lines[1].system_id, 2, "Second line should be system 2");
    }

    #[test]
    fn test_system_auto_close_at_eof() {
        // Test that unclosed <system> is auto-closed at EOF
        let markup = r#"<system>
1 2 3 4"#;

        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        assert_eq!(doc.lines.len(), 1, "Should have 1 line");
    }

    #[test]
    fn test_system_explicit_close_still_works() {
        // Test that explicit </system> still works
        let markup = r#"<system>
1 2 3 4
</system>
<system>
5 6 7 1
</system>"#;

        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        assert_eq!(doc.lines.len(), 2, "Should have 2 lines from 2 systems");
    }

    #[test]
    fn test_system_multiple_auto_close() {
        // Test multiple systems with auto-close
        let markup = r#"<system>
1 2 3 4
<system>
5 6 7 1
<system>
2 3 4 5
</system>"#;

        let doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        assert_eq!(doc.lines.len(), 3, "Should have 3 lines from 3 systems");

        let mut doc = doc;
        doc.recalculate_system_and_part_ids();

        assert_eq!(doc.lines[0].system_id, 1, "First line should be system 1");
        assert_eq!(doc.lines[1].system_id, 2, "Second line should be system 2");
        assert_eq!(doc.lines[2].system_id, 3, "Third line should be system 3");
    }

    #[test]
    fn test_system_multiline_with_auto_close() {
        // Test that multi-line systems work with auto-close
        let markup = r#"<system>
1 2 3 4
5 6 7 1
<system>
2 3 4 5
</system>"#;

        let mut doc = markup_to_document(markup, PitchSystem::Number).unwrap();

        assert_eq!(doc.lines.len(), 3, "Should have 3 lines");

        doc.recalculate_system_and_part_ids();

        // First system has 2 lines
        assert_eq!(doc.lines[0].system_id, 1, "First line should be system 1");
        assert_eq!(doc.lines[1].system_id, 1, "Second line should be system 1 (same system)");
        assert_eq!(doc.lines[0].system_start_count, Some(2), "First line should have start count of 2");
        assert_eq!(doc.lines[1].system_start_count, None, "Second line should have no start count");

        // Second system has 1 line (marked as single-line system)
        assert_eq!(doc.lines[2].system_id, 2, "Third line should be system 2");
        assert_eq!(doc.lines[2].system_start_count, Some(1), "Single-line <system> should have marker Some(1)");
    }

    // ========================================================================
    // Tag Registry Tests
    // ========================================================================

    #[test]
    fn test_tag_registry_is_supported() {
        // Test core tags
        assert!(MarkupTagRegistry::is_supported("title"));
        assert!(MarkupTagRegistry::is_supported("composer"));
        assert!(MarkupTagRegistry::is_supported("system"));
        assert!(MarkupTagRegistry::is_supported("lyrics"));
        assert!(MarkupTagRegistry::is_supported("tala"));
        assert!(MarkupTagRegistry::is_supported("sup"));
        assert!(MarkupTagRegistry::is_supported("slur"));
        assert!(MarkupTagRegistry::is_supported("nl"));

        // Test octave tags
        assert!(MarkupTagRegistry::is_supported("up"));
        assert!(MarkupTagRegistry::is_supported("down"));
        assert!(MarkupTagRegistry::is_supported("up2"));
        assert!(MarkupTagRegistry::is_supported("down2"));
        assert!(MarkupTagRegistry::is_supported("mid"));

        // Test accidentals
        assert!(MarkupTagRegistry::is_supported("#"));
        assert!(MarkupTagRegistry::is_supported("b"));
        assert!(MarkupTagRegistry::is_supported("n"));
        assert!(MarkupTagRegistry::is_supported("x"));
        assert!(MarkupTagRegistry::is_supported("bb"));
        assert!(MarkupTagRegistry::is_supported("hb"));

        // Test config tags
        assert!(MarkupTagRegistry::is_supported("notation"));

        // Test unsupported tags
        assert!(!MarkupTagRegistry::is_supported("unknown"));
        assert!(!MarkupTagRegistry::is_supported("fake"));
        assert!(!MarkupTagRegistry::is_supported(""));
    }

    #[test]
    fn test_tag_registry_aliases() {
        // Test that aliases work
        assert!(MarkupTagRegistry::is_supported("tit")); // alias for title
        assert!(MarkupTagRegistry::is_supported("com")); // alias for composer
        assert!(MarkupTagRegistry::is_supported("lyr")); // alias for lyrics
        assert!(MarkupTagRegistry::is_supported("uper")); // alias for up
        assert!(MarkupTagRegistry::is_supported("low")); // alias for down
        assert!(MarkupTagRegistry::is_supported("hi")); // alias for up2
        assert!(MarkupTagRegistry::is_supported("lowest")); // alias for down2
        assert!(MarkupTagRegistry::is_supported("pitch-system")); // alias for notation
        assert!(MarkupTagRegistry::is_supported("lang")); // alias for notation
    }

    #[test]
    fn test_tag_registry_get_definition() {
        // Test getting definition for primary name
        let title_def = MarkupTagRegistry::get_definition("title");
        assert!(title_def.is_some());
        let title_def = title_def.unwrap();
        assert_eq!(title_def.name, "title");
        assert_eq!(title_def.category, TagCategory::Document);
        assert!(!title_def.self_closing);

        // Test getting definition via alias
        let composer_def = MarkupTagRegistry::get_definition("com");
        assert!(composer_def.is_some());
        let composer_def = composer_def.unwrap();
        assert_eq!(composer_def.name, "composer"); // Returns primary name
        assert_eq!(composer_def.category, TagCategory::Document);

        // Test unknown tag
        assert!(MarkupTagRegistry::get_definition("unknown").is_none());
    }

    #[test]
    fn test_tag_registry_by_category() {
        // Test document tags
        let doc_tags = MarkupTagRegistry::tags_by_category(TagCategory::Document);
        assert_eq!(doc_tags.len(), 2); // title, composer
        assert!(doc_tags.iter().any(|t| t.name == "title"));
        assert!(doc_tags.iter().any(|t| t.name == "composer"));

        // Test modifier tags
        let modifier_tags = MarkupTagRegistry::tags_by_category(TagCategory::Modifier);
        assert!(modifier_tags.len() >= 10); // At least nl, octaves, accidentals

        // Test structural tags
        let structural_tags = MarkupTagRegistry::tags_by_category(TagCategory::Structural);
        assert_eq!(structural_tags.len(), 1); // system
        assert_eq!(structural_tags[0].name, "system");

        // Test line metadata tags
        let line_meta_tags = MarkupTagRegistry::tags_by_category(TagCategory::LineMeta);
        assert_eq!(line_meta_tags.len(), 2); // lyrics, tala

        // Test span tags
        let span_tags = MarkupTagRegistry::tags_by_category(TagCategory::Span);
        assert_eq!(span_tags.len(), 2); // sup, slur
    }

    #[test]
    fn test_tag_registry_generate_docs() {
        let docs = MarkupTagRegistry::generate_docs();

        // Should contain markdown headers
        assert!(docs.contains("# Supported Markup Tags"));
        assert!(docs.contains("## Document Tags"));
        assert!(docs.contains("## Structural Tags"));
        assert!(docs.contains("## LineMeta Tags"));
        assert!(docs.contains("## Span Tags"));
        assert!(docs.contains("## Modifier Tags"));

        // Should contain specific tag mentions
        assert!(docs.contains("`<title>`"));
        assert!(docs.contains("`<composer>`"));
        assert!(docs.contains("`<system>`"));
        assert!(docs.contains("`<lyrics>`"));
        assert!(docs.contains("`<up>`"));
        assert!(docs.contains("`<#>`"));

        // Should show aliases
        assert!(docs.contains("aliases: tit"));
        assert!(docs.contains("aliases: com"));
        assert!(docs.contains("aliases: lyr"));
    }

    #[test]
    fn test_tag_registry_self_closing_flags() {
        // Modifier tags should be self-closing
        assert!(MarkupTagRegistry::get_definition("nl").unwrap().self_closing);
        assert!(MarkupTagRegistry::get_definition("up").unwrap().self_closing);
        assert!(MarkupTagRegistry::get_definition("#").unwrap().self_closing);

        // Document and span tags should NOT be self-closing
        assert!(!MarkupTagRegistry::get_definition("title").unwrap().self_closing);
        assert!(!MarkupTagRegistry::get_definition("lyrics").unwrap().self_closing);
        assert!(!MarkupTagRegistry::get_definition("sup").unwrap().self_closing);
        assert!(!MarkupTagRegistry::get_definition("slur").unwrap().self_closing);
    }

    #[test]
    fn test_tag_registry_completeness() {
        // Ensure registry has all expected tags - prevents accidental omissions
        let all_tags = MarkupTagRegistry::all_tags();

        // Count by category
        let doc_count = all_tags.iter().filter(|t| t.category == TagCategory::Document).count();
        let structural_count = all_tags.iter().filter(|t| t.category == TagCategory::Structural).count();
        let line_meta_count = all_tags.iter().filter(|t| t.category == TagCategory::LineMeta).count();
        let span_count = all_tags.iter().filter(|t| t.category == TagCategory::Span).count();
        let modifier_count = all_tags.iter().filter(|t| t.category == TagCategory::Modifier).count();
        let config_count = all_tags.iter().filter(|t| t.category == TagCategory::Config).count();

        assert_eq!(doc_count, 2, "Should have 2 document tags");
        assert_eq!(structural_count, 1, "Should have 1 structural tag");
        assert_eq!(line_meta_count, 2, "Should have 2 line metadata tags");
        assert_eq!(span_count, 2, "Should have 2 span tags");
        assert_eq!(modifier_count, 12, "Should have 12 modifier tags (nl + 5 octaves + 6 accidentals)");
        assert_eq!(config_count, 1, "Should have 1 config tag");

        // Total should be 20
        assert_eq!(all_tags.len(), 20, "Total tag count should be 20");
    }
}
