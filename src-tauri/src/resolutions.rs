use crate::paths;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

/// collection -> file -> identifier -> chosen_mod_id
pub type ResolutionStore = BTreeMap<String, BTreeMap<String, BTreeMap<String, String>>>;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SavedResolutions {
    #[serde(default)]
    pub store: ResolutionStore,
}

fn path() -> PathBuf {
    paths::config_dir().join("conflict_resolutions.json")
}

pub fn load() -> SavedResolutions {
    let p = path();
    if !p.exists() {
        return SavedResolutions::default();
    }
    fs::read_to_string(&p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(s: &SavedResolutions) -> Result<()> {
    let p = path();
    fs::write(&p, serde_json::to_string_pretty(s)?)
        .with_context(|| format!("write {}", p.display()))
}

pub fn get(collection: &str) -> BTreeMap<String, BTreeMap<String, String>> {
    load().store.get(collection).cloned().unwrap_or_default()
}

pub fn set_many(
    collection: &str,
    file: &str,
    picks: &BTreeMap<String, Option<String>>,
) -> Result<()> {
    let mut all = load();
    {
        let coll = all.store.entry(collection.to_string()).or_default();
        let file_map = coll.entry(file.to_string()).or_default();
        for (ident, mod_id) in picks {
            match mod_id {
                Some(id) => {
                    file_map.insert(ident.clone(), id.clone());
                }
                None => {
                    file_map.remove(ident);
                }
            }
        }
        if file_map.is_empty() {
            coll.remove(file);
        }
        if coll.is_empty() {
            all.store.remove(collection);
        }
    }
    save(&all)
}

pub fn set_entry(collection: &str, file: &str, ident: &str, mod_id: Option<&str>) -> Result<()> {
    let mut all = load();
    let coll = all.store.entry(collection.to_string()).or_default();
    let file_map = coll.entry(file.to_string()).or_default();
    match mod_id {
        Some(id) => {
            file_map.insert(ident.to_string(), id.to_string());
        }
        None => {
            file_map.remove(ident);
            if file_map.is_empty() {
                coll.remove(file);
            }
        }
    }
    if coll.is_empty() {
        all.store.remove(collection);
    }
    save(&all)
}
