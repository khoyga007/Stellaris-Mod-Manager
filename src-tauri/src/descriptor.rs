use anyhow::{Context, Result};
use std::path::Path;

#[derive(Debug, Default, Clone)]
pub struct Descriptor {
    pub name: Option<String>,
    pub version: Option<String>,
    pub supported_version: Option<String>,
    pub tags: Vec<String>,
    pub dependencies: Vec<String>,
    pub picture: Option<String>,
    pub remote_file_id: Option<String>,
    pub path: Option<String>,
    pub archive: Option<String>,
}

pub fn parse(text: &str) -> Descriptor {
    let mut d = Descriptor::default();
    let mut chars = text.chars().peekable();
    let mut buf = String::new();
    while chars.peek().is_some() {
        buf.clear();
        skip_ws(&mut chars);
        let key = read_ident(&mut chars);
        if key.is_empty() {
            break;
        }
        skip_ws(&mut chars);
        if chars.peek() != Some(&'=') {
            continue;
        }
        chars.next();
        skip_ws(&mut chars);

        match chars.peek() {
            Some(&'"') => {
                chars.next();
                while let Some(c) = chars.next() {
                    if c == '"' {
                        break;
                    }
                    buf.push(c);
                }
                assign(&mut d, &key, buf.clone());
            }
            Some(&'{') => {
                chars.next();
                let mut items: Vec<String> = Vec::new();
                loop {
                    skip_ws(&mut chars);
                    match chars.peek() {
                        Some(&'}') => {
                            chars.next();
                            break;
                        }
                        Some(&'"') => {
                            chars.next();
                            let mut s = String::new();
                            while let Some(c) = chars.next() {
                                if c == '"' {
                                    break;
                                }
                                s.push(c);
                            }
                            items.push(s);
                        }
                        Some(_) => {
                            let s = read_ident(&mut chars);
                            if s.is_empty() {
                                chars.next();
                            } else {
                                items.push(s);
                            }
                        }
                        None => break,
                    }
                }
                if key == "tags" {
                    d.tags = items;
                } else if key == "dependencies" {
                    d.dependencies = items;
                }
            }
            _ => {
                let v = read_ident(&mut chars);
                assign(&mut d, &key, v);
            }
        }
    }
    d
}

fn assign(d: &mut Descriptor, key: &str, value: String) {
    match key {
        "name" => d.name = Some(value),
        "version" => d.version = Some(value),
        "supported_version" => d.supported_version = Some(value),
        "picture" => d.picture = Some(value),
        "remote_file_id" => d.remote_file_id = Some(value),
        "path" => d.path = Some(value),
        "archive" => d.archive = Some(value),
        _ => {}
    }
}

fn skip_ws<I: Iterator<Item = char>>(it: &mut std::iter::Peekable<I>) {
    while let Some(&c) = it.peek() {
        if c == '#' {
            while let Some(&c) = it.peek() {
                it.next();
                if c == '\n' {
                    break;
                }
            }
        } else if c.is_whitespace() {
            it.next();
        } else {
            break;
        }
    }
}

fn read_ident<I: Iterator<Item = char>>(it: &mut std::iter::Peekable<I>) -> String {
    let mut s = String::new();
    while let Some(&c) = it.peek() {
        if c.is_alphanumeric() || c == '_' || c == '-' || c == '.' {
            s.push(c);
            it.next();
        } else {
            break;
        }
    }
    s
}

pub fn write_descriptor(path: &Path, d: &Descriptor) -> Result<()> {
    let mut s = String::new();
    if let Some(n) = &d.name {
        s.push_str(&format!("name=\"{}\"\n", escape(n)));
    }
    if let Some(v) = &d.version {
        s.push_str(&format!("version=\"{}\"\n", escape(v)));
    }
    if let Some(sv) = &d.supported_version {
        s.push_str(&format!("supported_version=\"{}\"\n", escape(sv)));
    }
    if !d.tags.is_empty() {
        s.push_str("tags={\n");
        for t in &d.tags {
            s.push_str(&format!("\t\"{}\"\n", escape(t)));
        }
        s.push_str("}\n");
    }
    if !d.dependencies.is_empty() {
        s.push_str("dependencies={\n");
        for dep in &d.dependencies {
            s.push_str(&format!("\t\"{}\"\n", escape(dep)));
        }
        s.push_str("}\n");
    }
    if let Some(p) = &d.picture {
        s.push_str(&format!("picture=\"{}\"\n", escape(p)));
    }
    if let Some(p) = &d.path {
        s.push_str(&format!("path=\"{}\"\n", escape(p)));
    }
    if let Some(a) = &d.archive {
        s.push_str(&format!("archive=\"{}\"\n", escape(a)));
    }
    if let Some(r) = &d.remote_file_id {
        s.push_str(&format!("remote_file_id=\"{}\"\n", escape(r)));
    }
    std::fs::write(path, s).with_context(|| format!("writing {}", path.display()))
}

fn escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}
