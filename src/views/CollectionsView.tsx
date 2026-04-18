import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Library, Plus, Play, Pencil, Trash2, Calendar, Package2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Preset, ModInfo } from "@/types";

interface CollectionsViewProps {
  mods: ModInfo[];
  onApplied: () => void;
}

export function CollectionsView({ mods, onApplied }: CollectionsViewProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const list = await invoke<Preset[]>("list_presets");
      setPresets(list);
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function create() {
    if (!name.trim()) return;
    const ids = mods.filter((m) => m.enabled).map((m) => m.id);
    try {
      await invoke("create_preset", { name: name.trim(), modIds: ids });
      setName("");
      toast.success("Preset saved");
      refresh();
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  async function apply(p: Preset) {
    try {
      await invoke("apply_preset", { id: p.id });
      toast.success(`Applied "${p.name}"`);
      onApplied();
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  async function rename(p: Preset) {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await invoke("update_preset", { id: p.id, name: editName.trim(), modIds: p.mod_ids });
      setEditingId(null);
      refresh();
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  async function overwrite(p: Preset) {
    const ids = mods.filter((m) => m.enabled).map((m) => m.id);
    try {
      await invoke("update_preset", { id: p.id, name: p.name, modIds: ids });
      toast.success("Preset updated with current selection");
      refresh();
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  async function remove(p: Preset) {
    if (!confirm(`Delete preset "${p.name}"?`)) return;
    try {
      await invoke("delete_preset", { id: p.id });
      refresh();
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  const modMap = new Map(mods.map((m) => [m.id, m]));

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-5 max-w-4xl w-full mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-[var(--radius-md)] bg-gradient-to-br from-[#7c5cff] to-[#ec4899] grid place-items-center shadow-lg shadow-[var(--color-accent-glow)]">
            <Library className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight font-display">Collections</h1>
            <p className="text-xs text-[var(--color-text-muted)]">
              Save the current enabled set as a preset and swap between playthroughs in one click.
            </p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="New preset name..."
            className="flex-1"
          />
          <Button variant="primary" onClick={create} disabled={!name.trim()}>
            <Plus className="h-4 w-4" />
            Save current
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {presets.map((p) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="group rounded-[var(--radius-lg)] bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-[var(--radius-md)] bg-[var(--color-bg-hover)] grid place-items-center">
                    <Package2 className="h-4 w-4 text-[var(--color-accent-hover)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === p.id ? (
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") rename(p);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onBlur={() => rename(p)}
                        className="h-8"
                      />
                    ) : (
                      <div className="text-[13px] font-semibold truncate">{p.name}</div>
                    )}
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[var(--color-text-dim)]">
                      <span>{p.mod_ids.length} mods</span>
                      <span>•</span>
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(p.updated_at * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" title="Overwrite with current selection" onClick={() => overwrite(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Rename"
                      onClick={() => {
                        setEditingId(p.id);
                        setEditName(p.name);
                      }}
                    >
                      <span className="text-[10px] font-semibold">Aa</span>
                    </Button>
                    <Button variant="ghost" size="icon" title="Delete" onClick={() => remove(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => apply(p)}>
                    <Play className="h-3.5 w-3.5" />
                    Apply
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {p.mod_ids.slice(0, 6).map((id) => {
                    const m = modMap.get(id);
                    return (
                      <span
                        key={id}
                        className={
                          "text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)] border " +
                          (m
                            ? "bg-[var(--color-bg-hover)] border-[var(--color-border)] text-[var(--color-text-muted)]"
                            : "bg-[var(--color-danger)]/10 border-[var(--color-danger)]/30 text-[var(--color-danger)]")
                        }
                        title={m ? m.name : `Missing: ${id}`}
                      >
                        {m ? m.name : "missing"}
                      </span>
                    );
                  })}
                  {p.mod_ids.length > 6 && (
                    <span className="text-[10px] px-1.5 py-0.5 text-[var(--color-text-dim)]">
                      +{p.mod_ids.length - 6} more
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {!loading && presets.length === 0 && (
            <div className="text-center py-12 text-[var(--color-text-dim)]">
              <Library className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <div className="text-xs">
                No presets yet. Enable some mods and save your first collection above.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
