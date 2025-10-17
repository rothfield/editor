// LilyPond SVG Generator - Handles compilation from source to SVG files
use std::process::{Command, Stdio};
use std::io::Write;
use std::fs;
use uuid::Uuid;

#[derive(Debug)]
pub struct LilyPondGenerator {
    pub output_dir: String,
}

#[derive(Debug)]
pub struct GenerationResult {
    pub success: bool,
    pub svg_content: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug)]
pub struct PdfGenerationResult {
    pub success: bool,
    pub pdf_data: Option<Vec<u8>>,
    pub error: Option<String>,
}

impl LilyPondGenerator {
    pub fn new(output_dir: String) -> Self {
        Self { output_dir }
    }
    
    
    
    /// Generate SVG from LilyPond source using piping (no temp .ly files!)
    pub async fn generate_svg(&self, lilypond_source: &str) -> GenerationResult {
        let temp_id = Uuid::new_v4();
        let svg_file = format!("{}/temp_{}.svg", self.output_dir, temp_id);
        
        match self.run_lilypond_pipe(lilypond_source, &temp_id).await {
            Ok(()) => {
                // Check if SVG file was created and read its content
                if std::path::Path::new(&svg_file).exists() {
                    match fs::read_to_string(&svg_file) {
                        Ok(svg_content) => {
                            // Clean up the temporary file
                            let _ = fs::remove_file(&svg_file);
                            GenerationResult {
                                success: true,
                                svg_content: Some(svg_content),
                                error: None,
                            }
                        },
                        Err(e) => GenerationResult {
                            success: false,
                            svg_content: None,
                            error: Some(format!("Failed to read SVG file: {}", e)),
                        }
                    }
                } else {
                    GenerationResult {
                        success: false,
                        svg_content: None,
                        error: Some("SVG file was not generated".to_string()),
                    }
                }
            },
            Err(error) => GenerationResult {
                success: false,
                svg_content: None,
                error: Some(error),
            }
        }
    }
    
    /// Generate PDF from LilyPond source using piping
    pub async fn generate_pdf(&self, lilypond_source: &str) -> PdfGenerationResult {
        let temp_id = Uuid::new_v4();
        let pdf_file = format!("{}/temp_{}.pdf", self.output_dir, temp_id);

        match self.run_lilypond_pdf_pipe(lilypond_source, &temp_id).await {
            Ok(()) => {
                // Check if PDF file was created and read its content
                if std::path::Path::new(&pdf_file).exists() {
                    match fs::read(&pdf_file) {
                        Ok(pdf_data) => {
                            // Clean up the temporary file
                            let _ = fs::remove_file(&pdf_file);
                            PdfGenerationResult {
                                success: true,
                                pdf_data: Some(pdf_data),
                                error: None,
                            }
                        },
                        Err(e) => PdfGenerationResult {
                            success: false,
                            pdf_data: None,
                            error: Some(format!("Failed to read PDF file: {}", e)),
                        }
                    }
                } else {
                    PdfGenerationResult {
                        success: false,
                        pdf_data: None,
                        error: Some("PDF file was not generated".to_string()),
                    }
                }
            },
            Err(error) => PdfGenerationResult {
                success: false,
                pdf_data: None,
                error: Some(error),
            }
        }
    }

    /// Run lilypond with piped input for SVG generation
    async fn run_lilypond_pipe(&self, lilypond_source: &str, temp_id: &Uuid) -> Result<(), String> {
        // Ensure output directory exists
        if let Err(e) = fs::create_dir_all(&self.output_dir) {
            return Err(format!("Failed to create output directory: {}", e));
        }

        // Spawn lilypond process with piped stdin
        let mut child = Command::new("lilypond")
            .args(&[
                "--svg",
                "-dno-point-and-click",
                "--output", &format!("{}/temp_{}", self.output_dir, temp_id),
                "-"  // Read from stdin
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn lilypond (is it installed?): {}", e))?;

        // Write LilyPond source to stdin
        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(lilypond_source.as_bytes())
                .map_err(|e| format!("Failed to write to lilypond stdin: {}", e))?;
        }

        // Wait for completion and get output
        let output = child.wait_with_output()
            .map_err(|e| format!("Failed to wait for lilypond: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("LilyPond compilation failed: {}", stderr));
        }

        Ok(())
    }

    /// Run lilypond with piped input for PDF generation
    async fn run_lilypond_pdf_pipe(&self, lilypond_source: &str, temp_id: &Uuid) -> Result<(), String> {
        // Ensure output directory exists
        if let Err(e) = fs::create_dir_all(&self.output_dir) {
            return Err(format!("Failed to create output directory: {}", e));
        }

        // Spawn lilypond process with piped stdin for PDF output
        let mut child = Command::new("lilypond")
            .args(&[
                "--pdf",
                "-dno-point-and-click",
                "--output", &format!("{}/temp_{}", self.output_dir, temp_id),
                "-"  // Read from stdin
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn lilypond (is it installed?): {}", e))?;

        // Write LilyPond source to stdin
        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(lilypond_source.as_bytes())
                .map_err(|e| format!("Failed to write to lilypond stdin: {}", e))?;
        }

        // Wait for completion and get output
        let output = child.wait_with_output()
            .map_err(|e| format!("Failed to wait for lilypond: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("LilyPond compilation failed: {}", stderr));
        }

        Ok(())
    }

}