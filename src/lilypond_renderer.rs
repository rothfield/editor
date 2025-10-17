/// LilyPond rendering module with stdin-based execution (no disk writes)
///
/// Generates PNG/SVG from LilyPond source using piped stdin to lilypond command.
/// Supports Mustache templating for minimal (in-tab) and full (display) variants.

use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::io::Write;

#[derive(Debug, Deserialize)]
pub struct LilyPondRenderRequest {
    pub lilypond_source: String,
    #[serde(default)]
    pub template_variant: String, // "minimal" or "full"
    #[serde(default = "default_format")]
    pub output_format: String, // "svg" or "png"
}

fn default_format() -> String {
    "svg".to_string()
}

#[derive(Debug, Serialize)]
pub struct LilyPondRenderResponse {
    pub success: bool,
    pub svg: Option<String>,
    pub png_base64: Option<String>,
    pub format: String,
    pub error: Option<String>,
}

/// Template variants for LilyPond source generation
#[derive(Debug, Clone)]
pub enum TemplateVariant {
    /// Minimal template: stripped version for smaller PNG/SVG output
    /// Used for in-tab real-time preview
    Minimal,
    /// Full template: complete LilyPond with all metadata
    /// Used for display/export
    Full,
}

impl TemplateVariant {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "minimal" => TemplateVariant::Minimal,
            _ => TemplateVariant::Full,
        }
    }
}

/// Minimal LilyPond template - compact, no layout tweaks, smaller output
fn minimal_template(lilypond_src: &str) -> String {
    format!(
        r#"\version "2.24.0"
\score {{
  {{
    {}
  }}
  \layout {{ }}
  \midi {{ }}
}}"#,
        lilypond_src
    )
}

/// Full LilyPond template - complete with metadata and layout
fn full_template(lilypond_src: &str) -> String {
    format!(
        r#"\version "2.24.0"
\language "english"

\score {{
  \new Staff {{
    \relative c' {{
      {}
    }}
  }}
  \layout {{ indent = #0 }}
  \midi {{
    \context {{
      \Score tempoWholesPerMinute = #(ly:make-moment 120 4)
    }}
  }}
}}"#,
        lilypond_src
    )
}

/// Get LilyPond template for variant
fn get_template(variant: &TemplateVariant, source: &str) -> String {
    match variant {
        TemplateVariant::Minimal => minimal_template(source),
        TemplateVariant::Full => full_template(source),
    }
}

/// Render LilyPond source to PNG via stdin (no disk writes)
/// Returns PNG binary data
fn lilypond_to_png(lilypond_src: &str) -> Result<Vec<u8>, String> {
    let mut child = Command::new("lilypond")
        .arg("--png")
        .arg("-dno-gs-load-fonts")
        .arg("-dinclude-eps-fonts")
        .arg("-dbackend=eps")
        .arg("-dresolution=300")
        .arg("-o")
        .arg("/dev/stdout") // Output to stdout
        .arg("-") // Read from stdin
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn lilypond: {}", e))?;

    // Write LilyPond source to stdin
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(lilypond_src.as_bytes())
            .map_err(|e| format!("Failed to write to lilypond stdin: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for lilypond: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("LilyPond failed: {}", stderr));
    }

    Ok(output.stdout)
}

/// Convert PNG to SVG using ImageMagick convert
fn png_to_svg(png_data: &[u8]) -> Result<String, String> {
    let mut convert = Command::new("convert")
        .arg("-") // Read from stdin
        .arg("svg:-") // Output SVG to stdout
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn convert: {}", e))?;

    // Write PNG data to stdin
    if let Some(mut stdin) = convert.stdin.take() {
        stdin
            .write_all(png_data)
            .map_err(|e| format!("Failed to write PNG to convert stdin: {}", e))?;
    }

    let output = convert
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for convert: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PNG to SVG conversion failed: {}", stderr));
    }

    String::from_utf8(output.stdout)
        .map_err(|e| format!("SVG output is not valid UTF-8: {}", e))
}

/// Main render function
pub async fn render_lilypond(
    request: LilyPondRenderRequest,
) -> Result<LilyPondRenderResponse, String> {
    // Validate input
    if request.lilypond_source.trim().is_empty() {
        return Err("LilyPond source is empty".to_string());
    }

    let variant = TemplateVariant::from_str(&request.template_variant);
    let template = get_template(&variant, &request.lilypond_source);

    // Render to PNG via stdin
    let png_data = lilypond_to_png(&template)?;

    // Convert to requested format
    match request.output_format.to_lowercase().as_str() {
        "svg" => {
            let svg = png_to_svg(&png_data)?;
            Ok(LilyPondRenderResponse {
                success: true,
                svg: Some(svg),
                png_base64: None,
                format: "svg".to_string(),
                error: None,
            })
        }
        "png" => {
            use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
            let png_base64 = BASE64.encode(&png_data);
            Ok(LilyPondRenderResponse {
                success: true,
                svg: None,
                png_base64: Some(png_base64),
                format: "png".to_string(),
                error: None,
            })
        }
        _ => Err(format!(
            "Unsupported output format: {}",
            request.output_format
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_minimal_template() {
        let source = "c d e f";
        let result = minimal_template(source);
        assert!(result.contains(r#"\version "2.24.0""#));
        assert!(result.contains("c d e f"));
        assert!(result.contains(r#"\score {"#));
    }

    #[test]
    fn test_full_template() {
        let source = "c d e f";
        let result = full_template(source);
        assert!(result.contains(r#"\version "2.24.0""#));
        assert!(result.contains(r#"\new Staff {"#));
        assert!(result.contains("c d e f"));
    }

    #[test]
    fn test_template_variant_from_str() {
        match TemplateVariant::from_str("minimal") {
            TemplateVariant::Minimal => (),
            _ => panic!("Expected Minimal"),
        }

        match TemplateVariant::from_str("full") {
            TemplateVariant::Full => (),
            _ => panic!("Expected Full"),
        }

        match TemplateVariant::from_str("MINIMAL") {
            TemplateVariant::Minimal => (),
            _ => panic!("Expected Minimal (case insensitive)"),
        }

        match TemplateVariant::from_str("unknown") {
            TemplateVariant::Full => (),
            _ => panic!("Expected Full as default"),
        }
    }
}
