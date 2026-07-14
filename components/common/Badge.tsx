import { type HTMLAttributes } from "react";
import type { CompanyStatus, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type BadgeStatus = TaskStatus | CompanyStatus | "neutral";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: BadgeStatus;
}

const statusClasses: Record<BadgeStatus, string> = {
  running: "bg-status-running/10 text-status-running",
  completed: "bg-status-completed/10 text-status-completed",
  failed: "bg-status-failed/10 text-status-failed",
  queued: "bg-status-queued/10 text-status-queued",
  paused: "bg-status-paused/10 text-status-paused",
  prospect: "bg-text-secondary/10 text-text-secondary",
  lead: "bg-primary/10 text-primary",
  customer: "bg-success/10 text-success",
  inactive: "bg-danger/10 text-danger",
  neutral: "bg-border text-text-secondary",
};

export function Badge({ className, status = "neutral", children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        statusClasses[status],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
