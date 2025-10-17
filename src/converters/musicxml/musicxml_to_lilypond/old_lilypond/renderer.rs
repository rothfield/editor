// LilyPond Source Code Generator - Works directly with analyzed document
use crate::models::Degree;
use crate::renderers::lilypond::templates::{TemplateContext, render_lilypond, LilyPondTemplate};
use crate::parse::model::{Document, DocumentElement, Beat, BeatElement, StaveLine, ContentElement};
use fraction::Fraction;
// use crate::renderers::transposition::transpose_degree_with_octave; // TODO: Move transposition module

/// Find the index of the last actual note (not barline, breathmark, etc.) in lilypond_notes
fn find_last_note_index(lilypond_notes: &[String]) -> Option<usize> {
    // Search backwards for the last actual note (not barline, breathmark, etc.)
    for (i, note) in lilypond_notes.iter().enumerate().rev() {
        if !note.starts_with("\\bar") && !note.starts_with("\\breathe") && !note.trim().starts_with("|") {
            // Include tuplets and regular notes
            return Some(i);
        }
    }
    None
}

/// Extract pitch from a LilyPond note string (e.g., "c'8~" -> "c'")
fn extract_pitch_from_lilypond_note(note: &str) -> String {
    // Remove duration numbers, ties, and other markings to get just the pitch
    let mut pitch = String::new();
    for ch in note.chars() {
        if ch.is_ascii_digit() || ch == '~' || ch == '(' || ch == ')' {
            break;
        }
        pitch.push(ch);
    }
    pitch
}

