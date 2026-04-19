export interface ModInfo {
  id: string;
  name: string;
  version?: string;
  supported_version?: string;
  tags: string[];
  dependencies: string[];
  picture?: string;
  path: string;
  descriptor_path: string;
  remote_file_id?: string;
  enabled: boolean;
  load_order: number;
  size_bytes: number;
}

export interface StellarisPaths {
  user_dir: string;
  mod_dir: string;
  dlc_load_path: string;
  game_data_path?: string;
  log_path?: string;
  content_dir?: string | null;
}

export interface MigrateReport {
  moved: number;
  skipped: number;
  failed: string[];
  details: string[];
}

export interface DownloadProgress {
  workshop_id: string;
  status: "queued" | "downloading" | "extracting" | "installing" | "done" | "error";
  progress: number;
  message: string;
}

export interface Preset {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  mod_ids: string[];
  note?: string;
}

export interface ConflictPair {
  mod_a: string;
  mod_a_name: string;
  mod_b: string;
  mod_b_name: string;
  file_count: number;
  files: string[];
}

export interface ConflictReport {
  pairs: ConflictPair[];
  total_conflicts: number;
}

export type ConflictKind = "FullOverride" | "Partial" | "Mixed" | "Unknown";

export interface ModKeys {
  mod_id: string;
  mod_name: string;
  keys: string[];
}

export interface FileConflict {
  file: string;
  kind: ConflictKind;
  mods: ModKeys[];
  shared_keys: string[];
  unique_keys_total: number;
}

export interface DeepConflictReport {
  files: FileConflict[];
  total_files: number;
  full_override_count: number;
  partial_count: number;
  mixed_count: number;
  unknown_count: number;
}

export interface SkippedFile {
  file: string;
  reason: string;
}

export type LoadOrderIssue =
  | { kind: "MissingDependency"; mod_id: string; mod_name: string; missing: string }
  | { kind: "Cycle"; mod_ids: string[]; mod_names: string[] }
  | {
      kind: "OutOfOrder";
      mod_id: string;
      mod_name: string;
      current_index: number;
      suggested_index: number;
    };

export interface ModPlan {
  mod_id: string;
  mod_name: string;
  suggested_index: number;
  current_index: number | null;
  bucket: string;
  reason: string;
}

export interface LoadOrderAnalysis {
  suggested: string[];
  plan: ModPlan[];
  issues: LoadOrderIssue[];
}

export interface PatchGenReport {
  patch_id: string;
  patch_folder: string;
  files_written: string[];
  files_skipped: SkippedFile[];
  full_override_count: number;
  partial_count: number;
  mixed_count: number;
}

export interface UpdateStatus {
  mod_id: string;
  remote_file_id: string;
  local_time: number;
  remote_time: number;
  has_update: boolean;
  title: string;
}

export interface DlcBackup {
  name: string;
  path: string;
  timestamp_ms: number;
  size_bytes: number;
  enabled_count: number;
}

export interface LogChunk {
  content: string;
  truncated: boolean;
}
