// Beat groups service - functions for extracting beat groups from line elements

use crate::tree::models::{BeatGroupIndicator, Node, NodeId};
use std::collections::HashSet;

/// Extract explicit beat groups marked with Begin/End indicators
/// Returns groups of line-element nodes that are explicitly marked
pub fn extract_explicit_beat_groups(elements: &[Node]) -> Vec<Vec<&Node>> {
    let mut groups = vec![];
    let mut current_group = vec![];
    let mut in_group = false;

    for el in elements {
        match get_beat_group_indicator(el) {
            Some(BeatGroupIndicator::Begin) => {
                current_group = vec![el];
                in_group = true;
            }
            Some(BeatGroupIndicator::End) if in_group => {
                current_group.push(el);
                groups.push(current_group);
                current_group = vec![];
                in_group = false;
            }
            _ if in_group => {
                current_group.push(el);
            }
            _ => {}
        }
    }
    groups
}

/// Extract implicit beats from consecutive Note/Division elements
/// Excludes elements that are already in explicit groups
/// Beats are broken by: BreathMark, Barline, Whitespace
/// Returns all beats, including single-element beats
pub fn extract_implicit_beats<'a>(
    elements: &'a [Node],
    exclude_ids: &HashSet<NodeId>,
) -> Vec<Vec<&'a Node>> {
    let mut beats = vec![];
    let mut current_beat = vec![];

    for el in elements {
        // Skip excluded IDs
        if exclude_ids.contains(&el.id()) {
            if !current_beat.is_empty() {
                beats.push(current_beat);
            }
            current_beat = vec![];
            continue;
        }

        // Check if separator
        if matches!(
            el,
            Node::BreathMark { .. } | Node::Barline { .. } | Node::Whitespace { .. }
        ) {
            if !current_beat.is_empty() {
                beats.push(current_beat);
            }
            current_beat = vec![];
        } else if matches!(el, Node::PitchedElement { .. } | Node::UnpitchedElement { .. }) {
            current_beat.push(el);
        } else {
            // Other elements (Text, etc.) break the beat
            if !current_beat.is_empty() {
                beats.push(current_beat);
            }
            current_beat = vec![];
        }
    }

    // Don't forget final beat
    if !current_beat.is_empty() {
        beats.push(current_beat);
    }

    beats
}

/// Legacy alias for backwards compatibility with SVG renderer
/// SVG renderer should filter beats with len() >= 2
#[deprecated(note = "Use extract_implicit_beats instead")]
pub fn extract_implicit_beat_groups<'a>(
    elements: &'a [Node],
    exclude_ids: &HashSet<NodeId>,
) -> Vec<Vec<&'a Node>> {
    extract_implicit_beats(elements, exclude_ids)
        .into_iter()
        .filter(|beat| beat.len() >= 2) // SVG only wants multi-element beats
        .collect()
}

/// Helper function to get beat_group_indicator from any line-element node
fn get_beat_group_indicator(node: &Node) -> Option<BeatGroupIndicator> {
    match node {
        Node::PitchedElement {
            beat_group_indicator,
            ..
        }
        | Node::UnpitchedElement {
            beat_group_indicator,
            ..
        }
        | Node::Barline {
            beat_group_indicator,
            ..
        }
        | Node::Whitespace {
            beat_group_indicator,
            ..
        }
        | Node::Text {
            beat_group_indicator,
            ..
        }
        | Node::BreathMark {
            beat_group_indicator,
            ..
        } => *beat_group_indicator,
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tree::models::Document;

    #[test]
    fn test_extract_implicit_beat_groups_basic() {
        let mut doc = Document::new();
        let elements = vec![
            Node::PitchedElement {
                id: doc.generate_id(),
                code: crate::tree::models::PitchCode::N1,
                octave: 0,
                pitch_system: crate::tree::models::PitchSystem::Number,
                chars: vec!['1'],
                slur_indicator: None,
                beat_group_indicator: None,
                elements: vec![],
            },
            Node::PitchedElement {
                id: doc.generate_id(),
                code: crate::tree::models::PitchCode::N2,
                octave: 0,
                pitch_system: crate::tree::models::PitchSystem::Number,
                chars: vec!['2'],
                slur_indicator: None,
                beat_group_indicator: None,
                elements: vec![],
            },
            Node::Barline {
                id: doc.generate_id(),
                beat_group_indicator: None,
                chars: vec!['|'],
            },
        ];

        let exclude = HashSet::new();
        let groups = extract_implicit_beat_groups(&elements, &exclude);

        // Should find one group of 2 notes
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].len(), 2);
    }

    #[test]
    fn test_extract_implicit_beat_groups_with_dash() {
        let mut doc = Document::new();
        let elements = vec![
            Node::PitchedElement {
                id: doc.generate_id(),
                code: crate::tree::models::PitchCode::N1,
                octave: 0,
                pitch_system: crate::tree::models::PitchSystem::Number,
                chars: vec!['1'],
                slur_indicator: None,
                beat_group_indicator: None,
                elements: vec![],
            },
            Node::UnpitchedElement {
                id: doc.generate_id(),
                beat_group_indicator: None,
                chars: vec!['-'],
            },
            Node::UnpitchedElement {
                id: doc.generate_id(),
                beat_group_indicator: None,
                chars: vec!['-'],
            },
        ];

        let exclude = HashSet::new();
        let groups = extract_implicit_beat_groups(&elements, &exclude);

        // Should find one group: Note-Division-Division
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].len(), 3);
    }

    #[test]
    fn test_extract_explicit_beat_groups() {
        let mut doc = Document::new();
        let elements = vec![
            Node::PitchedElement {
                id: doc.generate_id(),
                code: crate::tree::models::PitchCode::N1,
                octave: 0,
                pitch_system: crate::tree::models::PitchSystem::Number,
                chars: vec!['1'],
                slur_indicator: None,
                beat_group_indicator: Some(BeatGroupIndicator::Begin),
                elements: vec![],
            },
            Node::PitchedElement {
                id: doc.generate_id(),
                code: crate::tree::models::PitchCode::N2,
                octave: 0,
                pitch_system: crate::tree::models::PitchSystem::Number,
                chars: vec!['2'],
                slur_indicator: None,
                beat_group_indicator: None,
                elements: vec![],
            },
            Node::PitchedElement {
                id: doc.generate_id(),
                code: crate::tree::models::PitchCode::N3,
                octave: 0,
                pitch_system: crate::tree::models::PitchSystem::Number,
                chars: vec!['3'],
                slur_indicator: None,
                beat_group_indicator: Some(BeatGroupIndicator::End),
                elements: vec![],
            },
        ];

        let groups = extract_explicit_beat_groups(&elements);

        // Should find one explicit group of 3 notes
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].len(), 3);
    }
}
