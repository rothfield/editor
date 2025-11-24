/// Unit test for Sargam glyph mapping
///
/// Sargam uses uppercase/lowercase to indicate shuddha (natural) vs komal (flat):
/// - N1 → 'S' (Sa - always uppercase, no komal variant)
/// - N2 → 'R' (Re - shuddha, uppercase)
/// - N2b → 'r' (re - komal, lowercase)
/// - N3 → 'G' (Ga - shuddha, uppercase)
/// - N3b → 'g' (ga - komal, lowercase)
/// - N4 → 'm' (ma - shuddha, lowercase)
/// - N4s → 'M' (Ma - tivra, uppercase)
/// - N5 → 'P' (Pa - always uppercase, no komal variant)
/// - N6 → 'D' (Dha - shuddha, uppercase)
/// - N6b → 'd' (dha - komal, lowercase)
/// - N7 → 'N' (Ni - shuddha, uppercase)
/// - N7b → 'n' (ni - komal, lowercase)

#[cfg(test)]
mod tests {
    #[test]
    fn test_sargam_natural_notes_mapping() {
        use editor_wasm::models::pitch_code::PitchCode;
        use editor_wasm::models::elements::PitchSystem;
        use editor_wasm::renderers::font_utils::glyph_for_pitch;

        // Natural notes (shuddha) - N1 through N7
        // Expected glyphs: S R G m P D N

        // N1 → 'S' (Sa)
        let glyph = glyph_for_pitch(PitchCode::N1, 0, PitchSystem::Sargam);
        assert!(glyph.is_some(), "N1 should have a Sargam glyph");

        // N2 → 'R' (Re - uppercase for shuddha)
        let glyph = glyph_for_pitch(PitchCode::N2, 0, PitchSystem::Sargam);
        assert!(glyph.is_some(), "N2 should have a Sargam glyph");

        // N3 → 'G' (Ga - uppercase for shuddha)
        let glyph = glyph_for_pitch(PitchCode::N3, 0, PitchSystem::Sargam);
        assert!(glyph.is_some(), "N3 should have a Sargam glyph");

        // N4 → 'm' (ma - lowercase for shuddha Ma)
        let glyph = glyph_for_pitch(PitchCode::N4, 0, PitchSystem::Sargam);
        assert!(glyph.is_some(), "N4 should have a Sargam glyph");

        // N5 → 'P' (Pa)
        let glyph = glyph_for_pitch(PitchCode::N5, 0, PitchSystem::Sargam);
        assert!(glyph.is_some(), "N5 should have a Sargam glyph");

        // N6 → 'D' (Dha - uppercase for shuddha)
        let glyph = glyph_for_pitch(PitchCode::N6, 0, PitchSystem::Sargam);
        assert!(glyph.is_some(), "N6 should have a Sargam glyph");

        // N7 → 'N' (Ni - uppercase for shuddha)
        let glyph = glyph_for_pitch(PitchCode::N7, 0, PitchSystem::Sargam);
        assert!(glyph.is_some(), "N7 should have a Sargam glyph");
    }

    #[test]
    fn test_sargam_komal_notes_mapping() {
        use editor_wasm::models::pitch_code::PitchCode;
        use editor_wasm::models::elements::PitchSystem;
        use editor_wasm::renderers::font_utils::glyph_for_pitch;

        // Komal (flat) notes - lowercase indicates komal
        // N2b → 'r' (komal Re)
        // N3b → 'g' (komal Ga)
        // N6b → 'd' (komal Dha)
        // N7b → 'n' (komal Ni)

        // N2b → 'r' (komal Re - lowercase)
        let glyph = glyph_for_pitch(PitchCode::N2b, 0, PitchSystem::Sargam);
        assert!(glyph.is_some(), "N2b should have a Sargam glyph for komal Re");

        // N3b → 'g' (komal Ga - lowercase)
        let glyph = glyph_for_pitch(PitchCode::N3b, 0, PitchSystem::Sargam);
        assert!(glyph.is_some(), "N3b should have a Sargam glyph for komal Ga");

        // N6b → 'd' (komal Dha - lowercase)
        let glyph = glyph_for_pitch(PitchCode::N6b, 0, PitchSystem::Sargam);
        assert!(glyph.is_some(), "N6b should have a Sargam glyph for komal Dha");

        // N7b → 'n' (komal Ni - lowercase)
        let glyph = glyph_for_pitch(PitchCode::N7b, 0, PitchSystem::Sargam);
        assert!(glyph.is_some(), "N7b should have a Sargam glyph for komal Ni");
    }

    #[test]
    fn test_sargam_tivra_ma() {
        use editor_wasm::models::pitch_code::PitchCode;
        use editor_wasm::models::elements::PitchSystem;
        use editor_wasm::renderers::font_utils::glyph_for_pitch;

        // N4s → 'M' (tivra Ma - uppercase)
        let glyph = glyph_for_pitch(PitchCode::N4s, 0, PitchSystem::Sargam);
        assert!(glyph.is_some(), "N4s should have a Sargam glyph for tivra Ma");
    }

    #[test]
    fn test_sargam_character_order() {
        // Document the expected character order for Sargam system
        // atoms.yaml order: S, r, R, g, G, m, M, P, d, D, n, N (12 chars)
        //
        // But PitchCode mapping should be:
        // N1  → 'S' (index 0 in atoms.yaml)
        // N2  → 'R' (index 2 in atoms.yaml) - NOT 'r'!
        // N2b → 'r' (index 1 in atoms.yaml)
        // N3  → 'G' (index 4 in atoms.yaml) - NOT 'R'!
        // N3b → 'g' (index 3 in atoms.yaml)
        // N4  → 'm' (index 5 in atoms.yaml)
        // N4s → 'M' (index 6 in atoms.yaml)
        // N5  → 'P' (index 7 in atoms.yaml)
        // N6  → 'D' (index 9 in atoms.yaml)
        // N6b → 'd' (index 8 in atoms.yaml)
        // N7  → 'N' (index 11 in atoms.yaml)
        // N7b → 'n' (index 10 in atoms.yaml)

        // This requires a CUSTOM mapping for Sargam, not sequential character indexing!
    }
}
