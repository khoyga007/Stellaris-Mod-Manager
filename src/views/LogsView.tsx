import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal, Play, Pause, Eraser, AlertCircle, FileText, ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { LogChunk } from "@/types";

export function LogsView() {
  const [content, setContent] = useState<string>("");
  const [path, setPath] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    let un: UnlistenFn | null = null;
    (async () => {
      un = await listen<LogChunk>("log-chunk", (ev) => {
        setContent((prev) => {
          const next = ev.payload.truncated ? ev.payload.content : prev + ev.payload.content;
          return next.length > 500_000 ? next.slice(-400_000) : next;
        });
      });
    })();
    return () => {
      un?.();
    };
  }, []);

  useEffect(() => {
    if (!autoScroll) return;
    requestAnimationFrame(() => {
      if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
    });
  }, [content, autoScroll]);

  async function toggleLive() {
    try {
      if (live) {
        await invoke("stop_log_tail");
        setLive(false);
      } else {
        await invoke("start_log_tail");
        setLive(true);
        setErr(null);
      }
    } catch (e) {
      setErr(String(e));
    }
  }

  async function loadOnce() {
    setErr(null);
    try {
      const res = await invoke<{ path: string; content: string }>("read_stellaris_log");
      setPath(res.path);
      setContent(res.content);
    } catch (e) {
      setErr(String(e));
    }
  }

  useEffect(() => {
    loadOnce();
    return () => {
      if (liveRef.current) invoke("stop_log_tail").catch(() => {});
    };
  }, []);

  const lines = content.split("\n");

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 flex items-center gap-3 border-b border-[var(--color-border)]">
        <div className="h-8 w-8 rounded-[var(--radius-sm)] bg-[var(--color-bg-hover)] grid place-items-center relative">
          <Terminal className="h-4 w-4 text-[var(--color-accent-hover)]" />
          {live && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--color-success)] animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2">
            Game logs
            {live && <span className="text-[10px] uppercase tracking-wider text-[var(--color-success)]">live</span>}
          </div>
          <div className="text-[11px] text-[var(--color-text-dim)] font-mono truncate">
            {path ?? "…"}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAutoScroll((v) => !v)}
          title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
        >
          <ArrowDownToLine className={"h-3.5 w-3.5 " + (autoScroll ? "text-[var(--color-accent-hover)]" : "")} />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setContent("")}>
          <Eraser className="h-3.5 w-3.5" />
          Clear view
        </Button>
        <Button variant={live ? "danger" : "primary"} size="sm" onClick={toggleLive}>
          {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {live ? "Pause" : "Live tail"}
        </Button>
      </div>

      <div ref={boxRef} className="flex-1 overflow-y-auto px-6 py-4 bg-[var(--color-bg)] font-mono text-[11px] leading-relaxed">
        {err ? (
          <div className="flex items-start gap-2 text-[var(--color-danger)]">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>{err}</span>
          </div>
        ) : content.length === 0 ? (
          <div className="h-full grid place-items-center text-[var(--color-text-dim)]">
            <div className="flex flex-col items-center gap-2">
              <FileText className="h-8 w-8" />
              <span className="text-xs">No log output yet. Launch Stellaris or enable live tail.</span>
            </div>
          </div>
        ) : (
          lines.map((line, i) => (
            <div
              key={i}
              className={
                "whitespace-pre-wrap " +
                (line.toLowerCase().includes("error")
                  ? "text-[var(--color-danger)]"
                  : line.toLowerCase().includes("warn")
                  ? "text-[var(--color-warning)]"
                  : "text-[var(--color-text-muted)]")
              }
            >
              <span className="inline-block w-10 text-[var(--color-text-dim)] select-none">{i + 1}</span>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
