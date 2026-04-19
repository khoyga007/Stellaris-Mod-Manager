use crate::loc_parser;
use crate::mods::ModInfo;
use crate::pdx_parser::{self, PdxValue};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ConflictKind {
    /// Same file, same top-level keys — last loaded wins entirely.
    FullOverride,
    /// Same file, disjoint top-level keys — safe to merge.
    Partial,
    /// Same file, some keys overlap + some unique — merge possible with resolution.
    Mixed,
    /// Could not parse one or both mods' file.
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModKeys {
    pub mod_id: String,
    pub mod_name: String,
    pub keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileConflict {
    pub file: String,
    pub kind: ConflictKind,
    pub mods: Vec<ModKeys>,
    pub shared_keys: Vec<String>,
    pub unique_keys_total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepConflictReport {
    pub files: Vec<FileConflict>,
    pub total_files: usize,
    pub full_override_count: usize,
    pub partial_count: usize,
    pub mixed_count: usize,
    pub unknown_count: usize,
}

fn is_pdx_script(file: &str) -> bool {
    let lower = file.to_ascii_lowercase();
    if !lower.ends_with(".txt") && !lower.ends_with(".gui") && !lower.ends_with(".gfx") {
        return false;
    }
    lower.starts_with("common/")
        || lower.starts_with("events/")
        || lower.starts_with("interface/")
        || lower.starts_with("gfx/")
        || lower.starts_with("map/")
        || lower.starts_with("prescripted_countries/")
}

fn is_localization(file: &str) -> bool {
    let lower = file.to_ascii_lowercase();
    lower.ends_with(".yml")
        && (lower.starts_with("localisation/") || lower.starts_with("localization/"))
}

/// Wrapper-style files (.gfx, .gui) have a single top-level container key.
/// Stellaris merges by entry identifier (usually the `name` field inside each
/// repeated entry block), not by the container name.
pub(crate) const WRAPPER_KEYS: &[&str] = &[
    "spriteTypes",
    "guiTypes",
    "bitmapfonts",
    "objectTypes",
    "lightTypes",
    "fonts",
];

/// Extract the `name = "..."` field inside an Object entry, if any.
pub(crate) fn item_name(v: &PdxValue) -> Option<String> {
    if let PdxValue::Object(m) = v {
        if let Some(PdxValue::Scalar(s)) = m.get("name") {
            return Some(s.clone());
        }
    }
    None
}

/// Expand a map of (entry_type -> value|Array) into (identifier -> entry).
/// Used for wrapper-file children where `spriteType = { name="X" }` repeats.
pub(crate) fn expand_named(
    inner: &std::collections::BTreeMap<String, PdxValue>,
) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    for (k, v) in inner {
        match v {
            PdxValue::Array(items) => {
                for (i, item) in items.iter().enumerate() {
                    out.insert(item_name(item).unwrap_or_else(|| format!("{}#{}", k, i)));
                }
            }
            PdxValue::Object(_) => {
                out.insert(item_name(v).unwrap_or_else(|| k.clone()));
            }
            _ => {
                out.insert(k.clone());
            }
        }
    }
    out
}

fn effective_keys(top: &std::collections::BTreeMap<String, PdxValue>) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    for (k, v) in top {
        if WRAPPER_KEYS.contains(&k.as_str()) {
            if let PdxValue::Object(inner) = v {
                out.extend(expand_named(inner));
                continue;
            }
        }
        out.insert(k.clone());
    }
    out
}

fn read_top_keys(mod_path: &Path, rel: &str) -> Option<BTreeSet<String>> {
    let full = mod_path.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
    if is_localization(rel) {
        let f = loc_parser::parse_file(&full).ok()?;
        return Some(f.entries.keys().cloned().collect());
    }
    let file = pdx_parser::parse_file(&full).ok()?;
    Some(effective_keys(&file.top_keys))
}

pub fn analyze_deep(mods: &[ModInfo]) -> DeepConflictReport {
    let mut file_to_mods: HashMap<String, Vec<String>> = HashMap::new();
    let mut path_of: HashMap<String, PathBuf> = HashMap::new();

    for m in mods {
        if !m.enabled {
            continue;
        }
        let path = PathBuf::from(&m.path);
        if !path.exists() {
            continue;
        }
        path_of.insert(m.id.clone(), path.clone());
        for rel in collect_mod_files(&path) {
            file_to_mods.entry(rel).or_default().push(m.id.clone());
        }
    }

    let name_of: HashMap<String, String> =
        mods.iter().map(|m| (m.id.clone(), m.name.clone())).collect();

    let mut files: Vec<FileConflict> = Vec::new();
    let mut full_c = 0;
    let mut part_c = 0;
    let mut mix_c = 0;
    let mut unk_c = 0;

    for (file, mod_list) in &file_to_mods {
        if mod_list.len() < 2 {
            continue;
        }
        if !is_pdx_script(file) && !is_localization(file) {
            continue;
        }

        let mut per_mod: Vec<(String, BTreeSet<String>)> = Vec::new();
        let mut parse_failed = false;
        for mid in mod_list {
            let mp = match path_of.get(mid) {
                Some(p) => p,
                None => continue,
            };
            match read_top_keys(mp, file) {
                Some(k) => per_mod.push((mid.clone(), k)),
                None => {
                    parse_failed = true;
                    break;
                }
            }
        }

        let kind;
        let shared: BTreeSet<String>;
        let unique_total: usize;

        if parse_failed || per_mod.len() < 2 {
            kind = ConflictKind::Unknown;
            shared = BTreeSet::new();
            unique_total = 0;
            unk_c += 1;
        } else {
            let mut iter = per_mod.iter();
            let first = iter.next().unwrap().1.clone();
            let intersection = iter.fold(first, |acc, (_, k)| acc.intersection(k).cloned().collect());
            let union: BTreeSet<String> = per_mod
                .iter()
                .flat_map(|(_, k)| k.iter().cloned())
                .collect();
            shared = intersection;
            unique_total = union.len() - shared.len();

            kind = if shared.is_empty() {
                part_c += 1;
                ConflictKind::Partial
            } else if unique_total == 0 {
                full_c += 1;
                ConflictKind::FullOverride
            } else {
                mix_c += 1;
                ConflictKind::Mixed
            };
        }

        let mods_out: Vec<ModKeys> = per_mod
            .into_iter()
            .map(|(id, keys)| ModKeys {
                mod_name: name_of.get(&id).cloned().unwrap_or_else(|| id.clone()),
                mod_id: id,
                keys: keys.into_iter().collect(),
            })
            .collect();

        files.push(FileConflict {
            file: file.clone(),
            kind,
            mods: mods_out,
            shared_keys: shared.into_iter().collect(),
            unique_keys_total: unique_total,
        });
    }

    files.sort_by(|a, b| b.shared_keys.len().cmp(&a.shared_keys.len()));

    let total = files.len();
    DeepConflictReport {
        files,
        total_files: total,
        full_override_count: full_c,
        partial_count: part_c,
        mixed_count: mix_c,
        unknown_count: unk_c,
    }
}
