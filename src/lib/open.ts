import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

export async function openTarget(target: string): Promise<void> {
  try {
    await invoke("open_path_or_url", { target });
  } catch (e) {
    toast.error(`${e}`);
  }
}
