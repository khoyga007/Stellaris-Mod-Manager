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
