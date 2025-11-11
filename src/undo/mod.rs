use crate::models::core::Cell;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

/// Represents a reversible edit command
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Command {
    /// Insert text at a specific position
    InsertText {
        line: usize,
        start_col: usize,
        /// The cells that were inserted
        cells: Vec<Cell>,
    },
    /// Delete text at a specific position
    DeleteText {
        line: usize,
        start_col: usize,
        /// The cells that were deleted (for restoration)
        deleted_cells: Vec<Cell>,
    },
    /// A batch of commands grouped together (e.g., typing a word)
    Batch {
        commands: Vec<Command>,
    },
}

impl Command {
    /// Execute this command on the document lines
    pub fn execute(&self, lines: &mut Vec<crate::models::core::Line>) -> Result<(), String> {
        match self {
            Command::InsertText { line, start_col, cells } => {
                let line_obj = lines.get_mut(*line)
                    .ok_or_else(|| format!("Line {} not found", line))?;

                // Insert cells at the specified position
                for (i, cell) in cells.iter().enumerate() {
                    line_obj.cells.insert(start_col + i, cell.clone());
                }
                Ok(())
            }
            Command::DeleteText { line, start_col, deleted_cells } => {
                let line_obj = lines.get_mut(*line)
                    .ok_or_else(|| format!("Line {} not found", line))?;

                // Remove the specified number of cells
                for _ in 0..deleted_cells.len() {
                    if *start_col < line_obj.cells.len() {
                        line_obj.cells.remove(*start_col);
                    }
                }
                Ok(())
            }
            Command::Batch { commands } => {
                for cmd in commands {
                    cmd.execute(lines)?;
                }
                Ok(())
            }
        }
    }

    /// Undo this command (reverse the operation)
    pub fn undo(&self, lines: &mut Vec<crate::models::core::Line>) -> Result<(), String> {
        match self {
            Command::InsertText { line, start_col, cells } => {
                // Undo insert by deleting the inserted cells
                let line_obj = lines.get_mut(*line)
                    .ok_or_else(|| format!("Line {} not found", line))?;

                for _ in 0..cells.len() {
                    if *start_col < line_obj.cells.len() {
                        line_obj.cells.remove(*start_col);
                    }
                }
                Ok(())
            }
            Command::DeleteText { line, start_col, deleted_cells } => {
                // Undo delete by re-inserting the deleted cells
                let line_obj = lines.get_mut(*line)
                    .ok_or_else(|| format!("Line {} not found", line))?;

                for (i, cell) in deleted_cells.iter().enumerate() {
                    line_obj.cells.insert(start_col + i, cell.clone());
                }
                Ok(())
            }
            Command::Batch { commands } => {
                // Undo batch in reverse order
                for cmd in commands.iter().rev() {
                    cmd.undo(lines)?;
                }
                Ok(())
            }
        }
    }

    /// Get the affected line index for this command
    pub fn affected_line(&self) -> usize {
        match self {
            Command::InsertText { line, .. } => *line,
            Command::DeleteText { line, .. } => *line,
            Command::Batch { commands } => {
                commands.first().map(|c| c.affected_line()).unwrap_or(0)
            }
        }
    }
}

/// Manages undo/redo command history with intelligent batching
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UndoStack {
    /// Stack of commands that can be undone
    pub commands: VecDeque<Command>,
    /// Current position in the stack (for redo support)
    pub current_index: usize,
    /// Maximum number of commands to keep in history
    max_size: usize,
    /// Current batch being accumulated (if any)
    #[serde(skip)]
    current_batch: Option<Vec<Command>>,
    /// Timestamp of last edit (for batching timeout)
    #[serde(skip)]
    last_edit_time: Option<u64>,
    /// Last cursor position (for batching on cursor movement)
    #[serde(skip)]
    last_cursor_pos: Option<(usize, usize)>, // (line, col)
}

impl Default for UndoStack {
    fn default() -> Self {
        Self::new(100)
    }
}

impl PartialEq for UndoStack {
    fn eq(&self, other: &Self) -> bool {
        // Only compare serialized fields (skip transient fields)
        self.commands == other.commands
            && self.current_index == other.current_index
            && self.max_size == other.max_size
    }
}

impl UndoStack {
    /// Create a new undo stack with specified maximum size
    pub fn new(max_size: usize) -> Self {
        Self {
            commands: VecDeque::new(),
            current_index: 0,
            max_size,
            current_batch: None,
            last_edit_time: None,
            last_cursor_pos: None,
        }
    }

