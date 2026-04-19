use crate::conflicts::{self, ConflictKind, DeepConflictReport, FileConflict};
use crate::descriptor::{write_descriptor, Descriptor};
use crate::loc_parser::{self, LocFile};
use crate::mods::{self, ModInfo};
use crate::paths::StellarisPaths;
use crate::pdx_parser::{self, PdxFile, PdxValue};
use crate::resolutions;
use anyhow::{anyhow, Context, Result};

use crate::conflicts::{item_name, WRAPPER_KEYS};

/// (identifier, entry_type, body). identifier = extracted `name` or fallback.
type Entry = (String, String, PdxValue);

/// Flatten a parsed top-level map into entries. For any top key that is a
/// known wrapper (spriteTypes/guiTypes/...) we descend once and expand its
/// repeated children, using each child's `name` field as the identifier. The
/// identifier namespace is prefixed with the wrapper key so wrappers don't
/// collide with sibling non-wrapper top entries.
fn flatten_entries(top: BTreeMap<String, PdxValue>, wrapper_bucket: &mut Option<String>) -> Vec<Entry> {
    let mut out = Vec::new();
    for (k, v) in top {
        if WRAPPER_KEYS.contains(&k.as_str()) {
            if let PdxValue::Object(inner) = v {
                if wrapper_bucket.is_none() {
                    *wrapper_bucket = Some(k.clone());
                }
                for (entry_type, ev) in inner {
                    match ev {
                        PdxValue::Array(items) => {
                            for (i, it) in items.into_iter().enumerate() {
                                let name = item_name(&it)
                                    .unwrap_or_else(|| format!("{}#{}", entry_type, i));
                                let id = format!("{}::{}", k, name);
                                out.push((id, entry_type.clone(), it));
                            }
                        }
                        PdxValue::Object(_) => {
                            let name = item_name(&ev).unwrap_or_else(|| entry_type.clone());
                            let id = format!("{}::{}", k, name);
                            out.push((id, entry_type, ev));
                        }
                        other => {
                            let id = format!("{}::{}", k, entry_type);
                            out.push((id, entry_type, other));
                        }
                    }
                }
                continue;
            }
        }
        // Non-wrapper top entry: unpack Arrays (duplicate keys) into indexed ids.
        match v {
            PdxValue::Array(items) => {
                for (i, it) in items.into_iter().enumerate() {
                    out.push((format!("{}#{}", k, i), k.clone(), it));
                }
            }
            other => out.push((k.clone(), k, other)),
        }
    }
    out
}

fn group_to_map(pairs: Vec<(String, PdxValue)>) -> BTreeMap<String, PdxValue> {
    let mut grouped: BTreeMap<String, Vec<PdxValue>> = BTreeMap::new();
    let mut order: Vec<String> = Vec::new();
    for (et, body) in pairs {
        if !grouped.contains_key(&et) {
            order.push(et.clone());
        }
        grouped.entry(et).or_default().push(body);
    }
    let mut map: BTreeMap<String, PdxValue> = BTreeMap::new();
    for et in order {
        let v = grouped.remove(&et).unwrap();
        let value = if v.len() == 1 {
            v.into_iter().next().unwrap()
        } else {
            PdxValue::Array(v)
        };
        map.insert(et, value);
    }
    map
}

