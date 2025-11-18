///! Musical scale constraints (modes, maqams, ragas)
///!
///! This module defines scale constraints that filter which pitches are allowed,
///! making it easier to type within a specific mode, maqam, or raga.

use serde::{Deserialize, Serialize};
use crate::models::pitch_code::{PitchCode, AccidentalType};

/// Category of musical scale
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ScaleCategory {
    WesternMode,
    Maqam,
    Raga,
    Custom,
}

/// Defines which accidentals are allowed for a specific scale degree (1-7)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DegreeConstraint {
    /// Allow any accidental for this degree (no constraint)
    Any,
    /// Only allow specific accidental types
    Only(Vec<AccidentalType>),
    /// This degree is omitted from the scale (e.g., Marwa has no 5th)
    Omit,
}

/// A musical scale constraint (mode, maqam, or raga)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScaleConstraint {
    /// Unique identifier for this constraint
    pub id: String,

    /// Display name
    pub name: String,

    /// Category (Western mode, maqam, raga, or custom)
    pub category: ScaleCategory,

    /// Constraints for each scale degree (1-7)
    /// Index 0 = degree 1, index 1 = degree 2, etc.
    pub degrees: [DegreeConstraint; 7],

    /// Optional description or characteristics
    pub description: Option<String>,

    /// Whether this is a user-created custom constraint
    pub is_custom: bool,
}

impl ScaleConstraint {
    /// Check if a pitch is allowed by this constraint
    pub fn is_pitch_allowed(&self, pitch: PitchCode) -> bool {
        let degree = pitch.degree() as usize;
        if degree < 1 || degree > 7 {
            return false;
        }

        let degree_idx = degree - 1;
        let constraint = &self.degrees[degree_idx];

        match constraint {
            DegreeConstraint::Any => true,
            DegreeConstraint::Omit => false,
            DegreeConstraint::Only(allowed_accidentals) => {
                let pitch_accidental = pitch.accidental_type();
                allowed_accidentals.contains(&pitch_accidental)
            }
        }
    }

    /// Create a new custom constraint
    pub fn new_custom(id: String, name: String, degrees: [DegreeConstraint; 7]) -> Self {
        Self {
            id,
            name,
            category: ScaleCategory::Custom,
            degrees,
            description: None,
            is_custom: true,
        }
    }
}

/// Get all predefined scale constraints
pub fn get_predefined_constraints() -> Vec<ScaleConstraint> {
    vec![
        // WESTERN MODES (7)
        create_ionian(),
        create_dorian(),
        create_phrygian(),
        create_lydian(),
        create_mixolydian(),
        create_aeolian(),
        create_locrian(),

        // ARABIC MAQAMS (3)
        create_maqam_rast(),
        create_maqam_bayati(),
        create_maqam_hijaz(),

        // WESTERN/JAZZ SCALES (3)
        create_harmonic_minor(),
        create_jazz_minor(),
        create_phrygian_dominant(),

        // INDIAN RAGAS - 10 THAATS (10)
        create_bilawal(),        // Thaat
        create_kalyan_yaman(),   // Thaat + Raga
        create_khamaj(),         // Thaat
        create_bhairav(),        // Thaat (already existed)
        create_purvi(),          // Thaat (was "purvi")
        create_marwa(),          // Thaat (already existed)
        create_kafi(),           // Thaat
        create_asavari(),        // Thaat
        create_bhairavi(),       // Thaat
        create_todi(),           // Thaat

        // ADDITIONAL POPULAR RAGAS (10)
        create_bhupali(),
        create_bageshri(),
        create_desh(),
        create_malkauns(),
        create_durga(),
        create_shree(),
        create_jaunpuri(),
        create_multani(),
        create_darbari_kanada(),
        create_kedar(),
        create_bihag(),
        create_lalit(),
        create_miyan_ki_todi(),

        // DEPRECATED (keeping for backward compatibility, but marked as such)
        create_basant_mukhari(), // = Phrygian Dominant
        create_kirwani(),        // = Harmonic Minor
    ]
}

// Helper to create "Only natural" constraint
fn natural_only() -> DegreeConstraint {
    DegreeConstraint::Only(vec![AccidentalType::None])
}

// Helper to create "Only flat" constraint
fn flat_only() -> DegreeConstraint {
    DegreeConstraint::Only(vec![AccidentalType::Flat])
}

// Helper to create "Only sharp" constraint
fn sharp_only() -> DegreeConstraint {
    DegreeConstraint::Only(vec![AccidentalType::Sharp])
}

// Helper to create "Only half-flat" constraint
fn half_flat_only() -> DegreeConstraint {
    DegreeConstraint::Only(vec![AccidentalType::HalfFlat])
}

// =============================================================================
// WESTERN MODES
// =============================================================================

/// Ionian (Major scale): 1 2 3 4 5 6 7
fn create_ionian() -> ScaleConstraint {
    ScaleConstraint {
        id: "ionian".to_string(),
        name: "Ionian (Major)".to_string(),
        category: ScaleCategory::WesternMode,
        degrees: [
            natural_only(),  // 1
            natural_only(),  // 2
            natural_only(),  // 3
            natural_only(),  // 4
            natural_only(),  // 5
            natural_only(),  // 6
            natural_only(),  // 7
        ],
        description: Some("Major scale, basis for Western music".to_string()),
        is_custom: false,
    }
}

