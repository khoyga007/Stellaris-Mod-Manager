import * as RD from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = RD.Root;
export const DialogTrigger = RD.Trigger;
export const DialogClose = RD.Close;

interface DialogContentProps {
  children: ReactNode;
  className?: string;
  showClose?: boolean;
  onOpenAutoFocus?: (e: Event) => void;
}

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ children, className, showClose = true, onOpenAutoFocus }, ref) => (
    <RD.Portal forceMount>
      <AnimatePresence>
        <RD.Overlay asChild forceMount>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />
        </RD.Overlay>
        <RD.Content asChild forceMount onOpenAutoFocus={onOpenAutoFocus}>
          <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
              "w-[min(92vw,480px)] max-h-[85vh] overflow-hidden flex flex-col",
              "bg-[var(--color-bg-elevated)] border border-[var(--color-border)]",
              "rounded-[var(--radius-lg)] shadow-2xl shadow-black/60",
              "focus:outline-none",
              className
            )}
          >
            {children}
            {showClose && (
              <RD.Close asChild>
                <button
                  aria-label="Close"
                  className="absolute right-3 top-3 h-8 w-8 rounded-[var(--radius-sm)] grid place-items-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </RD.Close>
            )}
          </motion.div>
        </RD.Content>
      </AnimatePresence>
    </RD.Portal>
  )
);
DialogContent.displayName = "DialogContent";

export function DialogHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("px-6 pt-6 pb-3", className)}>{children}</div>
  );
}

export function DialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <RD.Title className={cn("text-lg font-semibold font-display tracking-tight text-[var(--color-text)]", className)}>
      {children}
    </RD.Title>
  );
}

export function DialogDescription({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <RD.Description
      className={cn(
        "mt-1.5 text-sm leading-relaxed text-[var(--color-text-muted)] whitespace-pre-wrap break-words",
        className
      )}
    >
      {children}
    </RD.Description>
  );
}

export function DialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("px-6 py-2 overflow-y-auto text-sm text-[var(--color-text)]", className)}>
      {children}
    </div>
  );
}

export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "px-6 py-4 mt-2 flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg-card)]/40",
        className
      )}
    >
      {children}
    </div>
  );
}