/// Rebuild PdxFile from flattened entries. Entries with id prefixed `wrapperKey::`
/// are re-nested under that wrapper; others go flat at top level.
fn entries_to_file(entries: Vec<Entry>) -> PdxFile {
    let mut flat_pairs: Vec<(String, PdxValue)> = Vec::new();
    let mut wrapped: BTreeMap<String, Vec<(String, PdxValue)>> = BTreeMap::new();
    let mut wrapper_order: Vec<String> = Vec::new();

    for (id, et, body) in entries {
        if let Some((wk, _)) = id.split_once("::") {
            if !wrapped.contains_key(wk) {
                wrapper_order.push(wk.to_string());
            }
            wrapped.entry(wk.to_string()).or_default().push((et, body));
        } else {
            flat_pairs.push((et, body));
        }
    }

    let mut top: BTreeMap<String, PdxValue> = group_to_map(flat_pairs);
    for wk in wrapper_order {
        let pairs = wrapped.remove(&wk).unwrap();
        top.insert(wk, PdxValue::Object(group_to_map(pairs)));
    }

    PdxFile { top_keys: top }
}
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatchGenReport {
    pub patch_id: String,
    pub patch_folder: String,
    pub files_written: Vec<String>,
    pub files_skipped: Vec<SkippedFile>,
    pub full_override_count: usize,
    pub partial_count: usize,
    pub mixed_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkippedFile {
    pub file: String,
    pub reason: String,
}

/// Winner = mod with HIGHEST load_order (Stellaris loads later mods on top,
/// so later-loaded wins). For our Partial/Mixed merge, shared keys resolve
/// to the winner automatically.
fn winner_id(mod_order: &BTreeMap<String, i32>, ids: &[String]) -> Option<String> {
    ids.iter()
        .max_by_key(|id| mod_order.get(id.as_str()).copied().unwrap_or(i32::MIN))
        .cloned()
}

fn build_resolved_file(
    fc: &FileConflict,
    mod_order: &BTreeMap<String, i32>,
    mod_paths: &BTreeMap<String, PathBuf>,
    resolutions: &BTreeMap<String, String>,
) -> Result<Option<PdxFile>> {
    match fc.kind {
        ConflictKind::Unknown | ConflictKind::FullOverride => return Ok(None),
        ConflictKind::Partial | ConflictKind::Mixed => {}
    }

    let ids: Vec<String> = fc.mods.iter().map(|m| m.mod_id.clone()).collect();
    let default_winner = winner_id(mod_order, &ids)
        .ok_or_else(|| anyhow!("no winner for {}", fc.file))?;

    let mut wrapper_bucket: Option<String> = None;

    let mut sorted_ids = ids.clone();
    sorted_ids.sort_by_key(|id| mod_order.get(id).copied().unwrap_or(i32::MIN));

    // Pass 1: collect per-mod entries keyed by identifier.
    // ident -> mod_id -> (entry_type, body)
    let mut by_ident: BTreeMap<String, BTreeMap<String, (String, PdxValue)>> = BTreeMap::new();
    let mut insertion_order: Vec<String> = Vec::new();

    for id in &sorted_ids {
        let mp = mod_paths.get(id).ok_or_else(|| anyhow!("no path {id}"))?;
        let full = mp.join(fc.file.replace('/', std::path::MAIN_SEPARATOR_STR).as_str());
        let parsed = pdx_parser::parse_file(&full)
            .with_context(|| format!("parse {}", full.display()))?;
        let entries = flatten_entries(parsed.top_keys, &mut wrapper_bucket);
        for (ident, entry_type, body) in entries {
            if !by_ident.contains_key(&ident) {
                insertion_order.push(ident.clone());
            }
            by_ident
                .entry(ident)
                .or_default()
                .insert(id.clone(), (entry_type, body));
        }
    }

    // Pass 2: for each identifier in insertion order, pick source mod.
    let mut ordered: Vec<Entry> = Vec::with_capacity(insertion_order.len());
    for ident in insertion_order {
        let versions = match by_ident.remove(&ident) {
            Some(v) => v,
            None => continue,
        };
        let lookup = ident.split_once("::").map(|(_, n)| n).unwrap_or(&ident);
        let chosen_id = resolutions
            .get(lookup)
            .cloned()
            .filter(|id| versions.contains_key(id))
            .or_else(|| {
                if versions.contains_key(&default_winner) {
                    Some(default_winner.clone())
                } else {
                    // Unique key — only one mod has it; take that one.
                    versions.keys().next().cloned()
                }
            });
        if let Some(cid) = chosen_id {
            if let Some((et, body)) = versions.get(&cid).cloned() {
                ordered.push((ident, et, body));
            }
        }
    }

    Ok(Some(entries_to_file(ordered)))
}

pub fn generate_patch(
    paths: &StellarisPaths,
    collection_name: &str,
) -> Result<PatchGenReport> {
    let mods_list = mods::list(paths)?;
    let enabled: Vec<ModInfo> = mods_list.into_iter().filter(|m| m.enabled).collect();
    if enabled.len() < 2 {
        return Err(anyhow!("need at least 2 enabled mods"));
    }

    let report: DeepConflictReport = conflicts::analyze_deep(&enabled);

    let mod_order: BTreeMap<String, i32> =
        enabled.iter().map(|m| (m.id.clone(), m.load_order)).collect();
    let mod_paths: BTreeMap<String, PathBuf> =
        enabled.iter().map(|m| (m.id.clone(), PathBuf::from(&m.path))).collect();

    let all_resolutions = resolutions::get(collection_name);
    let empty_res: BTreeMap<String, String> = BTreeMap::new();

    let slug = slugify(collection_name);
    let patch_id = format!("!!!_stellar_patch_{}", slug);
    let content_root = paths
        .content_dir
        .as_deref()
        .unwrap_or(&paths.mod_dir);
    let patch_folder = PathBuf::from(content_root).join(&patch_id);
    if patch_folder.exists() {
        fs::remove_dir_all(&patch_folder).ok();
    }
    fs::create_dir_all(&patch_folder)?;

    let mut files_written = Vec::new();
    let mut files_skipped = Vec::new();
    let mut full_c = 0;
    let mut part_c = 0;
    let mut mix_c = 0;

    for fc in &report.files {
        match fc.kind {
            ConflictKind::FullOverride => {
                full_c += 1;
                files_skipped.push(SkippedFile {
                    file: fc.file.clone(),
                    reason: "full override — game engine handles via load order".into(),
                });
                continue;
            }
            ConflictKind::Unknown => {
                files_skipped.push(SkippedFile {
                    file: fc.file.clone(),
                    reason: "parse failure".into(),
                });
                continue;
            }
            ConflictKind::Partial => part_c += 1,
            ConflictKind::Mixed => mix_c += 1,
        }

        let file_res = all_resolutions.get(&fc.file).unwrap_or(&empty_res);
        let is_loc = fc.file.to_ascii_lowercase().ends_with(".yml");
        let body = if is_loc {
            match build_resolved_loc(fc, &mod_order, &mod_paths, file_res) {
                Ok(Some(f)) => loc_parser::serialize(&f),
                Ok(None) => continue,
                Err(e) => {
                    files_skipped.push(SkippedFile {
                        file: fc.file.clone(),
                        reason: format!("resolve error: {e}"),
                    });
                    continue;
                }
            }
        } else {
            let resolved = match build_resolved_file(fc, &mod_order, &mod_paths, file_res) {
                Ok(Some(f)) => f,
                Ok(None) => continue,
                Err(e) => {
                    files_skipped.push(SkippedFile {
                        file: fc.file.clone(),
                        reason: format!("resolve error: {e}"),
                    });
                    continue;
                }
            };
            pdx_parser::serialize(&resolved)
        };

        let rel = fc.file.replace('/', std::path::MAIN_SEPARATOR_STR.to_string().as_str());
        let out_path = patch_folder.join(&rel);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let comment_prefix = if is_loc { "#" } else { "#" };
        let header = format!(
            "{cp} Auto-generated by Stellar Mod Manager patch for collection \"{name}\".\n\
             {cp} Merges {n} mods. Do not edit by hand — regenerate instead.\n\n",
            cp = comment_prefix,
            name = collection_name,
            n = fc.mods.len()
        );
        let content = if is_loc {
            // BOM required by Stellaris for non-English; always write BOM + header after lang line.
            // Simpler: put header AFTER language header line if present, else at top.
            insert_loc_header(&body, &header)
        } else {
            format!("{header}{body}")
        };
        if is_loc {
            let mut bytes = vec![0xEF, 0xBB, 0xBF];
            bytes.extend_from_slice(content.as_bytes());
            fs::write(&out_path, bytes)?;
        } else {
            fs::write(&out_path, content)?;
        }
        files_written.push(fc.file.clone());
    }

    let desc = Descriptor {
        name: Some(format!("!!! Stellar Patch — {}", collection_name)),
        version: Some("1.0.0".into()),
        supported_version: None,
        tags: vec!["Fixes".into(), "Utilities".into()],
        dependencies: enabled.iter().map(|m| m.name.clone()).collect(),
        picture: None,
        path: Some(patch_folder.to_string_lossy().into_owned()),
        archive: None,
        remote_file_id: None,
    };

    // Mod-folder descriptor.
    write_descriptor(&patch_folder.join("descriptor.mod"), &desc)?;

    // Launcher .mod file next to other mod descriptors so Stellaris sees it.
    let launcher_mod_path = PathBuf::from(&paths.mod_dir).join(format!("{patch_id}.mod"));
    let launcher_desc = Descriptor {
        path: Some(patch_folder.to_string_lossy().into_owned()),
        ..desc
    };
    write_descriptor(&launcher_mod_path, &launcher_desc)?;

    Ok(PatchGenReport {
        patch_id,
        patch_folder: patch_folder.to_string_lossy().into_owned(),
        files_written,
        files_skipped,
        full_override_count: full_c,
        partial_count: part_c,
        mixed_count: mix_c,
    })
}

fn build_resolved_loc(
    fc: &FileConflict,
    mod_order: &BTreeMap<String, i32>,
    mod_paths: &BTreeMap<String, PathBuf>,
    resolutions: &BTreeMap<String, String>,
) -> Result<Option<LocFile>> {
    match fc.kind {
        ConflictKind::Unknown | ConflictKind::FullOverride => return Ok(None),
        ConflictKind::Partial | ConflictKind::Mixed => {}
    }

    let ids: Vec<String> = fc.mods.iter().map(|m| m.mod_id.clone()).collect();
    let default_winner = winner_id(mod_order, &ids)
        .ok_or_else(|| anyhow!("no winner for {}", fc.file))?;

    let mut sorted_ids = ids.clone();
    sorted_ids.sort_by_key(|id| mod_order.get(id).copied().unwrap_or(i32::MIN));

    // key -> mod_id -> LocEntry
    let mut by_key: BTreeMap<String, BTreeMap<String, crate::loc_parser::LocEntry>> =
        BTreeMap::new();
    let mut language: Option<String> = None;

    for id in &sorted_ids {
        let mp = mod_paths.get(id).ok_or_else(|| anyhow!("no path {id}"))?;
        let full = mp.join(fc.file.replace('/', std::path::MAIN_SEPARATOR_STR).as_str());
        let parsed = loc_parser::parse_file(&full)
            .with_context(|| format!("parse {}", full.display()))?;
        if language.is_none() {
            language = parsed.language;
        }
        for (k, v) in parsed.entries {
            by_key.entry(k).or_default().insert(id.clone(), v);
        }
    }

    let mut out = LocFile {
        language,
        entries: BTreeMap::new(),
    };

    for (k, versions) in by_key {
        let chosen_id = resolutions
            .get(&k)
            .cloned()
            .filter(|id| versions.contains_key(id))
            .or_else(|| {
                if versions.contains_key(&default_winner) {
                    Some(default_winner.clone())
                } else {
                    versions.keys().next().cloned()
                }
            });
        if let Some(cid) = chosen_id {
            if let Some(v) = versions.get(&cid).cloned() {
                out.entries.insert(k, v);
            }
        }
    }

    Ok(Some(out))
}

fn insert_loc_header(body: &str, header: &str) -> String {
    // Body starts with `l_english:\n`. Insert header right after it so game still sees
    // language on line 1.
    if let Some(nl) = body.find('\n') {
        let (first, rest) = body.split_at(nl + 1);
        format!("{first}{header}{rest}")
    } else {
        format!("{header}{body}")
    }
}

pub fn get_file_entries(
    paths: &StellarisPaths,
    file: &str,
    mod_id: &str,
) -> Result<BTreeMap<String, String>> {
    let mods_list = mods::list(paths)?;
    let m = mods_list
        .iter()
        .find(|x| x.id == mod_id)
        .ok_or_else(|| anyhow!("mod not found: {mod_id}"))?;
    let full = PathBuf::from(&m.path)
        .join(file.replace('/', std::path::MAIN_SEPARATOR_STR).as_str());

    let is_loc = file.to_ascii_lowercase().ends_with(".yml");
    let mut out: BTreeMap<String, String> = BTreeMap::new();

    if is_loc {
        let parsed = loc_parser::parse_file(&full)
            .with_context(|| format!("parse {}", full.display()))?;
        for (k, v) in parsed.entries {
            let ver = v.version.map(|n| n.to_string()).unwrap_or_default();
            out.insert(k.clone(), format!(" {}:{} \"{}\"", k, ver, v.value));
        }
    } else {
        let parsed = pdx_parser::parse_file(&full)
            .with_context(|| format!("parse {}", full.display()))?;
        let mut wb: Option<String> = None;
        let entries = flatten_entries(parsed.top_keys, &mut wb);
        for (ident, entry_type, body) in entries {
            let lookup = ident.split_once("::").map(|(_, n)| n.to_string()).unwrap_or(ident);
            out.insert(lookup, pdx_parser::serialize_entry(&entry_type, &body));
        }
    }
    Ok(out)
}

fn slugify(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}
