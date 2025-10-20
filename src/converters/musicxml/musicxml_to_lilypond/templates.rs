//! LilyPond template rendering system
//!
//! Provides Mustache-based templates for flexible LilyPond document generation.

use serde::Serialize;

/// Template selection for LilyPond output
#[derive(Debug, Clone, Copy)]
pub enum LilyPondTemplate {
    /// Minimal template - bare bones, no layout settings (for vanilla LilyPond display)
    Minimal,
    /// Compact template - minimal dimensions, no branding (for web preview/SVG embedding)
    Compact,
    /// Standard template - single staff with metadata and compact layout
    Standard,
    /// Multi-stave template - multiple staves with spacious layout
    MultiStave,
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
        LilyPondTemplate::Compact => include_str!("templates/compact.ly.mustache"),
        LilyPondTemplate::Standard => include_str!("templates/standard.ly.mustache"),
        LilyPondTemplate::MultiStave => include_str!("templates/multi-stave.ly.mustache"),
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