    /// Add a command to the stack with intelligent batching
    ///
    /// Batching breaks on:
    /// - Whitespace characters (space, newline)
    /// - Cursor movement to different position
    /// - Pause > 500ms between keystrokes (DISABLED in WASM - not supported)
    /// - Different operation types (insert vs delete)
    pub fn push(&mut self, command: Command, cursor_pos: (usize, usize)) {
        // Note: Time-based batching is disabled in WASM since SystemTime::now() is not supported
        // We rely on whitespace and cursor movement for batch breaks
        let current_time = 0u64; // Placeholder - time-based batching disabled

        let should_break_batch = self.should_break_batch(&command, cursor_pos, current_time);

        if should_break_batch {
            self.finalize_batch();
        }

        // Start or continue batch
        if let Some(ref mut batch) = self.current_batch {
            batch.push(command);
        } else {
            self.current_batch = Some(vec![command]);
        }

        self.last_edit_time = Some(current_time);
        self.last_cursor_pos = Some(cursor_pos);
    }

    /// Determine if the current batch should be finalized
    fn should_break_batch(&self, command: &Command, cursor_pos: (usize, usize), _current_time: u64) -> bool {
        if self.current_batch.is_none() {
            return false;
        }

        // Break on timeout (500ms) - DISABLED in WASM (SystemTime not supported)
        // Time-based batching is disabled; we rely on whitespace and cursor movement
        // if let Some(last_time) = self.last_edit_time {
        //     if current_time - last_time > 500 {
        //         return true;
        //     }
        // }

        // Break on cursor movement
        if let Some(last_pos) = self.last_cursor_pos {
            if last_pos != cursor_pos {
                return true;
            }
        }

        // Break on whitespace insertion
        if let Command::InsertText { cells, .. } = command {
            if cells.len() == 1 {
                let ch = &cells[0].char;
                if ch == " " || ch == "\n" || ch == "\t" {
                    return true;
                }
            }
        }

        // Break on operation type change (insert vs delete)
        if let Some(batch) = &self.current_batch {
            if let Some(last_cmd) = batch.last() {
                let last_is_insert = matches!(last_cmd, Command::InsertText { .. });
                let current_is_insert = matches!(command, Command::InsertText { .. });
                if last_is_insert != current_is_insert {
                    return true;
                }
            }
        }

        false
    }

    /// Finalize the current batch and add it to the undo stack
    pub fn finalize_batch(&mut self) {
        if let Some(batch) = self.current_batch.take() {
            if !batch.is_empty() {
                let command = if batch.len() == 1 {
                    batch.into_iter().next().unwrap()
                } else {
                    Command::Batch { commands: batch }
                };

                // Truncate any redo history when new command is added
                self.commands.truncate(self.current_index);
                self.commands.push_back(command);
                self.current_index = self.commands.len();

                // Enforce max size
                if self.commands.len() > self.max_size {
                    self.commands.pop_front();
                    self.current_index = self.current_index.saturating_sub(1);
                }
            }
        }
    }

    /// Undo the last command
    pub fn undo(&mut self, lines: &mut Vec<crate::models::core::Line>) -> Result<(), String> {
        // Finalize any pending batch first
        self.finalize_batch();

        if !self.can_undo() {
            return Err("No undo history available".to_string());
        }

        self.current_index -= 1;
        let command = &self.commands[self.current_index];
        command.undo(lines)
    }

    /// Redo the last undone command
    pub fn redo(&mut self, lines: &mut Vec<crate::models::core::Line>) -> Result<(), String> {
        if !self.can_redo() {
            return Err("No redo history available".to_string());
        }

        let command = &self.commands[self.current_index];
        command.execute(lines)?;
        self.current_index += 1;
        Ok(())
    }

    /// Check if undo is available
    pub fn can_undo(&self) -> bool {
        self.current_index > 0
    }

    /// Check if redo is available
    pub fn can_redo(&self) -> bool {
        self.current_index < self.commands.len()
    }

    /// Clear all undo history
    pub fn clear(&mut self) {
        self.commands.clear();
        self.current_index = 0;
        self.current_batch = None;
        self.last_edit_time = None;
        self.last_cursor_pos = None;
    }

    /// Get the number of available undo steps
    pub fn undo_count(&self) -> usize {
        self.current_index
    }

