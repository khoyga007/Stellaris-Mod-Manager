use crate::descriptor::{self, Descriptor};
use crate::paths::StellarisPaths;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModInfo {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub supported_version: Option<String>,
    pub tags: Vec<String>,
    pub dependencies: Vec<String>,
    pub picture: Option<String>,
    pub path: String,
    pub descriptor_path: String,
    pub remote_file_id: Option<String>,
    pub enabled: bool,
    pub load_order: i32,
    pub size_bytes: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct DlcLoad {
    #[serde(default)]
    pub disabled_dlcs: Vec<String>,
    #[serde(default)]
    pub enabled_mods: Vec<String>,
}

pub fn read_dlc_load(path: &Path) -> Result<DlcLoad> {
    if !path.exists() {
        return Ok(DlcLoad::default());
    }
    let txt = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&txt).unwrap_or_default())
}

pub fn write_dlc_load(path: &Path, d: &DlcLoad) -> Result<()> {
    let _ = crate::backups::snapshot(path);
    let txt = serde_json::to_string_pretty(d)?;
    fs::write(path, txt)?;
    Ok(())
}

pub fn list(paths: &StellarisPaths) -> Result<Vec<ModInfo>> {
    let mod_dir = Path::new(&paths.mod_dir);
    if !mod_dir.exists() {
        return Ok(vec![]);
    }

    let dlc = read_dlc_load(Path::new(&paths.dlc_load_path)).unwrap_or_default();

    let mut out: Vec<ModInfo> = Vec::new();
    for entry in fs::read_dir(mod_dir)? {
        let entry = entry?;
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("mod") {
            continue;
        }
        if let Ok(info) = load_mod(&p, &dlc) {
            out.push(info);
        }
    }

    for (i, id) in dlc.enabled_mods.iter().enumerate() {
        if let Some(m) = out.iter_mut().find(|m| m.id == *id) {
            m.load_order = i as i32;
        }
    }
    let base = dlc.enabled_mods.len() as i32;
    let mut k = 0;
    for m in out.iter_mut() {
        if !dlc.enabled_mods.contains(&m.id) {
            m.load_order = base + k;
            k += 1;
        }
    }

    out.sort_by_key(|m| m.load_order);
    Ok(out)
}

fn load_mod(desc_file: &Path, dlc: &DlcLoad) -> Result<ModInfo> {
    let txt = fs::read_to_string(desc_file)?;
    let d = descriptor::parse(&txt);

    let id = format!("mod/{}", desc_file.file_name().unwrap().to_string_lossy());
    let enabled = dlc.enabled_mods.iter().any(|m| m == &id);

    let mod_path = match &d.path {
        Some(p) => PathBuf::from(p),
        None => desc_file
            .parent()
            .unwrap()
            .join(desc_file.file_stem().unwrap()),
    };

    let size_bytes = if mod_path.exists() {
        dir_size(&mod_path)
    } else {
        0
    };

    let picture = d
        .picture
        .as_ref()
        .map(|p| mod_path.join(p))
        .filter(|p| p.exists())
        .and_then(|p| {
            fs::read(&p).ok().map(|b| {
                let ext = p
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("png")
                    .to_lowercase();
                use base64::Engine as _;
                let b64 = base64::engine::general_purpose::STANDARD.encode(&b);
                format!("data:image/{};base64,{}", ext, b64)
            })
        });

    let name = d
        .name
        .clone()
        .unwrap_or_else(|| desc_file.file_stem().unwrap().to_string_lossy().into_owned());

    Ok(ModInfo {
        id,
        name,
        version: d.version.clone(),
        supported_version: d.supported_version.clone(),
        tags: d.tags.clone(),
        dependencies: d.dependencies.clone(),
        picture,
        path: mod_path.to_string_lossy().into_owned(),
        descriptor_path: desc_file.to_string_lossy().into_owned(),
        remote_file_id: d.remote_file_id.clone(),
        enabled,
        load_order: i32::MAX,
        size_bytes,
    })
}