/// Dorian: 1 2 ♭3 4 5 6 ♭7
fn create_dorian() -> ScaleConstraint {
    ScaleConstraint {
        id: "dorian".to_string(),
        name: "Dorian".to_string(),
        category: ScaleCategory::WesternMode,
        degrees: [
            natural_only(),  // 1
            natural_only(),  // 2
            flat_only(),     // ♭3
            natural_only(),  // 4
            natural_only(),  // 5
            natural_only(),  // 6
            flat_only(),     // ♭7
        ],
        description: Some("Minor mode with major 6th".to_string()),
        is_custom: false,
    }
}

/// Phrygian: 1 ♭2 ♭3 4 5 ♭6 ♭7
fn create_phrygian() -> ScaleConstraint {
    ScaleConstraint {
        id: "phrygian".to_string(),
        name: "Phrygian".to_string(),
        category: ScaleCategory::WesternMode,
        degrees: [
            natural_only(),  // 1
            flat_only(),     // ♭2
            flat_only(),     // ♭3
            natural_only(),  // 4
            natural_only(),  // 5
            flat_only(),     // ♭6
            flat_only(),     // ♭7
        ],
        description: Some("Minor mode with minor 2nd (Spanish/flamenco sound)".to_string()),
        is_custom: false,
    }
}

/// Lydian: 1 2 3 ♯4 5 6 7
fn create_lydian() -> ScaleConstraint {
    ScaleConstraint {
        id: "lydian".to_string(),
        name: "Lydian".to_string(),
        category: ScaleCategory::WesternMode,
        degrees: [
            natural_only(),  // 1
            natural_only(),  // 2
            natural_only(),  // 3
            sharp_only(),    // ♯4
            natural_only(),  // 5
            natural_only(),  // 6
            natural_only(),  // 7
        ],
        description: Some("Major mode with augmented 4th (bright, dreamy)".to_string()),
        is_custom: false,
    }
}

/// Mixolydian: 1 2 3 4 5 6 ♭7
fn create_mixolydian() -> ScaleConstraint {
    ScaleConstraint {
        id: "mixolydian".to_string(),
        name: "Mixolydian".to_string(),
        category: ScaleCategory::WesternMode,
        degrees: [
            natural_only(),  // 1
            natural_only(),  // 2
            natural_only(),  // 3
            natural_only(),  // 4
            natural_only(),  // 5
            natural_only(),  // 6
            flat_only(),     // ♭7
        ],
        description: Some("Major mode with minor 7th (blues/rock)".to_string()),
        is_custom: false,
    }
}

/// Aeolian (Natural Minor): 1 2 ♭3 4 5 ♭6 ♭7
fn create_aeolian() -> ScaleConstraint {
    ScaleConstraint {
        id: "aeolian".to_string(),
        name: "Aeolian (Natural Minor)".to_string(),
        category: ScaleCategory::WesternMode,
        degrees: [
            natural_only(),  // 1
            natural_only(),  // 2
            flat_only(),     // ♭3
            natural_only(),  // 4
            natural_only(),  // 5
            flat_only(),     // ♭6
            flat_only(),     // ♭7
        ],
        description: Some("Standard natural minor scale".to_string()),
        is_custom: false,
    }
}

/// Locrian: 1 ♭2 ♭3 4 ♭5 ♭6 ♭7
fn create_locrian() -> ScaleConstraint {
    ScaleConstraint {
        id: "locrian".to_string(),
        name: "Locrian".to_string(),
        category: ScaleCategory::WesternMode,
        degrees: [
            natural_only(),  // 1
            flat_only(),     // ♭2
            flat_only(),     // ♭3
            natural_only(),  // 4
            flat_only(),     // ♭5
            flat_only(),     // ♭6
            flat_only(),     // ♭7
        ],
        description: Some("Only mode with diminished 5th (unstable)".to_string()),
        is_custom: false,
    }
}

// =============================================================================
// ARABIC MAQAMS
// =============================================================================

/// Maqam Rast: 1 2 3♭̸ 4 5 6 7♭̸ (quarter-tones!)
fn create_maqam_rast() -> ScaleConstraint {
    ScaleConstraint {
        id: "maqam_rast".to_string(),
        name: "Maqam Rast".to_string(),
        category: ScaleCategory::Maqam,
        degrees: [
            natural_only(),   // 1
            natural_only(),   // 2
            half_flat_only(), // 3♭̸ (quarter-tone!)
            natural_only(),   // 4
            natural_only(),   // 5
            natural_only(),   // 6
            half_flat_only(), // 7♭̸ (quarter-tone!)
        ],
        description: Some("Most important maqam, neutral 3rd and 7th".to_string()),
        is_custom: false,
    }
}

/// Maqam Bayati: 1 2♭̸ 3♭ 4 5 6♭ 7
fn create_maqam_bayati() -> ScaleConstraint {
    ScaleConstraint {
        id: "maqam_bayati".to_string(),
        name: "Maqam Bayati".to_string(),
        category: ScaleCategory::Maqam,
        degrees: [
            natural_only(),   // 1
            half_flat_only(), // 2♭̸ (quarter-tone!)
            flat_only(),      // 3♭
            natural_only(),   // 4
            natural_only(),   // 5
            flat_only(),      // 6♭
            natural_only(),   // 7
        ],
        description: Some("Popular Levantine maqam with half-flat 2nd".to_string()),
        is_custom: false,
    }
}

