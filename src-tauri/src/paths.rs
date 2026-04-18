use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StellarisPaths {
    pub user_dir: String,
    pub mod_dir: String,
    pub dlc_load_path: String,
    pub game_data_path: Option<String>,
    pub log_path: Option<String>,
    /// Where mod *content* folders are stored. When None, content lives alongside
    /// descriptors inside `mod_dir`. Useful when the system drive is full.
    pub content_dir: Option<String>,
}

pub fn detect() -> Result<StellarisPaths> {
    let docs = dirs::document_dir().context("Could not locate user Documents directory")?;
    let user_dir = docs.join("Paradox Interactive").join("Stellaris");
    Ok(from_user_dir(&user_dir))
}

pub fn from_user_dir(user_dir: &Path) -> StellarisPaths {
    let mod_dir = user_dir.join("mod");
    let dlc_load_path = user_dir.join("dlc_load.json");
    let game_data_path = user_dir.join("game_data.json");
    let log_path = user_dir.join("logs").join("game.log");
    StellarisPaths {
        user_dir: user_dir.to_string_lossy().into_owned(),
        mod_dir: mod_dir.to_string_lossy().into_owned(),
        dlc_load_path: dlc_load_path.to_string_lossy().into_owned(),
        game_data_path: Some(game_data_path.to_string_lossy().into_owned()),
        log_path: Some(log_path.to_string_lossy().into_owned()),
        content_dir: load_content_dir(),
    }
}

pub fn ensure_dirs(p: &StellarisPaths) -> Result<()> {
    std::fs::create_dir_all(&p.mod_dir)?;
    if let Some(cd) = &p.content_dir {
        std::fs::create_dir_all(cd).ok();
    }
    if !Path::new(&p.dlc_load_path).exists() {
        let default = serde_json::json!({
            "disabled_dlcs": [],
            "enabled_mods": []
        });
        std::fs::write(&p.dlc_load_path, serde_json::to_string_pretty(&default)?)?;
    }
    Ok(())
}

fn content_dir_file() -> PathBuf {
    config_dir().join("content_dir.txt")
}

pub fn load_content_dir() -> Option<String> {
    let f = content_dir_file();
    if !f.exists() {
        return None;
    }
    std::fs::read_to_string(&f)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn game_version_file() -> PathBuf {
    config_dir().join("game_version.txt")
}

pub fn load_game_version() -> Option<String> {
    let f = game_version_file();
    std::fs::read_to_string(&f)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn save_game_version(v: Option<&str>) -> Result<()> {
    let f = game_version_file();
    match v {
        Some(s) if !s.trim().is_empty() => std::fs::write(&f, s.trim()).map_err(Into::into),
        _ => {
            let _ = std::fs::remove_file(&f);
            Ok(())
        }
    }
}

/// Try to read the installed Stellaris version from `launcher-settings.json`
/// (sits next to stellaris.exe). Returns something like "4.0.5" if found.
pub fn detect_game_version(exe_path: Option<&str>) -> Option<String> {
    let exe = exe_path.map(PathBuf::from)?;
    let dir = exe.parent()?;
    let candidates = [
        dir.join("launcher-settings.json"),
        dir.join("launcher").join("launcher-settings.json"),
        dir.join("launcher-installation.json"),
    ];
    for c in &candidates {
        if let Ok(txt) = std::fs::read_to_string(c) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&txt) {
                for key in &["rawVersion", "version", "gameVersion"] {
                    if let Some(s) = v.get(*key).and_then(|x| x.as_str()) {
                        return Some(s.trim_start_matches('v').to_string());
                    }
                }
            }
        }
    }
    None
}

pub fn save_content_dir(path: Option<&str>) -> Result<()> {
    let f = content_dir_file();
    match path {
        Some(p) if !p.trim().is_empty() => std::fs::write(&f, p.trim()).map_err(Into::into),
        _ => {
            let _ = std::fs::remove_file(&f);
            Ok(())
        }
    }
}

pub fn config_dir() -> PathBuf {
    let mut d = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    d.push("StellarisModManager");
    let _ = std::fs::create_dir_all(&d);
    d
}
