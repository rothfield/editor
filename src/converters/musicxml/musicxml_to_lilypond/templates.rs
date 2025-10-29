//! LilyPond template rendering system
//!
//! Provides Mustache-based templates for flexible LilyPond document generation.
//!
//! ## Template Variants
//!
//! This system maintains two variants of each template to balance rendering quality with security:
//!
//! ### Safe Templates (Default)
//! - `Compact`, `Standard`, `MultiStave`
//! - **No Scheme expressions** - pass validation in restricted rendering services
//! - Files: `compact.ly.mustache`, `standard.ly.mustache`, `multi-stave.ly.mustache`
//! - Use case: Public/untrusted environments, containerized services with strict validation
//! - Trade-off: Simpler layout, no advanced spacing control
//!
//! ### Full Templates (Advanced)
//! - `CompactFull`, `StandardFull`, `MultiStaveFull`
//! - **Include Scheme expressions** for advanced layout control
//! - Files: `compact_less_safe.ly.mustache`, `standard_less_safe.ly.mustache`, `multi-stave_less_safe.ly.mustache`
//! - Use case: Self-hosted environments with trusted rendering services
//! - Trade-off: Better visual quality, requires LilyPond with Scheme support
//!
//! ## Scheme Expressions Removed from Safe Templates
//!
//! The safe variants eliminate:
//! - Scheme booleans: `##f` → empty string `""` or empty markup `\markup { }`
//! - Scheme functions: `#ly:one-page-breaking` (page breaking)
//! - Scheme alists: `#'((basic-distance . 1) ...)` (spacing control)
//! - Scheme moment functions: `#(ly:make-moment 1/32)` (duration calculations)
//! - Scheme symbols: `#'italic` (font styling via Scheme)
//!
//! ## Migration Guide
//!
//! Existing code using `LilyPondTemplate::Compact/Standard/MultiStave` now uses safe templates
//! by default. This is intentional and improves compatibility with restricted rendering services.
//!
//! To use full-featured templates with Scheme:
//! ```rust,ignore
//! let template = if parts.len() > 1 {
//!     LilyPondTemplate::MultiStaveFull
//! } else if settings.title.is_some() {
//!     LilyPondTemplate::StandardFull
//! } else {
//!     LilyPondTemplate::CompactFull
//! };
//! ```
//!
//! ## Related Files
//!
//! - `lilypond.rs` - Main template selection logic
//! - `lilypond-service/server.js` - LilyPond rendering service with validation

use serde::Serialize;

/// Template selection for LilyPond output
#[derive(Debug, Clone, Copy)]
pub enum LilyPondTemplate {
    /// Minimal template - bare bones, no layout settings (for vanilla LilyPond display)
    Minimal,
    /// Compact template (safe) - minimal dimensions, no Scheme expressions (default)
    Compact,
    /// Standard template (safe) - single staff with metadata, no Scheme expressions (default)
    Standard,
    /// Multi-stave template (safe) - multiple staves, no Scheme expressions (default)
    MultiStave,
    /// Compact template (full) - with advanced Scheme for layout control
    CompactFull,
    /// Standard template (full) - with advanced Scheme for layout control
    StandardFull,
    /// Multi-stave template (full) - with advanced Scheme for layout control
    MultiStaveFull,
}

/// Context data for template rendering
#[derive(Debug, Clone, Serialize)]
pub struct TemplateContext {
    /// LilyPond version (e.g., "2.24.0")
    pub version: String,

    /// Document title (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,

    /// Document composer (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub composer: Option<String>,

    /// Source code comments (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_comment: Option<String>,

    /// Musical content (notes, rests, etc.) - main staves content
    pub staves: String,

    /// Time signature override (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_signature: Option<String>,

    /// Key signature override (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_signature: Option<String>,

    /// Lyrics content (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lyrics: Option<String>,
}

impl TemplateContext {
    /// Create a new template context with required fields
    pub fn new(version: String, staves: String) -> Self {
        Self {
            version,
            title: None,
            composer: None,
            source_comment: None,
            staves,
            time_signature: None,
            key_signature: None,
            lyrics: None,
        }
    }

