//! Serde serialization helpers for ensuring consistent JSON output

use serde::{Serialize, Serializer};

/// Serialize Option<T> as null when None (don't skip the field)
pub fn serialize_option_as_null<T, S>(value: &Option<T>, serializer: S) -> Result<S::Ok, S::Error>
where
    T: Serialize,
    S: Serializer,
{
    match value {
        Some(v) => serializer.serialize_some(v),
        None => serializer.serialize_none(),
    }
}