/// Maqam Hijaz: 1 ♭2 3 4 5 ♭6 7
fn create_maqam_hijaz() -> ScaleConstraint {
    ScaleConstraint {
        id: "maqam_hijaz".to_string(),
        name: "Maqam Hijaz".to_string(),
        category: ScaleCategory::Maqam,
        degrees: [
            natural_only(),  // 1
            flat_only(),     // ♭2
            natural_only(),  // 3
            natural_only(),  // 4
            natural_only(),  // 5
            flat_only(),     // ♭6
            natural_only(),  // 7
        ],
        description: Some("Augmented 2nd between 2nd and 3rd (quintessential Middle Eastern sound)".to_string()),
        is_custom: false,
    }
}

// =============================================================================
// WESTERN/JAZZ SCALES
// =============================================================================

/// Jazz Minor (Melodic Minor Ascending): 1 2 ♭3 4 5 6 7
fn create_jazz_minor() -> ScaleConstraint {
    ScaleConstraint {
        id: "jazz_minor".to_string(),
        name: "Jazz Minor (Melodic Minor)".to_string(),
        category: ScaleCategory::WesternMode,
        degrees: [
            natural_only(),  // 1
            natural_only(),  // 2
            flat_only(),     // ♭3
            natural_only(),  // 4
            natural_only(),  // 5
            natural_only(),  // 6 (raised from natural minor)
            natural_only(),  // 7 (raised from natural minor)
        ],
        description: Some("Ascending melodic minor, jazz improvisation favorite".to_string()),
        is_custom: false,
    }
}

/// Phrygian Dominant: 1 ♭2 3 4 5 ♭6 ♭7
fn create_phrygian_dominant() -> ScaleConstraint {
    ScaleConstraint {
        id: "phrygian_dominant".to_string(),
        name: "Phrygian Dominant".to_string(),
        category: ScaleCategory::WesternMode,
        degrees: [
            natural_only(),  // 1
            flat_only(),     // ♭2
            natural_only(),  // 3 (major 3rd - "dominant")
            natural_only(),  // 4
            natural_only(),  // 5
            flat_only(),     // ♭6
            flat_only(),     // ♭7
        ],
        description: Some("5th mode of harmonic minor, Spanish Phrygian, Freygish".to_string()),
        is_custom: false,
    }
}

// =============================================================================
// INDIAN RAGAS - 10 THAATS (PARENT SCALES)
// =============================================================================

/// Bhairav: 1 ♭2 3 4 5 ♭6 7 (Double Harmonic Major)
fn create_bhairav() -> ScaleConstraint {
    ScaleConstraint {
        id: "bhairav".to_string(),
        name: "Bhairav".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            flat_only(),     // ♭2 (komal Re)
            natural_only(),  // 3 (shuddha Ga)
            natural_only(),  // 4 (Ma)
            natural_only(),  // 5 (Pa)
            flat_only(),     // ♭6 (komal Dha)
            natural_only(),  // 7 (shuddha Ni)
        ],
        description: Some("Double harmonic major, morning raga".to_string()),
        is_custom: false,
    }
}

/// Basant Mukhari: 1 ♭2 3 4 5 ♭6 ♭7 (= Phrygian Dominant)
fn create_basant_mukhari() -> ScaleConstraint {
    ScaleConstraint {
        id: "basant_mukhari".to_string(),
        name: "Basant Mukhari".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1
            flat_only(),     // ♭2
            natural_only(),  // 3
            natural_only(),  // 4
            natural_only(),  // 5
            flat_only(),     // ♭6
            flat_only(),     // ♭7
        ],
        description: Some("Phrygian Dominant, combines Bhairav and Bhairavi".to_string()),
        is_custom: false,
    }
}

/// Harmonic Minor: 1 2 ♭3 4 5 ♭6 7
fn create_harmonic_minor() -> ScaleConstraint {
    ScaleConstraint {
        id: "harmonic_minor".to_string(),
        name: "Harmonic Minor".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1
            natural_only(),  // 2
            flat_only(),     // ♭3
            natural_only(),  // 4
            natural_only(),  // 5
            flat_only(),     // ♭6
            natural_only(),  // 7 (raised 7th)
        ],
        description: Some("Natural minor with raised 7th, augmented 2nd".to_string()),
        is_custom: false,
    }
}

/// Kirwani: 1 2 ♭3 4 5 ♭6 7 (identical to Harmonic Minor)
fn create_kirwani() -> ScaleConstraint {
    ScaleConstraint {
        id: "kirwani".to_string(),
        name: "Kirwani".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            natural_only(),  // 2 (shuddha Re)
            flat_only(),     // ♭3 (komal Ga)
            natural_only(),  // 4 (Ma)
            natural_only(),  // 5 (Pa)
            flat_only(),     // ♭6 (komal Dha)
            natural_only(),  // 7 (shuddha Ni)
        ],
        description: Some("Identical to Harmonic Minor, Hindustani borrowing from Carnatic".to_string()),
        is_custom: false,
    }
}

/// Purvi: 1 ♭2 3 ♯4 5 ♭6 7
fn create_purvi() -> ScaleConstraint {
    ScaleConstraint {
        id: "purvi".to_string(),
        name: "Purvi".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            flat_only(),     // ♭2 (komal Re)
            natural_only(),  // 3 (shuddha Ga)
            sharp_only(),    // ♯4 (tivra Ma)
            natural_only(),  // 5 (Pa)
            flat_only(),     // ♭6 (komal Dha)
            natural_only(),  // 7 (shuddha Ni)
        ],
        description: Some("Sunset raga with tivra Ma, mystical contemplation".to_string()),
        is_custom: false,
    }
}

