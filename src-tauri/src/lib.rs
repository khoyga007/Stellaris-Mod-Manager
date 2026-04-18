mod auto_sort;
mod backups;
mod collections;
mod conflicts;
mod descriptor;
mod log_tail;
mod mods;
mod paths;
mod steamcmd;
mod updates;
mod workshop;

use paths::StellarisPaths;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex as TokioMutex;

static DOWNLOAD_LOCK: TokioMutex<()> = TokioMutex::const_new(());

struct AppState {
    paths: Mutex<StellarisPaths>,
    log_tailer: Mutex<Option<log_tail::LogTailer>>,
}

#[derive(Serialize, Clone)]
struct DownloadProgress {
    workshop_id: String,
    status: String,
    progress: u8,
    message: String,
}

#[tauri::command]
fn detect_paths(state: State<AppState>) -> Result<StellarisPaths, String> {
    let p = load_or_detect().map_err(|e| e.to_string())?;
    paths::ensure_dirs(&p).map_err(|e| e.to_string())?;
    *state.paths.lock().unwrap() = p.clone();
    Ok(p)
}

#[tauri::command]
fn set_user_dir(state: State<AppState>, path: String) -> Result<StellarisPaths, String> {
    let p = paths::from_user_dir(&PathBuf::from(&path));
    paths::ensure_dirs(&p).map_err(|e| e.to_string())?;
    save_user_dir(&path).map_err(|e| e.to_string())?;
    *state.paths.lock().unwrap() = p.clone();
    Ok(p)
}

#[tauri::command]
fn set_content_dir(state: State<AppState>, path: Option<String>) -> Result<StellarisPaths, String> {
    paths::save_content_dir(path.as_deref()).map_err(|e| e.to_string())?;
    let mut p = state.paths.lock().unwrap().clone();
    p.content_dir = path.filter(|s| !s.trim().is_empty());
    paths::ensure_dirs(&p).map_err(|e| e.to_string())?;
    *state.paths.lock().unwrap() = p.clone();
    Ok(p)
}

