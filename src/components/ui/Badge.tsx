import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}

const toneStyles: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] border-[var(--color-border)]",
  accent: "bg-[var(--color-accent)]/10 text-[var(--color-accent-hover)] border-[var(--color-accent)]/25",
  success: "bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/25",
  warning: "bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/25",
  danger: "bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/25",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        toneStyles[tone],
        className
      )}
      {...props}
    />
  );
}
