import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-[var(--radius-md)] bg-[var(--color-bg-card)] border border-[var(--color-border)] px-3.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] transition-all duration-200 focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