    /// Builder pattern for fluent API
    pub fn builder(version: String, staves: String) -> TemplateContextBuilder {
        TemplateContextBuilder::new(version, staves)
    }
}

/// Builder for TemplateContext
pub struct TemplateContextBuilder {
    context: TemplateContext,
}

impl TemplateContextBuilder {
    /// Create a new builder
    pub fn new(version: String, staves: String) -> Self {
        Self {
            context: TemplateContext::new(version, staves),
        }
    }

    /// Set the title (accepts Option or String)
    pub fn title(mut self, title: Option<String>) -> Self {
        self.context.title = title;
        self
    }

    /// Set the composer (accepts Option or String)
    pub fn composer(mut self, composer: Option<String>) -> Self {
        self.context.composer = composer;
        self
    }

    /// Set source comments
    pub fn source_comment<S: Into<String>>(mut self, comment: S) -> Self {
        self.context.source_comment = Some(comment.into());
        self
    }

    /// Set time signature
    pub fn time_signature<S: Into<String>>(mut self, ts: S) -> Self {
        self.context.time_signature = Some(ts.into());
        self
    }

    /// Set key signature
    pub fn key_signature<S: Into<String>>(mut self, ks: S) -> Self {
        self.context.key_signature = Some(ks.into());
        self
    }

    /// Set lyrics
    pub fn lyrics<S: Into<String>>(mut self, lyrics: S) -> Self {
        self.context.lyrics = Some(lyrics.into());
        self
    }

    /// Build the context
    pub fn build(self) -> TemplateContext {
        self.context
    }
}

/// Get template content by type
pub fn get_template_content(template_type: LilyPondTemplate) -> &'static str {
    match template_type {
        LilyPondTemplate::Minimal => include_str!("templates/minimal.ly.mustache"),
        // Safe templates (default) - pass validation in restricted rendering services
        LilyPondTemplate::Compact => include_str!("templates/compact.ly.mustache"),
        LilyPondTemplate::Standard => include_str!("templates/standard.ly.mustache"),
        LilyPondTemplate::MultiStave => include_str!("templates/multi-stave.ly.mustache"),
        // Full templates - include advanced Scheme for better layout control
        LilyPondTemplate::CompactFull => include_str!("templates/compact_less_safe.ly.mustache"),
        LilyPondTemplate::StandardFull => include_str!("templates/standard_less_safe.ly.mustache"),
        LilyPondTemplate::MultiStaveFull => include_str!("templates/multi-stave_less_safe.ly.mustache"),
    }
}

/// Render a LilyPond document using a template
pub fn render_lilypond(
    template_type: LilyPondTemplate,
    context: &TemplateContext,
) -> Result<String, Box<dyn std::error::Error>> {
    let template_content = get_template_content(template_type);
    let template = mustache::compile_str(template_content)?;
    Ok(template.render_to_string(context)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_template_context_builder() {
        let context = TemplateContext::builder("2.24.0".to_string(), "c4 d4 e4".to_string())
            .title(Some("Test Song".to_string()))
            .composer(Some("Test Composer".to_string()))
            .build();

        assert_eq!(context.version, "2.24.0");
        assert_eq!(context.title, Some("Test Song".to_string()));
        assert_eq!(context.composer, Some("Test Composer".to_string()));
        assert_eq!(context.staves, "c4 d4 e4");
    }

    #[test]
    fn test_render_minimal_template() {
        let context =
            TemplateContext::new("2.24.0".to_string(), "c4 d4 e4 f4".to_string());
        let result = render_lilypond(LilyPondTemplate::Minimal, &context);
        assert!(result.is_ok());
        let rendered = result.unwrap();
        assert!(rendered.contains("\\version"));
        assert!(rendered.contains("c4 d4 e4 f4"));
    }

    #[test]
    fn test_render_standard_template() {
        let context = TemplateContext::builder("2.24.0".to_string(), "c4 d4 e4".to_string())
            .title(Some("My Song".to_string()))
            .build();
        let result = render_lilypond(LilyPondTemplate::Standard, &context);
        assert!(result.is_ok());
        let rendered = result.unwrap();
        assert!(rendered.contains("My Song"));
        assert!(rendered.contains("c4 d4 e4"));
    }
}