    /// Get the number of available redo steps
    pub fn redo_count(&self) -> usize {
        self.commands.len() - self.current_index
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::core::{Cell, Document, StaffRole};
    use crate::models::elements::{ElementKind, SlurIndicator};

    fn create_test_cell(ch: &str) -> Cell {
        Cell {
            char: ch.to_string(),
            kind: ElementKind::PitchedElement,
            continuation: false,
            col: 0,
            flags: 0,
            pitch_code: None,
            pitch_system: None,
            octave: 0,
            slur_indicator: SlurIndicator::None,
            ornament: None,
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            bbox: (0.0, 0.0, 0.0, 0.0),
            hit: (0.0, 0.0, 0.0, 0.0),
        }
    }

    fn create_test_document() -> Document {
        use crate::models::core::{Document, Line};
        let mut doc = Document::new();
        let line = Line {
            cells: vec![],
            label: String::new(),
            tonic: String::new(),
            pitch_system: None,
            key_signature: String::new(),
            tempo: String::new(),
            time_signature: String::new(),
            tala: String::new(),
            lyrics: String::new(),
            new_system: false,
            system_id: 0,
            part_id: String::new(),
            staff_role: StaffRole::default(),
            beats: vec![],
            slurs: vec![],
        };
        doc.lines.push(line);
        doc
    }

    #[test]
    fn test_insert_text_execute() {
        let mut doc = create_test_document();
        let cell = create_test_cell("S");

        let cmd = Command::InsertText {
            line: 0,
            start_col: 0,
            cells: vec![cell.clone()],
        };

        cmd.execute(&mut doc.lines).unwrap();
        assert_eq!(doc.lines[0].cells.len(), 1);
        assert_eq!(doc.lines[0].cells[0].char, "S");
    }

    #[test]
    fn test_insert_text_undo() {
        let mut doc = create_test_document();
        let cell = create_test_cell("S");

        let cmd = Command::InsertText {
            line: 0,
            start_col: 0,
            cells: vec![cell.clone()],
        };

        cmd.execute(&mut doc.lines).unwrap();
        cmd.undo(&mut doc.lines).unwrap();
        assert_eq!(doc.lines[0].cells.len(), 0);
    }

    #[test]
    fn test_delete_text_execute() {
        let mut doc = create_test_document();
        doc.lines[0].cells.push(create_test_cell("S"));
        doc.lines[0].cells.push(create_test_cell("r"));

        let cmd = Command::DeleteText {
            line: 0,
            start_col: 0,
            deleted_cells: vec![create_test_cell("S")],
        };

        cmd.execute(&mut doc.lines).unwrap();
        assert_eq!(doc.lines[0].cells.len(), 1);
        assert_eq!(doc.lines[0].cells[0].char, "r");
    }

    #[test]
    fn test_delete_text_undo() {
        let mut doc = create_test_document();
        doc.lines[0].cells.push(create_test_cell("S"));

        let cell_to_delete = doc.lines[0].cells[0].clone();

        let cmd = Command::DeleteText {
            line: 0,
            start_col: 0,
            deleted_cells: vec![cell_to_delete],
        };

        cmd.execute(&mut doc.lines).unwrap();
        assert_eq!(doc.lines[0].cells.len(), 0);

        cmd.undo(&mut doc.lines).unwrap();
        assert_eq!(doc.lines[0].cells.len(), 1);
        assert_eq!(doc.lines[0].cells[0].char, "S");
    }

    #[test]
    fn test_batch_command() {
        let mut doc = create_test_document();

        let cmd = Command::Batch {
            commands: vec![
                Command::InsertText {
                    line: 0,
                    start_col: 0,
                    cells: vec![create_test_cell("S")],
                },
                Command::InsertText {
                    line: 0,
                    start_col: 1,
                    cells: vec![create_test_cell("r")],
                },
            ],
        };

        cmd.execute(&mut doc.lines).unwrap();
        assert_eq!(doc.lines[0].cells.len(), 2);

        cmd.undo(&mut doc.lines).unwrap();
        assert_eq!(doc.lines[0].cells.len(), 0);
    }

    #[test]
    fn test_undo_stack_basic() {
        let mut stack = UndoStack::new(10);
        let mut doc = create_test_document();

        let cmd = Command::InsertText {
            line: 0,
            start_col: 0,
            cells: vec![create_test_cell("S")],
        };

        stack.push(cmd.clone(), (0, 0));
        stack.finalize_batch();

        assert!(stack.can_undo());
        assert!(!stack.can_redo());

        stack.undo(&mut doc.lines).unwrap();
        assert!(!stack.can_undo());
        assert!(stack.can_redo());

        stack.redo(&mut doc.lines).unwrap();
        assert!(stack.can_undo());
        assert!(!stack.can_redo());
    }

    #[test]
    fn test_batching_on_whitespace() {
        let mut stack = UndoStack::new(10);

        // Type "Sr" - should batch
        stack.push(
            Command::InsertText {
                line: 0,
                start_col: 0,
                cells: vec![create_test_cell("S")],
            },
            (0, 0),
        );

        stack.push(
            Command::InsertText {
                line: 0,
                start_col: 1,
                cells: vec![create_test_cell("r")],
            },
            (0, 1),
        );

        // Should still be in batch
        assert_eq!(stack.current_batch.as_ref().unwrap().len(), 2);

        // Type space - should break batch
        stack.push(
            Command::InsertText {
                line: 0,
                start_col: 2,
                cells: vec![create_test_cell(" ")],
            },
            (0, 2),
        );

        // Previous batch should be finalized
        stack.finalize_batch();
        assert_eq!(stack.commands.len(), 2); // "Sr" batch + " " batch
    }

    #[test]
    fn test_max_size_enforcement() {
        let mut stack = UndoStack::new(3);

        for i in 0..5 {
            stack.push(
                Command::InsertText {
                    line: 0,
                    start_col: i,
                    cells: vec![create_test_cell("S")],
                },
                (0, i),
            );
            stack.finalize_batch();
        }

        assert_eq!(stack.commands.len(), 3);
    }
}
