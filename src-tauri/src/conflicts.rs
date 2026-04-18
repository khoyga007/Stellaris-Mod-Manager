use crate::mods::ModInfo;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictPair {
    pub mod_a: String,
    pub mod_a_name: String,
    pub mod_b: String,
    pub mod_b_name: String,
    pub file_count: usize,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictReport {
    pub pairs: Vec<ConflictPair>,
    pub total_conflicts: usize,
}

const OVERRIDE_DIRS: &[&str] = &[
    "common",
    "events",
    "interface",
    "gfx",
    "localisation",
    "localization",
    "map",
    "prescripted_countries",
    "flags",
];

const IGNORE_EXTS: &[&str] = &["md", "txt", "log", "dds", "png", "jpg", "jpeg"];

fn collect_mod_files(mod_path: &Path) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for top in OVERRIDE_DIRS {
        let dir = mod_path.join(top);
        if !dir.is_dir() {
            continue;
        }
        for entry in WalkDir::new(&dir).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let p = entry.path();
            if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                if IGNORE_EXTS.contains(&ext.to_ascii_lowercase().as_str()) {
                    continue;
                }
            }
            if let Ok(rel) = p.strip_prefix(mod_path) {
                let s = rel.to_string_lossy().replace('\\', "/");
                out.push(s);
            }
        }
    }
    out
}

pub fn analyze(mods: &[ModInfo]) -> ConflictReport {
    let mut file_to_mods: HashMap<String, Vec<String>> = HashMap::new();

    for m in mods {
        if !m.enabled {
            continue;
        }
        let path = PathBuf::from(&m.path);
        if !path.exists() {
            continue;
        }
        for rel in collect_mod_files(&path) {
            file_to_mods.entry(rel).or_default().push(m.id.clone());
        }
    }

    let name_of: HashMap<String, String> = mods.iter().map(|m| (m.id.clone(), m.name.clone())).collect();

    let mut pair_files: HashMap<(String, String), Vec<String>> = HashMap::new();
    for (file, mod_list) in &file_to_mods {
        if mod_list.len() < 2 {
            continue;
        }
        for i in 0..mod_list.len() {
            for j in (i + 1)..mod_list.len() {
                let (a, b) = if mod_list[i] < mod_list[j] {
                    (mod_list[i].clone(), mod_list[j].clone())
                } else {
                    (mod_list[j].clone(), mod_list[i].clone())
                };
                pair_files.entry((a, b)).or_default().push(file.clone());
            }
        }
    }

    let mut pairs: Vec<ConflictPair> = pair_files
        .into_iter()
        .map(|((a, b), files)| ConflictPair {
            mod_a_name: name_of.get(&a).cloned().unwrap_or_else(|| a.clone()),
            mod_b_name: name_of.get(&b).cloned().unwrap_or_else(|| b.clone()),
            mod_a: a,
            mod_b: b,
            file_count: files.len(),
            files: {
                let mut f = files;
                f.sort();
                f.truncate(200);
                f
            },
        })
        .collect();

    pairs.sort_by(|a, b| b.file_count.cmp(&a.file_count));

    let total: usize = file_to_mods.values().filter(|v| v.len() >= 2).count();

    ConflictReport {
        pairs,
        total_conflicts: total,
    }
}
