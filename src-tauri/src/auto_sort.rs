use crate::mods::ModInfo;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Bucket {
    AuthorTop,         // name starts with ~ — author wants load-first
    Framework,         // load FIRST so dependents can extend
    TotalConversion,
    Overhaul,
    Gameplay,
    Events,
    Species,
    Graphics,
    Sound,
    Balance,
    Fixes,
    UIBottom,
    Patch,             // overrides the things it patches
    AuthorOverride,    // name starts with ! — author wants last-word override
    ForceBottom,       // name starts with zz_ — explicit load-last
}

impl Bucket {
    fn order(self) -> i32 {
        match self {
            Bucket::AuthorTop => -10,
            Bucket::Framework => 0,
            Bucket::TotalConversion => 10,
            Bucket::Overhaul => 20,
            Bucket::Gameplay => 40,
            Bucket::Events => 50,
            Bucket::Species => 60,
            Bucket::Graphics => 70,
            Bucket::Sound => 80,
            Bucket::Balance => 85,
            Bucket::Fixes => 90,
            Bucket::UIBottom => 93,
            Bucket::Patch => 95,
            Bucket::AuthorOverride => 97,
            Bucket::ForceBottom => 100,
        }
    }
}

fn classify(m: &ModInfo) -> Bucket {
    let name_lower = m.name.to_lowercase();
    let trimmed = name_lower.trim_start();

    if trimmed.starts_with('~') {
        return Bucket::AuthorTop;
    }
    if trimmed.starts_with('!') {
        return Bucket::AuthorOverride;
    }
    if trimmed.starts_with("zz_") || trimmed.starts_with("zz ") || trimmed.starts_with("z_") {
        return Bucket::ForceBottom;
    }

    // UI frameworks that other UI mods depend on — load EARLY so dependents can extend
    let ui_framework_markers = [
        "ui overhaul dynamic",
        "ui overhaul 1080p",
        "ui overhaul 1440p",
        "ui overhaul 4k",
        "tiny outliner",
    ];
    if ui_framework_markers.iter().any(|k| name_lower.contains(k)) {
        return Bucket::Framework;
    }

    // Patch/compatibility detection by name
    let patch_markers = ["patch", "compat", "compatibility", "for ", "fix for", "addon for"];
    if patch_markers.iter().any(|k| name_lower.contains(k)) {
        return Bucket::Patch;
    }

    let tags_lower: Vec<String> = m.tags.iter().map(|t| t.to_lowercase()).collect();
    let has_tag = |needle: &str| tags_lower.iter().any(|t| t.contains(needle));

    if has_tag("total conversion") {
        return Bucket::TotalConversion;
    }
    if has_tag("overhaul") {
        return Bucket::Overhaul;
    }
    if has_tag("utilities") || has_tag("framework") || has_tag("library") {
        return Bucket::Framework;
    }
    if has_tag("ui") || has_tag("user interface") {
        return Bucket::UIBottom;
    }
    if has_tag("fixes") || has_tag("bug") {
        return Bucket::Fixes;
    }
    if has_tag("balance") {
        return Bucket::Balance;
    }
    if has_tag("graphics") || has_tag("sprite") {
        return Bucket::Graphics;
    }
    if has_tag("sound") || has_tag("music") {
        return Bucket::Sound;
    }
    if has_tag("events") || has_tag("story") {
        return Bucket::Events;
    }
    if has_tag("species") || has_tag("portraits") {
        return Bucket::Species;
    }
    if has_tag("gameplay") || has_tag("economy") || has_tag("warfare") || has_tag("technologies") {
        return Bucket::Gameplay;
    }

    Bucket::Gameplay
}