/// Marwa: 1 ♭2 3 ♯4 - 6 7 (NO 5TH!)
fn create_marwa() -> ScaleConstraint {
    ScaleConstraint {
        id: "marwa".to_string(),
        name: "Marwa".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),         // 1 (Sa)
            flat_only(),            // ♭2 (komal Re)
            natural_only(),         // 3 (shuddha Ga)
            sharp_only(),           // ♯4 (tivra Ma)
            DegreeConstraint::Omit, // 5 (Pa PROHIBITED!)
            natural_only(),         // 6 (shuddha Dha)
            natural_only(),         // 7 (shuddha Ni)
        ],
        description: Some("Hexatonic (6 notes), Pa totally prohibited, dusk raga of longing".to_string()),
        is_custom: false,
    }
}

/// Bilawal: 1 2 3 4 5 6 7 (Ionian/Major)
fn create_bilawal() -> ScaleConstraint {
    ScaleConstraint {
        id: "bilawal".to_string(),
        name: "Bilawal".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            natural_only(),  // 2 (shuddha Re)
            natural_only(),  // 3 (shuddha Ga)
            natural_only(),  // 4 (shuddha Ma)
            natural_only(),  // 5 (Pa)
            natural_only(),  // 6 (shuddha Dha)
            natural_only(),  // 7 (shuddha Ni)
        ],
        description: Some("Bilawal thaat, all natural notes, equivalent to major scale, morning raga".to_string()),
        is_custom: false,
    }
}

/// Kalyan/Yaman: 1 2 3 ♯4 5 6 7 (Lydian)
fn create_kalyan_yaman() -> ScaleConstraint {
    ScaleConstraint {
        id: "kalyan_yaman".to_string(),
        name: "Kalyan (Yaman)".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            natural_only(),  // 2 (shuddha Re)
            natural_only(),  // 3 (shuddha Ga)
            sharp_only(),    // ♯4 (tivra Ma)
            natural_only(),  // 5 (Pa)
            natural_only(),  // 6 (shuddha Dha)
            natural_only(),  // 7 (shuddha Ni)
        ],
        description: Some("Kalyan thaat with tivra Ma, most popular evening raga, equivalent to Lydian".to_string()),
        is_custom: false,
    }
}

/// Khamaj: 1 2 3 4 5 6 ♭7 (Mixolydian)
fn create_khamaj() -> ScaleConstraint {
    ScaleConstraint {
        id: "khamaj".to_string(),
        name: "Khamaj".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            natural_only(),  // 2 (shuddha Re)
            natural_only(),  // 3 (shuddha Ga)
            natural_only(),  // 4 (shuddha Ma)
            natural_only(),  // 5 (Pa)
            natural_only(),  // 6 (shuddha Dha)
            flat_only(),     // ♭7 (komal Ni)
        ],
        description: Some("Khamaj thaat with komal Ni, equivalent to Mixolydian, light classical style".to_string()),
        is_custom: false,
    }
}

/// Kafi: 1 2 ♭3 4 5 6 ♭7 (Dorian)
fn create_kafi() -> ScaleConstraint {
    ScaleConstraint {
        id: "kafi".to_string(),
        name: "Kafi".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            natural_only(),  // 2 (shuddha Re)
            flat_only(),     // ♭3 (komal Ga)
            natural_only(),  // 4 (shuddha Ma)
            natural_only(),  // 5 (Pa)
            natural_only(),  // 6 (shuddha Dha)
            flat_only(),     // ♭7 (komal Ni)
        ],
        description: Some("Kafi thaat, equivalent to Dorian mode, folk-influenced light classical".to_string()),
        is_custom: false,
    }
}

/// Asavari: 1 2 ♭3 4 5 ♭6 ♭7 (Aeolian/Natural Minor)
fn create_asavari() -> ScaleConstraint {
    ScaleConstraint {
        id: "asavari".to_string(),
        name: "Asavari".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            natural_only(),  // 2 (shuddha Re)
            flat_only(),     // ♭3 (komal Ga)
            natural_only(),  // 4 (shuddha Ma)
            natural_only(),  // 5 (Pa)
            flat_only(),     // ♭6 (komal Dha)
            flat_only(),     // ♭7 (komal Ni)
        ],
        description: Some("Asavari thaat, equivalent to natural minor/Aeolian, morning raga with serious mood".to_string()),
        is_custom: false,
    }
}

/// Bhairavi: 1 ♭2 ♭3 4 5 ♭6 ♭7 (Phrygian)
fn create_bhairavi() -> ScaleConstraint {
    ScaleConstraint {
        id: "bhairavi".to_string(),
        name: "Bhairavi".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            flat_only(),     // ♭2 (komal Re)
            flat_only(),     // ♭3 (komal Ga)
            natural_only(),  // 4 (shuddha Ma)
            natural_only(),  // 5 (Pa)
            flat_only(),     // ♭6 (komal Dha)
            flat_only(),     // ♭7 (komal Ni)
        ],
        description: Some("Bhairavi thaat, equivalent to Phrygian, versatile raga for closing concerts".to_string()),
        is_custom: false,
    }
}

