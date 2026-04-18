import * as RD from "@radix-ui/react-dialog";
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
    <RD.Portal>
      <RD.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
        )}
      />
      <RD.Content
        ref={ref}
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          "w-[min(92vw,480px)] max-h-[85vh] overflow-hidden flex flex-col",
          "bg-[var(--color-bg-elevated)] border border-[var(--color-border)]",
          "rounded-[var(--radius-lg)] shadow-2xl shadow-black/60 focus:outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
          "data-[state=open]:slide-in-from-bottom-2",
          "duration-150",
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
      </RD.Content>
    </RD.Portal>
  )
);
DialogContent.displayName = "DialogContent";

export function DialogHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-6 pt-6 pb-3", className)}>{children}</div>;
}

export function DialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <RD.Title
      className={cn(
        "text-lg font-semibold font-display tracking-tight text-[var(--color-text)]",
        className
      )}
    >
      {children}
    </RD.Title>
  );
}

export function DialogDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
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
