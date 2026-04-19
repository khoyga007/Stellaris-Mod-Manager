use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocEntry {
    pub version: Option<u32>,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LocFile {
    /// Language header line (e.g. `l_english`), preserved verbatim (minus trailing `:`).
    pub language: Option<String>,
    pub entries: BTreeMap<String, LocEntry>,
}

pub fn parse_file(path: &Path) -> Result<LocFile> {
    let bytes = fs::read(path).with_context(|| format!("read {}", path.display()))?;
    Ok(parse_bytes(&bytes))
}

pub fn parse_bytes(bytes: &[u8]) -> LocFile {
    let stripped: &[u8] = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &bytes[3..]
    } else {
        bytes
    };
    let text = String::from_utf8_lossy(stripped);

    let mut out = LocFile::default();

    for raw in text.lines() {
        let line = strip_comment(raw);
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Language header: no `"` and ends with `:` — e.g. `l_english:` or `l_simp_chinese:0`.
        if !trimmed.contains('"') {
            if let Some(lang) = parse_header(trimmed) {
                if out.language.is_none() {
                    out.language = Some(lang);
                }
            }
            continue;
        }

        if let Some((key, entry)) = parse_entry(trimmed) {
            out.entries.insert(key, entry);
        }
    }

    out
}

fn strip_comment(s: &str) -> String {
    // Strip `#` comments but only when outside quotes.
    let mut out = String::with_capacity(s.len());
    let mut in_quote = false;
    let mut escape = false;
    for c in s.chars() {
        if escape {
            out.push(c);
            escape = false;
            continue;
        }
        match c {
            '\\' if in_quote => {
                out.push(c);
                escape = true;
            }
            '"' => {
                in_quote = !in_quote;
                out.push(c);
            }
            '#' if !in_quote => break,
            _ => out.push(c),
        }
    }
    out
}

fn parse_header(s: &str) -> Option<String> {
    // Accept `name:` or `name:0` (digits after colon).
    let colon = s.find(':')?;
    let before = &s[..colon];
    let after = &s[colon + 1..];
    if before.is_empty() || before.contains(' ') {
        return None;
    }
    if after.is_empty() || after.chars().all(|c| c.is_ascii_digit()) {
        Some(before.to_string())
    } else {
        None
    }
}

fn parse_entry(s: &str) -> Option<(String, LocEntry)> {
    let colon = s.find(':')?;
    let key = s[..colon].trim();
    if key.is_empty() || key.contains(' ') {
        return None;
    }
    let rest = &s[colon + 1..];
    let quote = rest.find('"')?;
    let version_part = rest[..quote].trim();
    let version = if version_part.is_empty() {
        None
    } else {
        version_part.parse::<u32>().ok()
    };

    // Extract content between first `"` and last unescaped `"` on the line.
    let after_q = &rest[quote + 1..];
    let mut value = String::with_capacity(after_q.len());
    let mut escape = false;
    let mut closed = false;
    for c in after_q.chars() {
        if escape {
            value.push(c);
            escape = false;
            continue;
        }
        match c {
            '\\' => escape = true,
            '"' => {
                closed = true;
                break;
            }
            _ => value.push(c),
        }
    }
    if !closed {
        return None;
    }

    Some((
        key.to_string(),
        LocEntry {
            version,
            value,
        },
    ))
}

pub fn serialize(file: &LocFile) -> String {
    let mut out = String::new();
    if let Some(lang) = &file.language {
        out.push_str(&format!("{}:\n", lang));
    }
    for (k, e) in &file.entries {
        let v = e.version.unwrap_or(0);
        let escaped = e.value.replace('\\', "\\\\").replace('"', "\\\"");
        out.push_str(&format!(" {}:{} \"{}\"\n", k, v, escaped));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_basic() {
        let src = b"\xEF\xBB\xBFl_english:\n KEY_A:0 \"alpha\"\n KEY_B:1 \"bra \\\"vo\\\"\"\n # comment\n";
        let f = parse_bytes(src);
        assert_eq!(f.language.as_deref(), Some("l_english"));
        assert_eq!(f.entries.len(), 2);
        assert_eq!(f.entries.get("KEY_A").unwrap().value, "alpha");
        assert_eq!(f.entries.get("KEY_B").unwrap().value, "bra \"vo\"");
    }

    #[test]
    fn roundtrip() {
        let src = b"l_english:\n FOO:2 \"bar\"\n";
        let f = parse_bytes(src);
        let s = serialize(&f);
        assert!(s.contains("l_english:"));
        assert!(s.contains("FOO:2 \"bar\""));
    }
}