fn dir_size(p: &Path) -> u64 {
    WalkDir::new(p)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

pub fn set_enabled(paths: &StellarisPaths, id: &str, enabled: bool) -> Result<()> {
    let mut d = read_dlc_load(Path::new(&paths.dlc_load_path))?;
    d.enabled_mods.retain(|m| m != id);
    if enabled {
        d.enabled_mods.push(id.to_string());
    }
    write_dlc_load(Path::new(&paths.dlc_load_path), &d)
}

pub fn set_all_enabled(paths: &StellarisPaths, enabled: bool) -> Result<()> {
    let mods = list(paths)?;
    let mut d = read_dlc_load(Path::new(&paths.dlc_load_path))?;
    if enabled {
        d.enabled_mods = mods.iter().map(|m| m.id.clone()).collect();
    } else {
        d.enabled_mods.clear();
    }
    write_dlc_load(Path::new(&paths.dlc_load_path), &d)
}

pub fn set_enabled_set(paths: &StellarisPaths, ids: &[String]) -> Result<()> {
    let mut d = read_dlc_load(Path::new(&paths.dlc_load_path))?;
    let mut seen = std::collections::HashSet::new();
    let ordered: Vec<String> = ids
        .iter()
        .filter(|id| seen.insert((*id).clone()))
        .cloned()
        .collect();
    d.enabled_mods = ordered;
    write_dlc_load(Path::new(&paths.dlc_load_path), &d)
}

pub fn set_order(paths: &StellarisPaths, ids: &[String]) -> Result<()> {
    let mut d = read_dlc_load(Path::new(&paths.dlc_load_path))?;
    let enabled: std::collections::HashSet<_> = d.enabled_mods.iter().cloned().collect();
    let mut new_order: Vec<String> = ids.iter().filter(|id| enabled.contains(*id)).cloned().collect();
    for id in d.enabled_mods.iter() {
        if !new_order.contains(id) {
            new_order.push(id.clone());
        }
    }
    d.enabled_mods = new_order;
    write_dlc_load(Path::new(&paths.dlc_load_path), &d)
}

#[derive(Debug, Default, serde::Serialize)]
pub struct MigrateReport {
    pub moved: u32,
    pub skipped: u32,
    pub failed: Vec<String>,
    pub details: Vec<String>,
}

pub fn migrate_content(paths: &StellarisPaths) -> Result<MigrateReport> {
    let target = match paths.content_dir.as_deref() {
        Some(p) if !p.is_empty() => Path::new(p),
        _ => return Ok(MigrateReport::default()),
    };
    fs::create_dir_all(target)?;

    let target_canon = fs::canonicalize(target).unwrap_or_else(|_| target.to_path_buf());
    let mut report = MigrateReport::default();

    let mod_list = list(paths)?;
    for m in &mod_list {
        let current = Path::new(&m.path);
        if m.path.trim().is_empty() {
            report.skipped += 1;
            report.details.push(format!("{}: descriptor has no path field", m.name));
            continue;
        }
        if !current.exists() {
            report.skipped += 1;
            report.details.push(format!("{}: folder does not exist ({})", m.name, m.path));
            continue;
        }
        let current_canon = fs::canonicalize(current).unwrap_or_else(|_| current.to_path_buf());
        if current_canon.starts_with(&target_canon) {
            report.skipped += 1;
            report.details.push(format!("{}: already in target directory", m.name));
            continue;
        }
        let folder_name = match current.file_name() {
            Some(n) => n.to_os_string(),
            None => {
                report.failed.push(format!("{}: no folder name", m.name));
                continue;
            }
        };
        let dest = target.join(&folder_name);
        if dest.exists() {
            let _ = fs::remove_dir_all(&dest);
        }
        if let Err(e) = move_dir(current, &dest) {
            report.failed.push(format!("{}: {}", m.name, e));
            continue;
        }

        let desc_path = Path::new(&m.descriptor_path);
        if let Ok(txt) = fs::read_to_string(desc_path) {
            let mut d = descriptor::parse(&txt);
            d.path = Some(dest.to_string_lossy().into_owned());
            let _ = descriptor::write_descriptor(desc_path, &d);
        }
        let inner_desc = dest.join("descriptor.mod");
        if inner_desc.exists() {
            if let Ok(txt) = fs::read_to_string(&inner_desc) {
                let mut d = descriptor::parse(&txt);
                d.path = None;
                let _ = descriptor::write_descriptor(&inner_desc, &d);
            }
        }
        report.moved += 1;
        report.details.push(format!("{}: moved to {}", m.name, dest.display()));
    }

    Ok(report)
}

fn move_dir(src: &Path, dst: &Path) -> Result<()> {
    if fs::rename(src, dst).is_ok() {
        return Ok(());
    }
    // Cross-device: copy then delete
    fs::create_dir_all(dst)?;
    copy_dir_recursive(src, dst)?;
    fs::remove_dir_all(src)?;
    Ok(())
}

pub fn delete_mod(paths: &StellarisPaths, id: &str) -> Result<()> {
    let mods = list(paths)?;
    let target = mods.iter().find(|m| m.id == id).context("Mod not found")?;

    let folder = Path::new(&target.path);
    if folder.exists() {
        fs::remove_dir_all(folder).ok();
    }
    let desc = Path::new(&target.descriptor_path);
    if desc.exists() {
        fs::remove_file(desc).ok();
    }

    let mut d = read_dlc_load(Path::new(&paths.dlc_load_path))?;
    d.enabled_mods.retain(|m| m != id);
    write_dlc_load(Path::new(&paths.dlc_load_path), &d)?;
    Ok(())
}

pub fn install_from_folder(
    paths: &StellarisPaths,
    source_folder: &Path,
    workshop_id: &str,
    descriptor: &Descriptor,
) -> Result<String> {
    let mod_dir = Path::new(&paths.mod_dir);
    fs::create_dir_all(mod_dir)?;

    let content_root = paths
        .content_dir
        .as_deref()
        .map(Path::new)
        .unwrap_or(mod_dir);
    fs::create_dir_all(content_root)?;

    let dest_folder = content_root.join(format!("ugc_{}", workshop_id));
    if dest_folder.exists() {
        fs::remove_dir_all(&dest_folder)?;
    }
    fs::create_dir_all(&dest_folder)?;

    copy_dir_recursive(source_folder, &dest_folder)?;

    let mut desc = descriptor.clone();
    desc.path = Some(dest_folder.to_string_lossy().into_owned());
    desc.remote_file_id = Some(workshop_id.to_string());

    let desc_filename = format!("ugc_{}.mod", workshop_id);
    let desc_path = mod_dir.join(&desc_filename);
    descriptor::write_descriptor(&desc_path, &desc)?;

    let inner_desc = dest_folder.join("descriptor.mod");
    let mut inner = desc.clone();
    inner.path = None;
    descriptor::write_descriptor(&inner_desc, &inner)?;

    Ok(format!("mod/{}", desc_filename))
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &dest)?;
        } else {
            fs::copy(&path, &dest)?;
        }
    }
    Ok(())
}