/// Todi: 1 ♭2 ♭3 ♯4 5 ♭6 7
fn create_todi() -> ScaleConstraint {
    ScaleConstraint {
        id: "todi".to_string(),
        name: "Todi".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            flat_only(),     // ♭2 (komal Re)
            flat_only(),     // ♭3 (komal Ga, often ati-komal)
            sharp_only(),    // ♯4 (tivra Ma)
            natural_only(),  // 5 (Pa)
            flat_only(),     // ♭6 (komal Dha)
            natural_only(),  // 7 (shuddha Ni)
        ],
        description: Some("Todi thaat, morning raga with serious mood, uses ati-komal Ga (very flat 3rd)".to_string()),
        is_custom: false,
    }
}

// =============================================================================
// ADDITIONAL POPULAR RAGAS
// =============================================================================

/// Bhupali: 1 2 3 5 6 (pentatonic - omits 4 and 7)
fn create_bhupali() -> ScaleConstraint {
    ScaleConstraint {
        id: "bhupali".to_string(),
        name: "Bhupali".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),         // 1 (Sa)
            natural_only(),         // 2 (shuddha Re)
            natural_only(),         // 3 (shuddha Ga)
            DegreeConstraint::Omit, // 4 (Ma omitted)
            natural_only(),         // 5 (Pa)
            natural_only(),         // 6 (shuddha Dha)
            DegreeConstraint::Omit, // 7 (Ni omitted)
        ],
        description: Some("Pentatonic (5 notes), all natural, equivalent to major pentatonic, beginner favorite".to_string()),
        is_custom: false,
    }
}

/// Bageshri: 1 2 ♭3 4 5 6 ♭7
fn create_bageshri() -> ScaleConstraint {
    ScaleConstraint {
        id: "bageshri".to_string(),
        name: "Bageshri".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            natural_only(),  // 2 (shuddha Re)
            flat_only(),     // ♭3 (komal Ga)
            natural_only(),  // 4 (shuddha Ma)
            natural_only(),  // 5 (Pa)
            natural_only(),  // 6 (shuddha Dha)
            flat_only(),     // ♭7 (komal Ni)
        ],
        description: Some("From Kafi thaat, devotional and serene, late night raga".to_string()),
        is_custom: false,
    }
}

/// Desh: Uses different notes in ascent (pentatonic) vs descent (heptatonic)
/// For constraint purposes, we allow all possible notes used in the raga
fn create_desh() -> ScaleConstraint {
    ScaleConstraint {
        id: "desh".to_string(),
        name: "Desh".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),                                    // 1 (Sa)
            natural_only(),                                    // 2 (shuddha Re)
            natural_only(),                                    // 3 (shuddha Ga) - only in descent
            natural_only(),                                    // 4 (Ma)
            natural_only(),                                    // 5 (Pa)
            natural_only(),                                    // 6 (Dha) - only in descent
            DegreeConstraint::Only(vec![AccidentalType::None, AccidentalType::Flat]), // 7 (both Ni used)
        ],
        description: Some("Variable scale: pentatonic ascending (1 2 4 5 7), heptatonic descending with both Ni, late night folk-influenced raga".to_string()),
        is_custom: false,
    }
}

/// Malkauns: 1 ♭3 4 ♭6 ♭7 (pentatonic - omits 2 and 5)
fn create_malkauns() -> ScaleConstraint {
    ScaleConstraint {
        id: "malkauns".to_string(),
        name: "Malkauns".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),         // 1 (Sa)
            DegreeConstraint::Omit, // 2 (Re omitted)
            flat_only(),            // ♭3 (komal Ga)
            natural_only(),         // 4 (shuddha Ma)
            DegreeConstraint::Omit, // 5 (Pa omitted)
            flat_only(),            // ♭6 (komal Dha)
            flat_only(),            // ♭7 (komal Ni)
        ],
        description: Some("Pentatonic (5 notes), omits Re and Pa, midnight raga of deep meditation".to_string()),
        is_custom: false,
    }
}

/// Durga: 1 2 4 5 6 (pentatonic - omits 3 and 7)
fn create_durga() -> ScaleConstraint {
    ScaleConstraint {
        id: "durga".to_string(),
        name: "Durga".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),         // 1 (Sa)
            natural_only(),         // 2 (shuddha Re)
            DegreeConstraint::Omit, // 3 (Ga omitted)
            natural_only(),         // 4 (shuddha Ma)
            natural_only(),         // 5 (Pa)
            natural_only(),         // 6 (shuddha Dha)
            DegreeConstraint::Omit, // 7 (Ni omitted)
        ],
        description: Some("Pentatonic (5 notes), all natural, related to Bhupali through modal rotation".to_string()),
        is_custom: false,
    }
}

/// Shree (Puriya Dhanashree): 1 ♭2 3 ♯4 5 ♭6 7
fn create_shree() -> ScaleConstraint {
    ScaleConstraint {
        id: "shree".to_string(),
        name: "Shree (Puriya Dhanashree)".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            flat_only(),     // ♭2 (komal Re)
            natural_only(),  // 3 (shuddha Ga)
            sharp_only(),    // ♯4 (tivra Ma)
            natural_only(),  // 5 (Pa)
            flat_only(),     // ♭6 (komal Dha)
            natural_only(),  // 7 (shuddha Ni)
        ],
        description: Some("From Purvi thaat, devotional mood, evening/night raga".to_string()),
        is_custom: false,
    }
}

