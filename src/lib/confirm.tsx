import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, HelpCircle, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

export type ConfirmKind = "info" | "warning" | "danger";

export interface ConfirmOptions {
  title?: string;
  message: string;
  kind?: ConfirmKind;
  confirmText?: string;
  cancelText?: string;
}

type Resolver = (ok: boolean) => void;

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>({ open: false, message: "" });
  const resolver = useRef<Resolver | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setState({ open: true, ...opts });
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    setState((s) => ({ ...s, open: false }));
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const kind: ConfirmKind = state.kind ?? "info";
  const { Icon, tint, confirmVariant } = styleFor(kind);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={state.open}
        onOpenChange={(o) => {
          if (!o) close(false);
        }}
      >
        <DialogContent showClose={false}>
          <DialogHeader className="flex items-start gap-3 pr-10">
            <div
              className={`h-10 w-10 shrink-0 rounded-[var(--radius-md)] grid place-items-center ${tint}`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle>{state.title ?? defaultTitle(kind)}</DialogTitle>
              <DialogDescription>{state.message}</DialogDescription>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="md" onClick={() => close(false)}>
              {state.cancelText ?? "Cancel"}
            </Button>
            <Button
              variant={confirmVariant}
              size="md"
              onClick={() => close(true)}
              autoFocus
            >
              {state.confirmText ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

function defaultTitle(kind: ConfirmKind) {
  switch (kind) {
    case "warning":
      return "Warning";
    case "danger":
      return "Confirm action";
    default:
      return "Confirm";
  }
}

function styleFor(kind: ConfirmKind): {
  Icon: typeof AlertTriangle;
  tint: string;
  confirmVariant: "primary" | "danger";
} {
  switch (kind) {
    case "warning":
      return {
        Icon: AlertTriangle,
        tint: "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/30",
        confirmVariant: "primary",
      };
    case "danger":
      return {
        Icon: Trash2,
        tint: "bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/30",
        confirmVariant: "danger",
      };
    default:
      return {
        Icon: HelpCircle,
        tint: "bg-[var(--color-accent-glow)] text-[var(--color-accent)] ring-1 ring-inset ring-[var(--color-accent)]/30",
        confirmVariant: "primary",
      };
  }
}