#[tauri::command]
fn migrate_content_dir(state: State<AppState>) -> Result<mods::MigrateReport, String> {
    let p = state.paths.lock().unwrap().clone();
    mods::migrate_content(&p).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_mods(state: State<AppState>) -> Result<Vec<mods::ModInfo>, String> {
    let p = state.paths.lock().unwrap().clone();
    mods::list(&p).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_mod_enabled(state: State<AppState>, id: String, enabled: bool) -> Result<(), String> {
    let p = state.paths.lock().unwrap().clone();
    mods::set_enabled(&p, &id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_all_mods_enabled(state: State<AppState>, enabled: bool) -> Result<(), String> {
    let p = state.paths.lock().unwrap().clone();
    mods::set_all_enabled(&p, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_load_order(state: State<AppState>, ids: Vec<String>) -> Result<(), String> {
    let p = state.paths.lock().unwrap().clone();
    mods::set_order(&p, &ids).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_enabled_set(state: State<AppState>, ids: Vec<String>) -> Result<(), String> {
    let p = state.paths.lock().unwrap().clone();
    mods::set_enabled_set(&p, &ids).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_mod(state: State<AppState>, id: String) -> Result<(), String> {
    let p = state.paths.lock().unwrap().clone();
    mods::delete_mod(&p, &id).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct LogPayload {
    path: String,
    content: String,
}

#[tauri::command]
fn read_stellaris_log(state: State<AppState>) -> Result<LogPayload, String> {
    let p = state.paths.lock().unwrap().clone();
    let log = p.log_path.clone().ok_or_else(|| "No log path".to_string())?;
    let path_buf = PathBuf::from(&log);
    let content = if path_buf.exists() {
        std::fs::read_to_string(&path_buf).unwrap_or_default()
    } else {
        String::new()
    };
    let tail: String = content
        .lines()
        .rev()
        .take(2000)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");
    Ok(LogPayload {
        path: log,
        content: tail,
    })
}

#[tauri::command]
fn start_log_tail(app: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    let p = state.paths.lock().unwrap().clone();
    let log = p.log_path.ok_or_else(|| "No log path".to_string())?;
    let mut guard = state.log_tailer.lock().unwrap();
    if let Some(t) = guard.as_ref() {
        t.stop();
    }
    let tailer = log_tail::LogTailer::new();
    tailer.start(app, PathBuf::from(&log));
    *guard = Some(tailer);
    Ok(())
}

#[tauri::command]
fn stop_log_tail(state: State<AppState>) -> Result<(), String> {
    let guard = state.log_tailer.lock().unwrap();
    if let Some(t) = guard.as_ref() {
        t.stop();
    }
    Ok(())
}

#[tauri::command]
fn get_stored_exe_path() -> Result<Option<String>, String> {
    let file = paths::config_dir().join("exe.txt");
    if !file.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&file)
        .map(|s| Some(s.trim().to_string()))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_stored_exe_path(path: String) -> Result<(), String> {
    let file = paths::config_dir().join("exe.txt");
    std::fs::write(&file, path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_game_version() -> Result<Option<String>, String> {
    if let Some(v) = paths::load_game_version() {
        return Ok(Some(v));
    }
    let exe_file = paths::config_dir().join("exe.txt");
    let exe = std::fs::read_to_string(&exe_file).ok().map(|s| s.trim().to_string());
    Ok(paths::detect_game_version(exe.as_deref()))
}

#[tauri::command]
fn set_game_version(version: Option<String>) -> Result<(), String> {
    paths::save_game_version(version.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn detect_game_version_cmd() -> Result<Option<String>, String> {
    let exe_file = paths::config_dir().join("exe.txt");
    let exe = std::fs::read_to_string(&exe_file).ok().map(|s| s.trim().to_string());
    Ok(paths::detect_game_version(exe.as_deref()))
}

#[tauri::command]
fn open_path_or_url(target: String) -> Result<(), String> {
    open::that_detached(&target).map_err(|e| format!("Failed to open {}: {}", target, e))
}

#[tauri::command]
fn list_dlc_backups() -> Result<Vec<backups::DlcBackup>, String> {
    backups::list().map_err(|e| e.to_string())
}

#[tauri::command]
fn restore_dlc_backup(state: State<AppState>, name: String) -> Result<(), String> {
    let paths = state.paths.lock().unwrap().clone();
    backups::restore(&name, std::path::Path::new(&paths.dlc_load_path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn launch_stellaris() -> Result<(), String> {
    let file = paths::config_dir().join("exe.txt");
    let exe = std::fs::read_to_string(&file)
        .map_err(|_| "Set Stellaris executable path in Settings first.".to_string())?
        .trim()
        .to_string();
    if exe.is_empty() {
        return Err("No executable configured".to_string());
    }
    let exe_path = PathBuf::from(&exe);
    let dir = exe_path.parent().map(|p| p.to_path_buf());
    std::thread::spawn(move || {
        let mut cmd = std::process::Command::new(&exe_path);
        if let Some(d) = dir {
            cmd.current_dir(d);
        }
        let _ = cmd.spawn();
    });
    Ok(())
}

#[tauri::command]
async fn install_from_zip(
    state: State<'_, AppState>,
    zip_path: String,
    workshop_id: Option<String>,
) -> Result<String, String> {
    let paths = state.paths.lock().unwrap().clone();
    let zip_path_buf = PathBuf::from(&zip_path);
    if !zip_path_buf.exists() {
        return Err("Zip file not found".to_string());
    }

    let staging = paths::config_dir()
        .join("staging")
        .join(format!("import_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;

    workshop::extract_zip_public(&zip_path_buf, &staging).map_err(|e| e.to_string())?;
    let inner = workshop::find_mod_root_public(&staging).map_err(|e| e.to_string())?;

    let id = workshop_id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            let name = zip_path_buf
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("imported")
                .to_string();
            let digits: String = name.chars().filter(|c| c.is_ascii_digit()).collect();
            if digits.is_empty() {
                format!("local_{}", std::process::id())
            } else {
                digits
            }
        });

    let inner_desc_path = inner.join("descriptor.mod");
    let desc = if inner_desc_path.exists() {
        let txt = std::fs::read_to_string(&inner_desc_path).unwrap_or_default();
        descriptor::parse(&txt)
    } else {
        descriptor::Descriptor::default()
    };

    let mod_id = mods::install_from_folder(&paths, &inner, &id, &desc).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&staging);
    Ok(mod_id)
}

#[tauri::command]
fn open_workshop_downloader(workshop_id: String) -> Result<(), String> {
    let url = format!(
        "https://steamworkshopdownloader.io/download/{}/{}",
        "281990", workshop_id
    );
    open::that(url).map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_collection(collection_id: String) -> Result<Vec<String>, String> {
    workshop::fetch_collection_items(&collection_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn download_workshop_mod(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workshop_id: String,
) -> Result<(), String> {
    let paths_cloned = state.paths.lock().unwrap().clone();
    let id = workshop_id.clone();
    let id_for_task = workshop_id.clone();

    let emit_queued = |app: &tauri::AppHandle, status: &str, pct: u8, msg: &str| {
        let _ = app.emit(
            "download-progress",
            DownloadProgress {
                workshop_id: id.clone(),
                status: status.to_string(),
                progress: pct,
                message: msg.to_string(),
            },
        );
    };

    emit_queued(&app, "queued", 0, "Queued");

    tauri::async_runtime::spawn(async move {
        let app_h = app.clone();
        let _guard = DOWNLOAD_LOCK.lock().await;
        let _ = app_h.emit(
            "download-progress",
            DownloadProgress {
                workshop_id: id_for_task.clone(),
                status: "downloading".to_string(),
                progress: 1,
                message: "Starting...".to_string(),
            },
        );
        let staging = paths::config_dir().join("staging");
        let _ = std::fs::create_dir_all(&staging);

        let progress_app = app_h.clone();
        let progress_id = id_for_task.clone();
        let result = workshop::download(&id_for_task, &staging, |pct, msg| {
            let _ = progress_app.emit(
                "download-progress",
                DownloadProgress {
                    workshop_id: progress_id.clone(),
                    status: "downloading".to_string(),
                    progress: pct,
                    message: msg.to_string(),
                },
            );
        })
        .await;

        match result {
            Ok(dl) => {
                let _ = app_h.emit(
                    "download-progress",
                    DownloadProgress {
                        workshop_id: id_for_task.clone(),
                        status: "installing".to_string(),
                        progress: 95,
                        message: "Installing mod...".to_string(),
                    },
                );
                match mods::install_from_folder(
                    &paths_cloned,
                    &dl.staging_folder,
                    &id_for_task,
                    &dl.descriptor,
                ) {
                    Ok(_) => {
                        let staging_root = paths::config_dir().join("staging");
                        if let Ok(rel) = dl.staging_folder.strip_prefix(&staging_root) {
                            if let Some(first) = rel.components().next() {
                                let top = staging_root.join(first.as_os_str());
                                let _ = std::fs::remove_dir_all(&top);
                            }
                        }
                        let _ = app_h.emit(
                            "download-progress",
                            DownloadProgress {
                                workshop_id: id_for_task.clone(),
                                status: "done".to_string(),
                                progress: 100,
                                message: "Installed".to_string(),
                            },
                        );
                    }
                    Err(e) => {
                        let _ = app_h.emit(
                            "download-progress",
                            DownloadProgress {
                                workshop_id: id_for_task.clone(),
                                status: "error".to_string(),
                                progress: 0,
                                message: format!("Install failed: {}", e),
                            },
                        );
                    }
                }
            }
            Err(e) => {
                let _ = app_h.emit(
                    "download-progress",
                    DownloadProgress {
                        workshop_id: id_for_task.clone(),
                        status: "error".to_string(),
                        progress: 0,
                        message: format!("{}", e),
                    },
                );
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn download_workshop_mods_batch(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<(), String> {
    let paths_cloned = state.paths.lock().unwrap().clone();

    let emit = |app: &tauri::AppHandle, id: &str, status: &str, pct: u8, msg: &str| {
        let _ = app.emit(
            "download-progress",
            DownloadProgress {
                workshop_id: id.to_string(),
                status: status.to_string(),
                progress: pct,
                message: msg.to_string(),
            },
        );
    };

    for id in &ids {
        emit(&app, id, "queued", 0, "Queued in batch");
    }

    tauri::async_runtime::spawn(async move {
        let app_h = app.clone();
        let _guard = DOWNLOAD_LOCK.lock().await;

        for id in &ids {
            emit(&app_h, id, "downloading", 5, "Batching via SteamCMD (1 session)...");
        }

        // Callback: live-parse SteamCMD output and emit per-mod status.
        let cb_app = app_h.clone();
        let cb_ids = ids.clone();
        let results = steamcmd::download_workshop_items_batch(&ids, move |ev| {
            match ev {
                steamcmd::BatchEvent::ItemDone(id) => {
                    emit(&cb_app, &id, "downloading", 80, "Downloaded, installing...");
                }
                steamcmd::BatchEvent::ItemFailed(id, reason) => {
                    emit(&cb_app, &id, "downloading", 50, &format!("SteamCMD: {}", truncate_msg(&reason, 140)));
                }
                steamcmd::BatchEvent::Line(line) => {
                    // Light progress pulse for the still-pending items so UI doesn't look frozen.
                    let l = line.to_lowercase();
                    if l.contains("downloading") || l.contains("update state") {
                        for id in &cb_ids {
                            emit(&cb_app, id, "downloading", 40, &truncate_msg(&line, 120));
                        }
                    }
                }
            }
        })
        .await;

        let results = match results {
            Ok(r) => r,
            Err(e) => {
                for id in &ids {
                    emit(&app_h, id, "error", 0, &format!("Batch SteamCMD failed: {}", e));
                }
                return;
            }
        };

        // Fetch metas once so mirror fallback + descriptor build don't each hit the API.
        let metas = workshop::fetch_metas(&ids).await.unwrap_or_default();
        let meta_map: std::collections::HashMap<String, workshop::WorkshopMeta> =
            metas.into_iter().collect();

        let mut failed_ids: Vec<String> = Vec::new();
        for id in &ids {
            match results.get(id) {
                Some(Ok(folder)) => {
                    emit(&app_h, id, "installing", 92, "Installing...");
                    let meta = meta_map.get(id).cloned().unwrap_or(workshop::WorkshopMeta {
                        title: format!("Workshop Mod {}", id),
                        description: None,
                        preview_url: None,
                        time_updated: None,
                        tags: Vec::new(),
                        file_size: None,
                    });
                    let descriptor = build_descriptor_from_folder(folder, &meta, id);
                    match mods::install_from_folder(&paths_cloned, folder, id, &descriptor) {
                        Ok(_) => emit(&app_h, id, "done", 100, "Installed"),
                        Err(e) => emit(&app_h, id, "error", 0, &format!("Install failed: {}", e)),
                    }
                }
                _ => {
                    failed_ids.push(id.clone());
                }
            }
        }

        // Fallback: for items SteamCMD couldn't fetch, run the solo path (which tries mirrors).
        if !failed_ids.is_empty() {
            for id in &failed_ids {
                emit(&app_h, id, "downloading", 20, "SteamCMD missed this one — trying web mirrors...");
            }
            let staging = paths::config_dir().join("staging");
            let _ = std::fs::create_dir_all(&staging);
            for id in &failed_ids {
                let prog_app = app_h.clone();
                let prog_id = id.clone();
                let res = workshop::download(id, &staging, move |pct, msg| {
                    emit(&prog_app, &prog_id, "downloading", pct, msg);
                })
                .await;
                match res {
                    Ok(dl) => {
                        emit(&app_h, id, "installing", 95, "Installing...");
                        match mods::install_from_folder(
                            &paths_cloned,
                            &dl.staging_folder,
                            id,
                            &dl.descriptor,
                        ) {
                            Ok(_) => {
                                let staging_root = paths::config_dir().join("staging");
                                if let Ok(rel) = dl.staging_folder.strip_prefix(&staging_root) {
                                    if let Some(first) = rel.components().next() {
                                        let top = staging_root.join(first.as_os_str());
                                        let _ = std::fs::remove_dir_all(&top);
                                    }
                                }
                                emit(&app_h, id, "done", 100, "Installed");
                            }
                            Err(e) => emit(&app_h, id, "error", 0, &format!("Install failed: {}", e)),
                        }
                    }
                    Err(e) => emit(&app_h, id, "error", 0, &format!("{}", e)),
                }
            }
        }
    });

    Ok(())
}

fn truncate_msg(s: &str, n: usize) -> String {
    if s.len() <= n {
        s.to_string()
    } else {
        format!("{}...", &s[..n])
    }
}

fn build_descriptor_from_folder(
    folder: &std::path::Path,
    meta: &workshop::WorkshopMeta,
    workshop_id: &str,
) -> descriptor::Descriptor {
    let inner = folder.join("descriptor.mod");
    let mut d = if inner.exists() {
        let txt = std::fs::read_to_string(&inner).unwrap_or_default();
        descriptor::parse(&txt)
    } else {
        descriptor::Descriptor::default()
    };
    if d.name.is_none() {
        d.name = Some(meta.title.clone());
    }
    if d.tags.is_empty() {
        d.tags = meta.tags.clone();
    }
    d.remote_file_id = Some(workshop_id.to_string());
    if d.supported_version.is_none() {
        d.supported_version = Some("4.*.*".to_string());
    }
    d
}

// ---------- Conflicts ----------
#[tauri::command]
fn analyze_conflicts(state: State<AppState>) -> Result<conflicts::ConflictReport, String> {
    let p = state.paths.lock().unwrap().clone();
    let ms = mods::list(&p).map_err(|e| e.to_string())?;
    Ok(conflicts::analyze(&ms))
}

// ---------- Auto-sort ----------
#[derive(Serialize)]
struct SortPreview {
    current: Vec<String>,
    suggested: Vec<String>,
}

#[tauri::command]
fn preview_auto_sort(state: State<AppState>) -> Result<SortPreview, String> {
    let p = state.paths.lock().unwrap().clone();
    let ms = mods::list(&p).map_err(|e| e.to_string())?;
    let current: Vec<String> = ms.iter().filter(|m| m.enabled).map(|m| m.id.clone()).collect();
    let suggested = auto_sort::sort_mods(&ms);
    Ok(SortPreview { current, suggested })
}

#[tauri::command]
fn apply_auto_sort(state: State<AppState>) -> Result<Vec<String>, String> {
    let p = state.paths.lock().unwrap().clone();
    let ms = mods::list(&p).map_err(|e| e.to_string())?;
    let suggested = auto_sort::sort_mods(&ms);
    mods::set_order(&p, &suggested).map_err(|e| e.to_string())?;
    Ok(suggested)
}

// ---------- Updates ----------
#[tauri::command]
async fn check_mod_updates(state: State<'_, AppState>) -> Result<Vec<updates::UpdateStatus>, String> {
    let p = state.paths.lock().unwrap().clone();
    let ms = mods::list(&p).map_err(|e| e.to_string())?;
    updates::check(&ms).await.map_err(|e| e.to_string())
}

// ---------- Collections / Presets ----------
#[tauri::command]
fn list_presets() -> Result<Vec<collections::Preset>, String> {
    Ok(collections::load().presets)
}

#[tauri::command]
fn create_preset(
    name: String,
    mod_ids: Vec<String>,
    note: Option<String>,
) -> Result<collections::Preset, String> {
    collections::create(&name, mod_ids, note).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_preset(
    id: String,
    name: Option<String>,
    mod_ids: Option<Vec<String>>,
    note: Option<String>,
) -> Result<(), String> {
    collections::update(&id, name, mod_ids, note).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_preset(id: String) -> Result<(), String> {
    collections::delete(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn apply_preset(state: State<AppState>, id: String) -> Result<(), String> {
    let store = collections::load();
    let preset = store
        .presets
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Preset not found".to_string())?;
    let p = state.paths.lock().unwrap().clone();
    let mut dlc = mods::read_dlc_load(std::path::Path::new(&p.dlc_load_path))
        .map_err(|e| e.to_string())?;
    dlc.enabled_mods = preset.mod_ids.clone();
    mods::write_dlc_load(std::path::Path::new(&p.dlc_load_path), &dlc)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_workshop_metas(ids: Vec<String>) -> Result<Vec<(String, workshop::WorkshopMeta)>, String> {
    workshop::fetch_metas(&ids).await.map_err(|e| e.to_string())
}

fn load_or_detect() -> anyhow::Result<StellarisPaths> {
    let file = paths::config_dir().join("user_dir.txt");
    if let Ok(s) = std::fs::read_to_string(&file) {
        let s = s.trim();
        if !s.is_empty() {
            return Ok(paths::from_user_dir(&PathBuf::from(s)));
        }
    }
    paths::detect()
}

fn save_user_dir(path: &str) -> anyhow::Result<()> {
    let file = paths::config_dir().join("user_dir.txt");
    std::fs::write(&file, path)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let paths = load_or_detect().unwrap_or_else(|_| {
                paths::from_user_dir(
                    &dirs::document_dir()
                        .unwrap_or_default()
                        .join("Paradox Interactive")
                        .join("Stellaris"),
                )
            });
            let _ = paths::ensure_dirs(&paths);
            app.manage(AppState {
                paths: Mutex::new(paths),
                log_tailer: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detect_paths,
            set_user_dir,
            list_mods,
            set_mod_enabled,
            set_all_mods_enabled,
            set_load_order,
            set_enabled_set,
            set_content_dir,
            migrate_content_dir,
            delete_mod,
            read_stellaris_log,
            start_log_tail,
            stop_log_tail,
            get_stored_exe_path,
            set_stored_exe_path,
            get_game_version,
            set_game_version,
            detect_game_version_cmd,
            open_path_or_url,
            list_dlc_backups,
            restore_dlc_backup,
            launch_stellaris,
            download_workshop_mod,
            install_from_zip,
            open_workshop_downloader,
            fetch_collection,
            analyze_conflicts,
            preview_auto_sort,
            apply_auto_sort,
            check_mod_updates,
            list_presets,
            create_preset,
            update_preset,
            delete_preset,
            apply_preset,
            fetch_workshop_metas,
            download_workshop_mods_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