/// Jaunpuri: 1 2 ♭3 4 5 ♭6 ♭7
fn create_jaunpuri() -> ScaleConstraint {
    ScaleConstraint {
        id: "jaunpuri".to_string(),
        name: "Jaunpuri".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            natural_only(),  // 2 (shuddha Re)
            flat_only(),     // ♭3 (komal Ga)
            natural_only(),  // 4 (shuddha Ma)
            natural_only(),  // 5 (Pa)
            flat_only(),     // ♭6 (komal Dha)
            flat_only(),     // ♭7 (komal Ni)
        ],
        description: Some("From Asavari thaat, late morning raga with melancholy undertones".to_string()),
        is_custom: false,
    }
}

/// Multani: 1 ♭2 ♭3 ♯4 5 ♭6 7
fn create_multani() -> ScaleConstraint {
    ScaleConstraint {
        id: "multani".to_string(),
        name: "Multani".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            flat_only(),     // ♭2 (komal Re)
            flat_only(),     // ♭3 (komal Ga)
            sharp_only(),    // ♯4 (tivra Ma)
            natural_only(),  // 5 (Pa)
            flat_only(),     // ♭6 (komal Dha)
            natural_only(),  // 7 (shuddha Ni)
        ],
        description: Some("From Todi family, afternoon raga with vakra (zigzag) phrases".to_string()),
        is_custom: false,
    }
}

/// Darbari Kanada: 1 2 ♭3 4 5 ♭6 ♭7
fn create_darbari_kanada() -> ScaleConstraint {
    ScaleConstraint {
        id: "darbari_kanada".to_string(),
        name: "Darbari Kanada".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            natural_only(),  // 2 (shuddha Re)
            flat_only(),     // ♭3 (komal Ga)
            natural_only(),  // 4 (shuddha Ma)
            natural_only(),  // 5 (Pa)
            flat_only(),     // ♭6 (komal Dha)
            flat_only(),     // ♭7 (komal Ni)
        ],
        description: Some("From Asavari thaat, 'emperor of ragas', midnight raga with slow tempo and meend (glides)".to_string()),
        is_custom: false,
    }
}

/// Kedar: Uses both Ma, komal Ga in descent
fn create_kedar() -> ScaleConstraint {
    ScaleConstraint {
        id: "kedar".to_string(),
        name: "Kedar".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),                                                  // 1 (Sa)
            natural_only(),                                                  // 2 (shuddha Re)
            DegreeConstraint::Only(vec![AccidentalType::None, AccidentalType::Flat]), // 3 (Ga - komal in descent)
            DegreeConstraint::Only(vec![AccidentalType::None, AccidentalType::Sharp]), // 4 (both Ma used)
            natural_only(),                                                  // 5 (Pa)
            natural_only(),                                                  // 6 (Dha) - only in descent
            natural_only(),                                                  // 7 (shuddha Ni)
        ],
        description: Some("From Kalyan thaat, uses both Ma, late evening raga".to_string()),
        is_custom: false,
    }
}

/// Bihag: 1 2 3 4/♯4 5 6 7 (uses both shuddha and tivra Ma)
fn create_bihag() -> ScaleConstraint {
    ScaleConstraint {
        id: "bihag".to_string(),
        name: "Bihag".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            natural_only(),  // 2 (shuddha Re)
            natural_only(),  // 3 (shuddha Ga)
            DegreeConstraint::Only(vec![AccidentalType::None, AccidentalType::Sharp]), // 4 (both Ma)
            natural_only(),  // 5 (Pa)
            natural_only(),  // 6 (shuddha Dha)
            natural_only(),  // 7 (shuddha Ni)
        ],
        description: Some("From Bilawal thaat, uses both Ma (tivra in ascent, shuddha in descent), romantic evening raga".to_string()),
        is_custom: false,
    }
}

/// Lalit: 1 ♭2 3 4/♯4 - ♭6 7 (omits 5, uses both Ma)
fn create_lalit() -> ScaleConstraint {
    ScaleConstraint {
        id: "lalit".to_string(),
        name: "Lalit".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),         // 1 (Sa)
            flat_only(),            // ♭2 (komal Re)
            natural_only(),         // 3 (shuddha Ga)
            DegreeConstraint::Only(vec![AccidentalType::None, AccidentalType::Sharp]), // 4 (both Ma)
            DegreeConstraint::Omit, // 5 (Pa omitted)
            flat_only(),            // ♭6 (komal Dha)
            natural_only(),         // 7 (shuddha Ni)
        ],
        description: Some("Hexatonic (6 notes), omits Pa, uses both Ma simultaneously (rare), early morning raga".to_string()),
        is_custom: false,
    }
}

