use anyhow::{anyhow, Result};
use jomini::text::{TextToken, ValueReader};
use jomini::{TextTape, Windows1252Encoding};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum PdxValue {
    Scalar(String),
    Array(Vec<PdxValue>),
    Object(BTreeMap<String, PdxValue>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdxFile {
    pub top_keys: BTreeMap<String, PdxValue>,
}

pub fn parse_file(path: &Path) -> Result<PdxFile> {
    let bytes = fs::read(path)?;
    parse_bytes(&bytes)
}

pub fn parse_bytes(bytes: &[u8]) -> Result<PdxFile> {
    let stripped = strip_bom(bytes);
    let tape = TextTape::from_slice(stripped).map_err(|e| anyhow!("pdx parse: {e}"))?;
    let reader = tape.windows1252_reader();
    let mut top = BTreeMap::new();
    for (key, _op, value) in reader.fields() {
        let k = key.read_string();
        let v = convert_value(value)?;
        merge_top(&mut top, k, v);
    }
    Ok(PdxFile { top_keys: top })
}

fn merge_top(map: &mut BTreeMap<String, PdxValue>, key: String, value: PdxValue) {
    if let Some(existing) = map.remove(&key) {
        let merged = match existing {
            PdxValue::Array(mut arr) => {
                arr.push(value);
                PdxValue::Array(arr)
            }
            other => PdxValue::Array(vec![other, value]),
        };
        map.insert(key, merged);
    } else {
        map.insert(key, value);
    }
}

fn convert_value(v: ValueReader<'_, '_, Windows1252Encoding>) -> Result<PdxValue> {
    match v.token() {
        TextToken::Object { .. } | TextToken::MixedContainer => {
            let o = v.read_object().map_err(|e| anyhow!("obj: {e}"))?;
            let mut map = BTreeMap::new();
            for (key, _op, value) in o.fields() {
                let k = key.read_string();
                let child = convert_value(value)?;
                merge_top(&mut map, k, child);
            }
            Ok(PdxValue::Object(map))
        }
        TextToken::Array { .. } => {
            let a = v.read_array().map_err(|e| anyhow!("arr: {e}"))?;
            let mut out = Vec::new();
            for value in a.values() {
                out.push(convert_value(value)?);
            }
            Ok(PdxValue::Array(out))
        }
        _ => {
            let s = v.read_string().map_err(|e| anyhow!("scalar: {e}"))?;
            Ok(PdxValue::Scalar(s))
        }
    }
}

pub fn serialize(file: &PdxFile) -> String {
    let mut out = String::new();
    for (k, v) in &file.top_keys {
        write_kv(&mut out, k, v, 0);
    }
    out
}

pub fn serialize_entry(key: &str, value: &PdxValue) -> String {
    let mut out = String::new();
    write_kv(&mut out, key, value, 0);
    out
}

fn write_kv(out: &mut String, key: &str, value: &PdxValue, depth: usize) {
    let indent = "\t".repeat(depth);
    match value {
        PdxValue::Array(items) if items.iter().all(|i| !matches!(i, PdxValue::Object(_))) => {
            // Array of scalars/arrays: repeat key or inline list. For Paradox top-level
            // duplicates we represented as Array, so re-emit as repeated key = ...
            for item in items {
                write_kv(out, key, item, depth);
            }
        }
        PdxValue::Array(items) => {
            for item in items {
                write_kv(out, key, item, depth);
            }
        }
        PdxValue::Object(map) => {
            out.push_str(&indent);
            out.push_str(&quote_if_needed(key));
            out.push_str(" = {\n");
            for (k, v) in map {
                write_kv(out, k, v, depth + 1);
            }
            out.push_str(&indent);
            out.push_str("}\n");
        }
        PdxValue::Scalar(s) => {
            out.push_str(&indent);
            out.push_str(&quote_if_needed(key));
            out.push_str(" = ");
            out.push_str(&quote_if_needed(s));
            out.push('\n');
        }
    }
}

fn quote_if_needed(s: &str) -> String {
    let needs_quote = s.is_empty()
        || s.chars()
            .any(|c| c.is_whitespace() || matches!(c, '"' | '=' | '{' | '}' | '#'));
    if needs_quote {
        let esc = s.replace('\\', "\\\\").replace('"', "\\\"");
        format!("\"{}\"", esc)
    } else {
        s.to_string()
    }
}

fn strip_bom(b: &[u8]) -> &[u8] {
    if b.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &b[3..]
    } else {
        b
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_simple() {
        let src = br#"
            # comment
            tech_foo = {
                cost = 100
                area = engineering
            }
            tech_bar = { cost = 50 }
        "#;
        let f = parse_bytes(src).unwrap();
        assert!(f.top_keys.contains_key("tech_foo"));
        assert!(f.top_keys.contains_key("tech_bar"));
    }

    #[test]
    fn parse_duplicate_top() {
        let src = br#"
            event = { id = a }
            event = { id = b }
        "#;
        let f = parse_bytes(src).unwrap();
        match f.top_keys.get("event").unwrap() {
            PdxValue::Array(a) => assert_eq!(a.len(), 2),
            _ => panic!("expected array"),
        }
    }
}
