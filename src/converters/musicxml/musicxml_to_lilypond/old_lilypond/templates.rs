use serde::Serialize;
// use crate::models::Document; // DELETED - unused import

#[derive(Debug, Clone)]
pub enum LilyPondTemplate {
    Minimal,
    Standard,
    MultiStave,
}

#[derive(Debug, Clone, Serialize)]
pub struct TemplateContext {
    pub version: String,
    pub title: Option<String>,
    pub composer: Option<String>,
    pub source_comment: Option<String>,
    pub staves: String,
    pub time_signature: Option<String>,
    pub key_signature: Option<String>,
    pub lyrics: Option<String>,
}

impl Default for TemplateContext {
    fn default() -> Self {
        Self {
            version: "2.24.0".to_string(),
            title: None,
            composer: None,
            source_comment: None,
            staves: String::new(),
            time_signature: None,
            key_signature: None,
            lyrics: None,
        }
    }
}

impl TemplateContext {
    // DELETED - unused method
    /*
    pub fn from_document(document: &Document, source_text: Option<&str>, musical_content: &str) -> Self {
        let mut context = TemplateContext::default();
        
        // Extract title and composer from metadata
        if let Some(ref title) = document.metadata.title {
            context.title = Some(title.text.clone());
        }
        
        // TODO: Add composer extraction when we support it
        
        // Add source text as comment
        if let Some(source) = source_text {
            context.source_comment = Some(format_source_comment(source));
        }
        
        // Set the musical content (staves)
        context.staves = musical_content.to_string();
        
        // TODO: Extract time signature and key signature from document
        // TODO: Extract lyrics from document
        
        context
    }
    */
    
    pub fn new() -> Self {
        Self::default()
    }
    
    pub fn set_title(&mut self, title: Option<String>) {
        self.title = title;
    }
    
    pub fn set_source_comment(&mut self, source: Option<String>) {
        self.source_comment = source.map(|s| format_source_comment(&s));
    }
    
    pub fn set_staves(&mut self, staves: String) {
        self.staves = staves;
    }
    
    pub fn builder() -> TemplateContextBuilder {
        TemplateContextBuilder::new()
    }
}

pub struct TemplateContextBuilder {
    context: TemplateContext,
}

impl TemplateContextBuilder {
    pub fn new() -> Self {
        Self {
            context: TemplateContext::default(),
        }
    }
    
    // DELETED - unused method
    /*
    pub fn version<S: Into<String>>(mut self, version: S) -> Self {
        self.context.version = version.into();
        self
    }
    */
    
    pub fn title<S: Into<String>>(mut self, title: S) -> Self {
        self.context.title = Some(title.into());
        self
    }
    
    // DELETED - unused method
    /*
    pub fn composer<S: Into<String>>(mut self, composer: S) -> Self {
        self.context.composer = Some(composer.into());
        self
    }
    */
    
    pub fn source_comment<S: Into<String>>(mut self, source: S) -> Self {
        self.context.source_comment = Some(format_source_comment(&source.into()));
        self
    }
    
    pub fn staves<S: Into<String>>(mut self, staves: S) -> Self {
        self.context.staves = staves.into();
        self
    }
    
    // DELETED - unused method
    /*
    pub fn time_signature<S: Into<String>>(mut self, time_sig: S) -> Self {
        self.context.time_signature = Some(time_sig.into());
        self
    }
    */
    
    // DELETED - unused method
    /*
    pub fn key_signature<S: Into<String>>(mut self, key_sig: S) -> Self {
        self.context.key_signature = Some(key_sig.into());
        self
    }
    */
    
    pub fn lyrics<S: Into<String>>(mut self, lyrics: S) -> Self {
        self.context.lyrics = Some(lyrics.into());
        self
    }
    
    pub fn build(self) -> TemplateContext {
        self.context
    }
}

fn format_source_comment(source: &str) -> String {
    source.lines()
        .map(|line| format!("% {}", line))
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn get_template_content(template_type: LilyPondTemplate) -> &'static str {
    match template_type {
        LilyPondTemplate::Minimal => include_str!("templates/minimal.ly.mustache"),
        LilyPondTemplate::Standard => include_str!("templates/standard.ly.mustache"),
        LilyPondTemplate::MultiStave => include_str!("templates/multi-stave.ly.mustache"),
    }
}

pub fn render_lilypond(template_type: LilyPondTemplate, context: &TemplateContext) -> Result<String, Box<dyn std::error::Error>> {
    let template_content = get_template_content(template_type);
    let template = mustache::compile_str(template_content)?;
    let rendered = template.render_to_string(context)?;
    Ok(rendered)
}

// DELETED - unused function
/*
pub fn auto_select_template(document: &Document) -> LilyPondTemplate {
    // For now, use heuristics to select template
    // TODO: Make this more sophisticated based on document features
    
    // Check if document has complex features
    let has_complex_metadata = document.metadata.title.is_some();
    let has_many_nodes = document.nodes.len() > 20;
    
    if has_many_nodes {
        LilyPondTemplate::Standard
    } else if has_complex_metadata {
        LilyPondTemplate::Testing
    } else {
        LilyPondTemplate::Minimal
    }
}
*/


pub fn auto_select_template_for_document(document: &crate::parse::model::Document) -> LilyPondTemplate {
    // Use Standard if there's a title, otherwise Minimal
    if document.title.is_some() {
        LilyPondTemplate::Standard
    } else {
        LilyPondTemplate::Minimal
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_template_context_builder() {
        let context = TemplateContext::builder()
            .title("Test Song")
            .staves("c d e f")
            .build();
            
        assert_eq!(context.title, Some("Test Song".to_string()));
        assert_eq!(context.staves, "c d e f");
        assert_eq!(context.version, "2.24.0");
    }
    
    #[test]
    fn test_render_minimal_template() {
        let context = TemplateContext::builder()
            .title("Simple Test")
            .staves("c d e f")
            .build();
            
        let result = render_lilypond(LilyPondTemplate::Standard, &context);
        assert!(result.is_ok());
        let rendered = result.unwrap();
        assert!(rendered.contains("\\version \"2.24.0\""));
        assert!(rendered.contains("title = \"Simple Test\""));
        assert!(rendered.contains("c d e f"));
    }
}