/// Miyan ki Todi: 1 ♭2 ♭3 ♯4 5 ♭6 7 (note: ♭3 is ati-komal Ga, extremely flat)
fn create_miyan_ki_todi() -> ScaleConstraint {
    ScaleConstraint {
        id: "miyan_ki_todi".to_string(),
        name: "Miyan ki Todi".to_string(),
        category: ScaleCategory::Raga,
        degrees: [
            natural_only(),  // 1 (Sa)
            flat_only(),     // ♭2 (komal Re)
            flat_only(),     // ♭3 (ati-komal Ga - microtonal, lower shruti than normal komal)
            sharp_only(),    // ♯4 (tivra Ma)
            natural_only(),  // 5 (Pa)
            flat_only(),     // ♭6 (komal Dha)
            natural_only(),  // 7 (shuddha Ni)
        ],
        description: Some("Same as Raga Todi, uses ati-komal Ga (microtonal flat 3rd), highly venerated morning raga".to_string()),
        is_custom: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ionian_allows_all_naturals() {
        let ionian = create_ionian();
        assert!(ionian.is_pitch_allowed(PitchCode::N1));
        assert!(ionian.is_pitch_allowed(PitchCode::N2));
        assert!(ionian.is_pitch_allowed(PitchCode::N3));
        assert!(ionian.is_pitch_allowed(PitchCode::N4));
        assert!(ionian.is_pitch_allowed(PitchCode::N5));
        assert!(ionian.is_pitch_allowed(PitchCode::N6));
        assert!(ionian.is_pitch_allowed(PitchCode::N7));
    }

    #[test]
    fn test_ionian_rejects_sharps() {
        let ionian = create_ionian();
        assert!(!ionian.is_pitch_allowed(PitchCode::N1s));
        assert!(!ionian.is_pitch_allowed(PitchCode::N2s));
    }

    #[test]
    fn test_dorian_accepts_correct_pitches() {
        let dorian = create_dorian();
        assert!(dorian.is_pitch_allowed(PitchCode::N1));  // 1
        assert!(dorian.is_pitch_allowed(PitchCode::N2));  // 2
        assert!(dorian.is_pitch_allowed(PitchCode::N3b)); // ♭3
        assert!(dorian.is_pitch_allowed(PitchCode::N4));  // 4
        assert!(dorian.is_pitch_allowed(PitchCode::N5));  // 5
        assert!(dorian.is_pitch_allowed(PitchCode::N6));  // 6
        assert!(dorian.is_pitch_allowed(PitchCode::N7b)); // ♭7
    }

    #[test]
    fn test_marwa_omits_5th() {
        let marwa = create_marwa();
        assert!(!marwa.is_pitch_allowed(PitchCode::N5));  // Pa prohibited
        assert!(!marwa.is_pitch_allowed(PitchCode::N5s)); // Any 5th prohibited
        assert!(!marwa.is_pitch_allowed(PitchCode::N5b)); // Any 5th prohibited
    }

    #[test]
    fn test_maqam_rast_quarter_tones() {
        let rast = create_maqam_rast();
        assert!(rast.is_pitch_allowed(PitchCode::N3hf)); // 3♭̸
        assert!(rast.is_pitch_allowed(PitchCode::N7hf)); // 7♭̸
        assert!(!rast.is_pitch_allowed(PitchCode::N3));  // Natural 3 not allowed
        assert!(!rast.is_pitch_allowed(PitchCode::N3b)); // Flat 3 not allowed
    }

    #[test]
    fn test_all_predefined_constraints_are_valid() {
        let constraints = get_predefined_constraints();
        // 7 Western modes + 3 maqams + 3 Western/Jazz scales
        // + 10 Thaats + 13 additional ragas + 2 Deprecated
        assert_eq!(constraints.len(), 38);

        // Verify each has a unique ID
        let ids: Vec<&str> = constraints.iter().map(|c| c.id.as_str()).collect();
        let mut unique_ids = ids.clone();
        unique_ids.sort();
        unique_ids.dedup();
        assert_eq!(ids.len(), unique_ids.len(), "Duplicate constraint IDs found");
    }

    #[test]
    fn test_bhupali_pentatonic() {
        let bhupali = create_bhupali();
        // Should allow: 1, 2, 3, 5, 6
        assert!(bhupali.is_pitch_allowed(PitchCode::N1));
        assert!(bhupali.is_pitch_allowed(PitchCode::N2));
        assert!(bhupali.is_pitch_allowed(PitchCode::N3));
        assert!(bhupali.is_pitch_allowed(PitchCode::N5));
        assert!(bhupali.is_pitch_allowed(PitchCode::N6));

        // Should NOT allow: 4, 7 (omitted)
        assert!(!bhupali.is_pitch_allowed(PitchCode::N4));
        assert!(!bhupali.is_pitch_allowed(PitchCode::N7));
    }

    #[test]
    fn test_malkauns_pentatonic_with_komala() {
        let malkauns = create_malkauns();
        // Should allow: 1, ♭3, 4, ♭6, ♭7
        assert!(malkauns.is_pitch_allowed(PitchCode::N1));
        assert!(malkauns.is_pitch_allowed(PitchCode::N3b));
        assert!(malkauns.is_pitch_allowed(PitchCode::N4));
        assert!(malkauns.is_pitch_allowed(PitchCode::N6b));
        assert!(malkauns.is_pitch_allowed(PitchCode::N7b));

        // Should NOT allow: 2, 5 (omitted), or natural 3/6/7
        assert!(!malkauns.is_pitch_allowed(PitchCode::N2));
        assert!(!malkauns.is_pitch_allowed(PitchCode::N5));
        assert!(!malkauns.is_pitch_allowed(PitchCode::N3));
        assert!(!malkauns.is_pitch_allowed(PitchCode::N6));
        assert!(!malkauns.is_pitch_allowed(PitchCode::N7));
    }

    #[test]
    fn test_lalit_hexatonic_omits_pa() {
        let lalit = create_lalit();
        // Lalit omits Pa (5th)
        assert!(!lalit.is_pitch_allowed(PitchCode::N5));
        assert!(!lalit.is_pitch_allowed(PitchCode::N5s));
        assert!(!lalit.is_pitch_allowed(PitchCode::N5b));

        // Should allow both Ma (natural and sharp)
        assert!(lalit.is_pitch_allowed(PitchCode::N4));
        assert!(lalit.is_pitch_allowed(PitchCode::N4s));
    }

    #[test]
    fn test_yaman_kalyan_tivra_ma() {
        let yaman = create_kalyan_yaman();
        // All natural except sharp 4th
        assert!(yaman.is_pitch_allowed(PitchCode::N1));
        assert!(yaman.is_pitch_allowed(PitchCode::N2));
        assert!(yaman.is_pitch_allowed(PitchCode::N3));
        assert!(yaman.is_pitch_allowed(PitchCode::N4s)); // tivra Ma
        assert!(yaman.is_pitch_allowed(PitchCode::N5));
        assert!(yaman.is_pitch_allowed(PitchCode::N6));
        assert!(yaman.is_pitch_allowed(PitchCode::N7));

        // Should NOT allow natural 4th
        assert!(!yaman.is_pitch_allowed(PitchCode::N4));
    }

    #[test]
    fn test_bhairavi_four_komal_notes() {
        let bhairavi = create_bhairavi();
        // Should allow: 1, ♭2, ♭3, 4, 5, ♭6, ♭7
        assert!(bhairavi.is_pitch_allowed(PitchCode::N1));
        assert!(bhairavi.is_pitch_allowed(PitchCode::N2b));
        assert!(bhairavi.is_pitch_allowed(PitchCode::N3b));
        assert!(bhairavi.is_pitch_allowed(PitchCode::N4));
        assert!(bhairavi.is_pitch_allowed(PitchCode::N5));
        assert!(bhairavi.is_pitch_allowed(PitchCode::N6b));
        assert!(bhairavi.is_pitch_allowed(PitchCode::N7b));

        // Should NOT allow natural 2, 3, 6, 7
        assert!(!bhairavi.is_pitch_allowed(PitchCode::N2));
        assert!(!bhairavi.is_pitch_allowed(PitchCode::N3));
        assert!(!bhairavi.is_pitch_allowed(PitchCode::N6));
        assert!(!bhairavi.is_pitch_allowed(PitchCode::N7));
    }

    #[test]
    fn test_jazz_minor_raised_6th_7th() {
        let jazz_minor = create_jazz_minor();
        // 1 2 ♭3 4 5 6 7 (natural minor with raised 6th and 7th)
        assert!(jazz_minor.is_pitch_allowed(PitchCode::N1));
        assert!(jazz_minor.is_pitch_allowed(PitchCode::N2));
        assert!(jazz_minor.is_pitch_allowed(PitchCode::N3b));
        assert!(jazz_minor.is_pitch_allowed(PitchCode::N4));
        assert!(jazz_minor.is_pitch_allowed(PitchCode::N5));
        assert!(jazz_minor.is_pitch_allowed(PitchCode::N6));  // raised (natural, not flat)
        assert!(jazz_minor.is_pitch_allowed(PitchCode::N7));  // raised (natural, not flat)

        // Should NOT allow flat 6th or 7th
        assert!(!jazz_minor.is_pitch_allowed(PitchCode::N6b));
        assert!(!jazz_minor.is_pitch_allowed(PitchCode::N7b));
    }

    #[test]
    fn test_phrygian_dominant_major_third() {
        let phrygian_dom = create_phrygian_dominant();
        // 1 ♭2 3 4 5 ♭6 ♭7 (Phrygian with major 3rd)
        assert!(phrygian_dom.is_pitch_allowed(PitchCode::N1));
        assert!(phrygian_dom.is_pitch_allowed(PitchCode::N2b));
        assert!(phrygian_dom.is_pitch_allowed(PitchCode::N3));  // major 3rd (not flat)
        assert!(phrygian_dom.is_pitch_allowed(PitchCode::N4));
        assert!(phrygian_dom.is_pitch_allowed(PitchCode::N5));
        assert!(phrygian_dom.is_pitch_allowed(PitchCode::N6b));
        assert!(phrygian_dom.is_pitch_allowed(PitchCode::N7b));

        // Should NOT allow natural 2nd or flat 3rd
        assert!(!phrygian_dom.is_pitch_allowed(PitchCode::N2));
        assert!(!phrygian_dom.is_pitch_allowed(PitchCode::N3b));
    }

    #[test]
    fn test_kedar_variable_ma_and_ga() {
        let kedar = create_kedar();
        // Uses both natural and sharp Ma
        assert!(kedar.is_pitch_allowed(PitchCode::N4));
        assert!(kedar.is_pitch_allowed(PitchCode::N4s));

        // Uses both natural and flat Ga
        assert!(kedar.is_pitch_allowed(PitchCode::N3));
        assert!(kedar.is_pitch_allowed(PitchCode::N3b));
    }

    #[test]
    fn test_bihag_both_ma() {
        let bihag = create_bihag();
        // Uses both shuddha Ma and tivra Ma
        assert!(bihag.is_pitch_allowed(PitchCode::N4));
        assert!(bihag.is_pitch_allowed(PitchCode::N4s));

        // All other notes natural
        assert!(bihag.is_pitch_allowed(PitchCode::N1));
        assert!(bihag.is_pitch_allowed(PitchCode::N2));
        assert!(bihag.is_pitch_allowed(PitchCode::N3));
        assert!(bihag.is_pitch_allowed(PitchCode::N5));
        assert!(bihag.is_pitch_allowed(PitchCode::N6));
        assert!(bihag.is_pitch_allowed(PitchCode::N7));
    }
}