pub fn sort_mods(mods: &[ModInfo]) -> Vec<String> {
    let enabled: Vec<&ModInfo> = mods.iter().filter(|m| m.enabled).collect();

    // Build name→id index for dep resolution (case-insensitive, trimmed).
    let name_to_id: HashMap<String, String> = enabled
        .iter()
        .map(|m| (normalize_name(&m.name), m.id.clone()))
        .collect();

    // DAG: edge dep → mod (dep must load before mod).
    let mut deps: HashMap<String, Vec<String>> = HashMap::new();
    let mut in_degree: HashMap<String, usize> = enabled.iter().map(|m| (m.id.clone(), 0)).collect();

    for m in &enabled {
        for dep_name in &m.dependencies {
            let key = normalize_name(dep_name);
            if let Some(dep_id) = name_to_id.get(&key) {
                if dep_id == &m.id {
                    continue;
                }
                deps.entry(dep_id.clone()).or_default().push(m.id.clone());
                *in_degree.entry(m.id.clone()).or_insert(0) += 1;
            }
        }
    }

    let bucket_of: HashMap<String, Bucket> =
        enabled.iter().map(|m| (m.id.clone(), classify(m))).collect();
    let name_of: HashMap<String, String> =
        enabled.iter().map(|m| (m.id.clone(), m.name.to_lowercase())).collect();

    // Kahn's algorithm; among in-degree-0 nodes, pick lowest bucket order then name.
    let mut ready: Vec<String> = in_degree
        .iter()
        .filter(|(_, &d)| d == 0)
        .map(|(id, _)| id.clone())
        .collect();
    let mut ids: Vec<String> = Vec::with_capacity(enabled.len());

    while !ready.is_empty() {
        ready.sort_by(|a, b| {
            let ba = bucket_of.get(a).copied().unwrap_or(Bucket::Gameplay).order();
            let bb = bucket_of.get(b).copied().unwrap_or(Bucket::Gameplay).order();
            ba.cmp(&bb).then_with(|| {
                name_of
                    .get(a)
                    .cloned()
                    .unwrap_or_default()
                    .cmp(&name_of.get(b).cloned().unwrap_or_default())
            })
        });
        let pick = ready.remove(0);
        if let Some(children) = deps.get(&pick) {
            for child in children {
                if let Some(d) = in_degree.get_mut(child) {
                    if *d > 0 {
                        *d -= 1;
                        if *d == 0 {
                            ready.push(child.clone());
                        }
                    }
                }
            }
        }
        ids.push(pick);
    }

    // Cycle fallback: append any leftover mods sorted by bucket.
    if ids.len() < enabled.len() {
        let included: HashSet<String> = ids.iter().cloned().collect();
        let mut leftover: Vec<&&ModInfo> =
            enabled.iter().filter(|m| !included.contains(&m.id)).collect();
        leftover.sort_by(|a, b| {
            let ba = bucket_of.get(&a.id).copied().unwrap_or(Bucket::Gameplay).order();
            let bb = bucket_of.get(&b.id).copied().unwrap_or(Bucket::Gameplay).order();
            ba.cmp(&bb)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        for m in leftover {
            ids.push(m.id.clone());
        }
    }

    apply_patch_dependencies(&mut ids, &enabled);

    ids
}

fn normalize_name(s: &str) -> String {
    s.trim().trim_start_matches(['~', '!']).trim().to_lowercase()
}

fn apply_patch_dependencies(ids: &mut Vec<String>, enabled: &[&ModInfo]) {
    let id_to_mod: HashMap<String, &ModInfo> = enabled.iter().map(|m| (m.id.clone(), *m)).collect();

    let patch_markers = ["patch", "compat", "compatibility", "for ", "addon for"];
    let name_tokens: HashMap<String, Vec<String>> = enabled
        .iter()
        .map(|m| {
            let toks: Vec<String> = m
                .name
                .to_lowercase()
                .split(|c: char| !c.is_alphanumeric())
                .filter(|s| s.len() > 3)
                .map(String::from)
                .collect();
            (m.id.clone(), toks)
        })
        .collect();

    let n = ids.len();
    let mut moves: Vec<(usize, usize)> = Vec::new();

    for i in 0..n {
        let pid = ids[i].clone();
        let Some(pm) = id_to_mod.get(&pid) else { continue };
        let pname = pm.name.to_lowercase();
        if !patch_markers.iter().any(|k| pname.contains(k)) {
            continue;
        }
        let ptoks: HashSet<&String> = name_tokens.get(&pid).map(|v| v.iter().collect()).unwrap_or_default();

        let mut best_target: Option<usize> = None;
        let mut best_score = 0usize;
        for j in 0..n {
            if i == j {
                continue;
            }
            let bid = &ids[j];
            let Some(bm) = id_to_mod.get(bid) else { continue };
            let bname_lower = bm.name.to_lowercase();
            if patch_markers.iter().any(|k| bname_lower.contains(k)) {
                continue;
            }
            let btoks: HashSet<&String> = name_tokens.get(bid).map(|v| v.iter().collect()).unwrap_or_default();
            let overlap = ptoks.intersection(&btoks).count();
            if overlap > best_score {
                best_score = overlap;
                best_target = Some(j);
            }
        }

        if best_score >= 2 {
            if let Some(target_idx) = best_target {
                if i < target_idx {
                    moves.push((i, target_idx));
                }
            }
        }
    }

    for (from, to) in moves {
        if from >= ids.len() || to >= ids.len() || from == to {
            continue;
        }
        let item = ids.remove(from);
        let adjusted_to = if to > from { to } else { to + 1 };
        let insert_at = adjusted_to.min(ids.len());
        ids.insert(insert_at, item);
    }
}