pub fn convert_document_to_lilypond_src(
    document: &Document,
    source: Option<&str>
) -> Result<String, String> {
    // Processing analyzed document with beats

    let mut lilypond_notes: Vec<String> = Vec::new();
    let mut previous_beat_notes: Vec<String> = Vec::new();
    let current_tonic: Option<Degree> = None;

    // Extract staves from document
    for element in &document.elements {
        if let DocumentElement::Stave(stave) = element {
            for line in &stave.lines {
                if let StaveLine::ContentLine(content_line) = line {
                    for content_element in &content_line.elements {
                        match content_element {
                            ContentElement::Beat(beat) => {
                                let mut beat_notes = convert_beat_to_lilypond(beat, current_tonic)?;

                                // Handle ties from tied_to_previous field
                                if beat.tied_to_previous.unwrap_or(false) {
                                    if let Some(last_note_index) = find_last_note_index(&lilypond_notes) {
                                        // There's a previous note to tie from
                                        let last_note = &mut lilypond_notes[last_note_index];
                                        if !last_note.ends_with('~') && !last_note.ends_with(')') {
                                            *last_note = format!("{}~", last_note);
                                        } else if last_note.ends_with(')') {
                                            // Insert tie before the closing slur
                                            let len = last_note.len();
                                            last_note.insert(len - 1, '~');
                                        }

                                        // Add continuation note for the tied duration (leading dashes)
                                        let mut leading_dash_count = 0;
                                        for element in &beat.elements {
                                            match element {
                                                BeatElement::Dash(_) => leading_dash_count += 1,
                                                BeatElement::Note(_) => break,
                                                _ => continue,
                                            }
                                        }

                                        if leading_dash_count > 0 && beat.divisions.is_some() {
                                            let total_divisions = beat.divisions.unwrap();
                                            let tied_duration = Fraction::new(leading_dash_count as u64, total_divisions as u64) * Fraction::new(1u64, 4u64);
                                            let duration_string = fraction_to_lilypond_note(tied_duration);

                                            // Extract pitch from the previous note to create continuation
                                            let prev_note_pitch = extract_pitch_from_lilypond_note(&lilypond_notes[last_note_index]);
                                            let continuation_note = format!("{}{}", prev_note_pitch, duration_string);
                                            beat_notes.insert(0, continuation_note);
                                        }
                                    } else {
                                        // No previous note - add rest for leading dashes
                                        let mut leading_dash_count = 0;
                                        for element in &beat.elements {
                                            match element {
                                                BeatElement::Dash(_) => leading_dash_count += 1,
                                                BeatElement::Note(_) => break,
                                                _ => continue,
                                            }
                                        }

                                        if leading_dash_count > 0 && beat.divisions.is_some() {
                                            let total_divisions = beat.divisions.unwrap();
                                            let rest_duration = Fraction::new(leading_dash_count as u64, total_divisions as u64) * Fraction::new(1u64, 4u64);
                                            let duration_string = fraction_to_lilypond_note(rest_duration);
                                            beat_notes.insert(0, format!("r{}", duration_string));
                                        }
                                    }
                                }

                                lilypond_notes.extend(beat_notes.clone());
                                previous_beat_notes = beat_notes;
                            },
                            ContentElement::Barline(barline) => {
                                let lily_barline = format!("| ");
                                lilypond_notes.push(lily_barline);
                            },
                            ContentElement::Whitespace(_) => {
                                // Skip whitespace
                            },
                            ContentElement::UnknownToken(_) => {
                                // Skip unknown tokens (behave like whitespace)
                            },
                        }
                    }
                }
            }
        }
    }

    let staves = lilypond_notes.join(" ");

    // Extract lyrics from beat elements
    let mut lyrics_parts: Vec<String> = Vec::new();
    for element in &document.elements {
        if let DocumentElement::Stave(stave) = element {
            for line in &stave.lines {
                if let StaveLine::ContentLine(content_line) = line {
                    for content_element in &content_line.elements {
                        if let ContentElement::Beat(beat) = content_element {
                            for beat_element in &beat.elements {
                                match beat_element {
                                    BeatElement::Note(_note) => {
                                        // TODO: Extract syllables from spatial assignments if available
                                        lyrics_parts.push("_".to_string());
                                    },
                                    BeatElement::Dash(_) => {
                                        // Skip dashes - they are duration extenders, not separate syllables
                                    },
                                    BeatElement::BreathMark(_) => {
                                        // No syllable for breath marks
                                    },
                                    BeatElement::Rest(_) => {
                                        // No syllable for rests
                                    },
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Build template context
    let mut context = TemplateContext::builder()
        .staves(staves);
    
    // Add lyrics if any syllables were found
    if !lyrics_parts.is_empty() && lyrics_parts.iter().any(|s| s != "_") {
        let lyrics_string = lyrics_parts.join(" ");
        context = context.lyrics(lyrics_string);
    }
    
    if let Some(title) = &document.title {
        context = context.title(title);
    }

    if let Some(source) = source {
        context = context.source_comment(source);
    }

    let context = context.build();

    // Auto-select template based on document complexity
    let template = if document.title.is_some() {
        LilyPondTemplate::Standard
    } else {
        LilyPondTemplate::Minimal
    };
    
    // Render template
    render_lilypond(template, &context)
        .map_err(|e| format!("Template render error: {}", e))
}

fn convert_beat_with_leading_rest(beat: &Beat, current_tonic: Option<Degree>) -> Result<Vec<String>, String> {
    let mut notes = Vec::new();

    // Count leading dashes to convert to rest
    let mut leading_dash_count = 0;
    for element in &beat.elements {
        match element {
            BeatElement::Dash(_) => {
                leading_dash_count += 1;
            }
            BeatElement::Note(_) => break,
            BeatElement::BreathMark(_) => continue,
            BeatElement::Rest(_) => break,
        }
    }

    // Calculate rest duration based on subdivisions
    if leading_dash_count > 0 && beat.divisions.is_some() {
        let total_divisions = beat.divisions.unwrap();
        let rest_duration = Fraction::new(leading_dash_count as u64, total_divisions as u64) * Fraction::new(1u64, 4u64);
        let duration_string = fraction_to_lilypond_note(rest_duration);
        notes.push(format!("r{}", duration_string));
    }

    // Process remaining elements normally
    let mut past_leading_dashes = false;
    for beat_element in &beat.elements {
        match beat_element {
            BeatElement::Note(note) => {
                past_leading_dashes = true;
                let duration_string = if let (Some(numer), Some(denom)) = (note.numerator, note.denominator) {
                    let duration = fraction::Fraction::new(numer, denom);
                    fraction_to_lilypond_note(duration)
                } else {
                    "4".to_string()
                };

                let lily_note = crate::renderers::converters_lilypond::pitch::pitchcode_to_lilypond(
                    note.pitch_code,
                    note.octave,
                    current_tonic.map(|d| crate::models::pitch_systems::degree_to_pitch_code(d))
                )?;
                notes.push(format!("{}{}", lily_note, duration_string));
            },
            BeatElement::Dash(_) => {
                if past_leading_dashes {
                    // These dashes extend the previous note, already handled by rhythm analyzer
                }
            },
            BeatElement::BreathMark(_) => {
                notes.push("\\breathe".to_string());
            },
            BeatElement::Rest(rest) => {
                let duration_string = if let (Some(numer), Some(denom)) = (rest.numerator, rest.denominator) {
                    let duration = fraction::Fraction::new(numer, denom);
                    fraction_to_lilypond_note(duration)
                } else {
                    "4".to_string()
                };
                notes.push(format!("r{}", duration_string));
            },
        }
    }

    // Handle tuplets if needed
    if beat.is_tuplet.unwrap_or(false) {
        if let Some((tuplet_num, tuplet_den)) = beat.tuplet_ratio {
            let tuplet_content = notes.join(" ");
            Ok(vec![format!("\\tuplet {}/{} {{ {} }}", tuplet_num, tuplet_den, tuplet_content)])
        } else {
            Ok(notes)
        }
    } else {
        Ok(notes)
    }
}

fn convert_beat_to_lilypond(beat: &Beat, current_tonic: Option<Degree>) -> Result<Vec<String>, String> {
    let mut notes = Vec::new();
    for beat_element in &beat.elements {
        match beat_element {
            BeatElement::Note(note) => {
                // Use rhythm-analyzed duration if available, fallback to quarter note
                let duration_string = if let (Some(numer), Some(denom)) = (note.numerator, note.denominator) {
                    let duration = fraction::Fraction::new(numer, denom);
                    fraction_to_lilypond_note(duration)
                } else {
                    "4".to_string() // fallback to quarter note
                };

                let lily_note = crate::renderers::converters_lilypond::pitch::pitchcode_to_lilypond(
                    note.pitch_code,
                    note.octave,
                    current_tonic.map(|d| crate::models::pitch_systems::degree_to_pitch_code(d))
                )?;
                let note_str = format!("{}{}", lily_note, duration_string);

                // TODO: Add slur markers from spatial assignments if available

                notes.push(note_str);
            },
            BeatElement::Dash(dash) => {
                // Check if dash has rhythm data - if so, treat as rest or tied note
                if let (Some(numer), Some(denom)) = (dash.numerator, dash.denominator) {
                    use fraction::Fraction;
                    let duration = Fraction::new(numer, denom);
                    let duration_string = fraction_to_lilypond_note(duration);

                    // For now, treat as rest. Could be extended to detect tied notes based on context
                    notes.push(format!("r{}", duration_string));
                } else {
                    // Skip dashes without rhythm data - they are duration extenders handled by rhythm analyzer
                    // The preceding note already has the extended duration
                }
            },
            BeatElement::BreathMark(_) => {
                notes.push("\\breathe".to_string());
            },
            BeatElement::Rest(rest) => {
                // Use rhythm-analyzed duration if available, fallback to quarter note
                let duration_string = if let (Some(numer), Some(denom)) = (rest.numerator, rest.denominator) {
                    let duration = fraction::Fraction::new(numer, denom);
                    fraction_to_lilypond_note(duration)
                } else {
                    "4".to_string() // fallback to quarter note
                };
                notes.push(format!("r{}", duration_string));
            },
        }
    }
    
    // Add manual beaming for eighth notes and shorter
    // add_manual_beaming(&mut notes)?;

    // Use analyzer-provided tuplet information
    if beat.is_tuplet.unwrap_or(false) {
        if let Some((tuplet_num, tuplet_den)) = beat.tuplet_ratio {
            // For now, just use the notes as-is and let fraction_to_lilypond_note handle durations
            let tuplet_content = notes.join(" ");
            Ok(vec![format!("\\tuplet {}/{} {{ {} }}", tuplet_num, tuplet_den, tuplet_content)])
        } else {
            Ok(notes)
        }
    } else {
        Ok(notes)
    }
}

/// Adjust note durations for tuplets - convert from compressed durations to target durations
fn adjust_tuplet_note_durations(notes: &[String], tuplet_num: usize, tuplet_den: usize) -> Vec<String> {
    // Use systematic subdivision approach - denominator determines subdivision note value
    let target_duration_str = match tuplet_den {
        1 => "4",     // Quarter note subdivisions
        2 => "8",     // Eighth note subdivisions
        4 => "16",    // Sixteenth note subdivisions
        8 => "32",    // Thirty-second note subdivisions
        16 => "64",   // Sixty-fourth note subdivisions
        32 => "128",  // 128th note subdivisions
        64 => "256",  // 256th note subdivisions
        _ => "16",    // Default fallback
    };

    notes.iter().map(|note| {
        // Extract pitch and non-duration parts from note string
        let mut pitch = String::new();
        let mut suffix = String::new();
        let mut in_duration = false;
        let mut past_duration = false;

        for ch in note.chars() {
            if ch.is_ascii_digit() && !past_duration {
                in_duration = true;
                // Skip the duration digits
            } else if in_duration && !ch.is_ascii_digit() {
                past_duration = true;
                suffix.push(ch);
            } else if !in_duration {
                pitch.push(ch);
            } else {
                suffix.push(ch);
            }
        }

        // Reconstruct note with target duration
        format!("{}{}{}", pitch, target_duration_str, suffix)
    }).collect()
}

/// Add manual beam brackets to notes in a beat - if beat has more than one note, add [ to first and ] to last
fn add_manual_beaming(notes: &mut Vec<String>) -> Result<(), String> {
    if notes.len() > 1 {
        notes[0].push('[');
        let last_idx = notes.len() - 1;
        notes[last_idx].push(']');
    }
    Ok(())
}

// Removed unused heuristic functions:
// - calculate_tuplet_duration: Used hardcoded duration mappings instead of trusting FSM 
// - calculate_lilypond_duration: Did fractional calculations that FSM already handles
// - convert_document_v2_to_lilypond: Used simple note-count heuristics instead of proper rhythm analysis
//
// The V2 architecture correctly uses FSM-calculated tuplet_duration values directly.


fn degree_to_lilypond(degree: Degree, octave: i8, current_tonic: Option<Degree>) -> Result<String, String> {
    // Transpose the degree and octave based on tonic
    let (transposed_degree, adjusted_octave) = if let Some(tonic) = current_tonic {
        // TODO: Fix transposition - use simple mapping for now
        (degree, octave)
    } else {
        (degree, octave)
    };
    
    // Convert transposed Degree to LilyPond note name - handle all variants
    let base_note = match transposed_degree {
        // 1 series (Do/Sa/C)
        Degree::N1bb => "cff",   Degree::N1b => "cf",     Degree::N1 => "c",
        Degree::N1s => "cs",     Degree::N1ss => "css",
        // 2 series (Re/D)  
        Degree::N2bb => "dff",   Degree::N2b => "df",     Degree::N2 => "d",
        Degree::N2s => "ds",     Degree::N2ss => "dss",
        // 3 series (Mi/Ga/E)
        Degree::N3bb => "eff",   Degree::N3b => "ef",     Degree::N3 => "e",
        Degree::N3s => "es",     Degree::N3ss => "ess",
        // 4 series (Fa/Ma/F)  
        Degree::N4bb => "fff",   Degree::N4b => "ff",     Degree::N4 => "f",
        Degree::N4s => "fs",     Degree::N4ss => "fss",
        // 5 series (Sol/Pa/G)
        Degree::N5bb => "gff",   Degree::N5b => "gf",     Degree::N5 => "g",
        Degree::N5s => "gs",     Degree::N5ss => "gss",
        // 6 series (La/Dha/A)
        Degree::N6bb => "aff",   Degree::N6b => "af",     Degree::N6 => "a",
        Degree::N6s => "as",     Degree::N6ss => "ass",
        // 7 series (Ti/Ni/B)
        Degree::N7bb => "bff",   Degree::N7b => "bf",     Degree::N7 => "b",
        Degree::N7s => "bs",     Degree::N7ss => "bss",
    };
    
    // Handle octave modifications (use adjusted_octave from transposition)
    let octave_marks = match adjusted_octave {
        -2 => ",,",
        -1 => ",",
        0 => "",        // Middle octave
        1 => "'",
        2 => "''",
        _ => "",        // Default to middle for extreme octaves
    };
    
    Ok(format!("{}{}", base_note, octave_marks))
}



// Transposition functions moved to shared module: src/converters/transposition.rs

/// Convert a Fraction duration to LilyPond note duration string
fn fraction_to_lilypond_note(duration: fraction::Fraction) -> String {
    use crate::models::RhythmConverter;
    
    // Use the existing rhythm converter to get VexFlow durations, then map to LilyPond
    let vexflow_durations = RhythmConverter::fraction_to_vexflow(duration);
    
    if let Some((vexflow_duration, dots)) = vexflow_durations.first() {
        // Convert VexFlow duration to LilyPond duration
        let lily_duration = match vexflow_duration.as_str() {
            "w" => "1",     // whole note
            "h" => "2",     // half note
            "q" => "4",     // quarter note
            "8" => "8",     // eighth note
            "16" => "16",   // sixteenth note
            "32" => "32",   // thirty-second note
            "64" => "64",   // sixty-fourth note
            _ => "4",       // default to quarter note
        };
        
        // Add dots if needed
        let dot_string = ".".repeat(*dots as usize);
        format!("{}{}", lily_duration, dot_string)
    } else {
        // Fallback to quarter note
        "4".to_string()
    }
}

/// Convert ProcessedDocument (multiple staves) to LilyPond source
pub fn convert_processed_document_to_lilypond_src(
    document: &Document,
    source: Option<&str>
) -> Result<String, String> {
    // Extract staves from document
    let mut staves_with_content = Vec::new();

    for element in &document.elements {
        if let DocumentElement::Stave(stave) = element {
            // Check if stave has actual musical content
            let mut has_content = false;
            for line in &stave.lines {
                if let StaveLine::ContentLine(content_line) = line {
                    for content_element in &content_line.elements {
                        if let ContentElement::Beat(beat) = content_element {
                            if !beat.elements.is_empty() {
                                has_content = true;
                                break;
                            }
                        }
                    }
                    if has_content { break; }
                }
            }
            if has_content {
                staves_with_content.push(stave);
            }
        }
    }
    
    if staves_with_content.len() <= 1 {
        // Single stave with content (or no content) - use standard template
        let stave = if let Some(stave) = staves_with_content.first() {
            stave
        } else {
            // fallback to first stave from document
            if let Some(DocumentElement::Stave(stave)) = document.elements.first() {
                stave
            } else {
                // No staves in document - create empty LilyPond with just header
                return Ok(format!(r#"\version "2.24.0"

\header {{
  title = "{}"
  composer = "{}"
}}

% No musical content

\relative c' {{
  % Empty staff
  R1
}}
"#,
                    document.title.as_ref().unwrap_or(&String::new()),
                    document.author.as_ref().unwrap_or(&String::new())
                ));
            }
        };
        convert_document_to_lilypond_src(&Document {
            id: uuid::Uuid::new_v4(),
            document_uuid: document.document_uuid.clone(),
            title: document.title.clone(),
            author: document.author.clone(),
            directives: document.directives.clone(),
            value: document.value.clone(),
            elements: vec![DocumentElement::Stave(stave.clone())],
            ui_state: document.ui_state.clone(),
            timestamp: document.timestamp.clone(),
        }, source)
    } else {
        // Multiple staves with content - use multi-stave template
        convert_multistave_to_lilypond_src(document, source)
    }
}

/// Convert multiple staves to LilyPond using multi-stave template
fn convert_multistave_to_lilypond_src(
    document: &Document,
    source: Option<&str>
) -> Result<String, String> {
    // Convert each stave to LilyPond content
    let mut stave_contents = Vec::new();

    for element in &document.elements {
        if let DocumentElement::Stave(stave) = element {
            // Get LilyPond content for this stave (without template wrapper)
            let stave_lilypond = convert_stave_to_lilypond_content(stave)?;
            stave_contents.push(format!("\\new Staff {{\n  \\fixed c' {{\n    \\key c \\major\n    \\time 4/4\n    % \\autoBeamOff\n    % \\set Score.measureBarType = #\"\"\n    % \\set Score.startRepeatBarType = #\"\"\n    % \\set Score.endRepeatBarType = #\"\"\n    \n    {}\n  }}\n}}", stave_lilypond));
        }
    }

    // Create template context for multi-stave template
    let mut context = TemplateContext::new();
    context.set_title(document.title.clone());
    context.set_source_comment(source.map(|s| s.to_string()));
    context.set_staves(stave_contents.join("\n"));

    // Render using multi-stave template
    render_lilypond(LilyPondTemplate::MultiStave, &context).map_err(|e| e.to_string())
}

/// Convert a single stave to LilyPond content (without template wrapper)
fn convert_stave_to_lilypond_content(stave: &crate::parse::model::Stave) -> Result<String, String> {
    let mut lilypond_notes: Vec<String> = Vec::new();
    let current_tonic: Option<Degree> = None;

    for line in &stave.lines {
        if let StaveLine::ContentLine(content_line) = line {
            for content_element in &content_line.elements {
                match content_element {
                    ContentElement::Beat(beat) => {
                        let mut beat_notes = convert_beat_to_lilypond(beat, current_tonic)?;

                        // Handle ties from tied_to_previous field
                        if beat.tied_to_previous.unwrap_or(false) {
                            if let Some(last_note_index) = find_last_note_index(&lilypond_notes) {
                                // There's a previous note to tie from
                                let last_note = &mut lilypond_notes[last_note_index];
                                if !last_note.ends_with('~') && !last_note.ends_with(')') {
                                    *last_note = format!("{}~", last_note);
                                } else if last_note.ends_with(')') {
                                    // Insert tie before the closing slur
                                    let len = last_note.len();
                                    last_note.insert(len - 1, '~');
                                }

                                // Add continuation note for the tied duration (leading dashes)
                                let mut leading_dash_count = 0;
                                for element in &beat.elements {
                                    match element {
                                        BeatElement::Dash(_) => leading_dash_count += 1,
                                        BeatElement::Note(_) => break,
                                        _ => continue,
                                    }
                                }

                                if leading_dash_count > 0 && beat.divisions.is_some() {
                                    let total_divisions = beat.divisions.unwrap();
                                    let tied_duration = Fraction::new(leading_dash_count as u64, total_divisions as u64) * Fraction::new(1u64, 4u64);
                                    let duration_string = fraction_to_lilypond_note(tied_duration);

                                    // Extract pitch from the previous note to create continuation
                                    let prev_note_pitch = extract_pitch_from_lilypond_note(&lilypond_notes[last_note_index]);
                                    let continuation_note = format!("{}{}", prev_note_pitch, duration_string);
                                    beat_notes.insert(0, continuation_note);
                                }
                            } else {
                                // No previous note - add rest for leading dashes
                                let mut leading_dash_count = 0;
                                for element in &beat.elements {
                                    match element {
                                        BeatElement::Dash(_) => leading_dash_count += 1,
                                        BeatElement::Note(_) => break,
                                        _ => continue,
                                    }
                                }

                                if leading_dash_count > 0 && beat.divisions.is_some() {
                                    let total_divisions = beat.divisions.unwrap();
                                    let rest_duration = Fraction::new(leading_dash_count as u64, total_divisions as u64) * Fraction::new(1u64, 4u64);
                                    let duration_string = fraction_to_lilypond_note(rest_duration);
                                    beat_notes.insert(0, format!("r{}", duration_string));
                                }
                            }
                        }

                        lilypond_notes.extend(beat_notes);
                    },
                    ContentElement::Barline(_) => {
                        lilypond_notes.push("| ".to_string());
                    },
                    ContentElement::Whitespace(_) => {
                        // Skip whitespace
                    },
                    ContentElement::UnknownToken(_) => {
                        // Skip unknown tokens (behave like whitespace)
                    },
                }
            }
        }
    }

    Ok(lilypond_notes.join(" "))
}

// Removed old convert_processed_document_to_lilypond_minimal function - not needed with new architecture

/// Simple degree to lilypond note conversion (just note names)
fn degree_to_lilypond_simple(degree: Degree) -> &'static str {
    match degree {
        Degree::N1bb => "cff",
        Degree::N1b => "cf",
        Degree::N1 => "c",
        Degree::N1s => "cs",
        Degree::N1ss => "css",
        Degree::N2bb => "dff",
        Degree::N2b => "df",
        Degree::N2 => "d", 
        Degree::N2s => "ds",
        Degree::N2ss => "dss",
        Degree::N3bb => "eff",
        Degree::N3b => "ef",
        Degree::N3 => "e",
        Degree::N3s => "es",
        Degree::N3ss => "ess",
        Degree::N4bb => "fff",
        Degree::N4b => "ff",
        Degree::N4 => "f",
        Degree::N4s => "fs",
        Degree::N4ss => "fss",
        Degree::N5bb => "gff",
        Degree::N5b => "gf",
        Degree::N5 => "g",
        Degree::N5s => "gs", 
        Degree::N5ss => "gss",
        Degree::N6bb => "aff",
        Degree::N6b => "af",
        Degree::N6 => "a",
        Degree::N6s => "as",
        Degree::N6ss => "ass",
        Degree::N7bb => "bff",
        Degree::N7b => "bf",
        Degree::N7 => "b",
        Degree::N7s => "bs",
        Degree::N7ss => "bss",
    }
}

/// Convert ProcessedDocument to minimal LilyPond source using minimal template
pub fn convert_processed_document_to_minimal_lilypond_src(
    document: &Document,
    source: Option<&str>
) -> Result<String, String> {
    // Extract just the musical content without headers/layout
    let mut stave_content = String::new();

    for element in &document.elements {
        if let DocumentElement::Stave(stave) = element {
            let stave_lilypond = convert_stave_to_lilypond_content(stave)?;
            if !stave_lilypond.trim().is_empty() {
                stave_content = stave_lilypond;
                break; // Just use the first stave for minimal output
            }
        }
    }

    if stave_content.trim().is_empty() {
        return Ok("% No musical content".to_string());
    }

    // Build minimal template context
    let mut context_builder = TemplateContext::builder()
        .staves(stave_content);

    if let Some(src) = source {
        context_builder = context_builder.source_comment(src.to_string());
    }

    let context = context_builder.build();

    // Use minimal template
    render_lilypond(LilyPondTemplate::Minimal, &context)
        .map_err(|e| format!("Minimal template render error: {}", e))
}

