import { cn, formatDateTime } from "@/lib/utils";
import type { Email } from "@/lib/types";

interface EmailRowProps {
  email: Email;
  selected: boolean;
  onClick: () => void;
}

export function EmailRow({ email, selected, onClick }: EmailRowProps) {
  const counterparty = email.direction === "sent" ? email.to_address : email.from_address;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left transition-colors duration-150",
        selected ? "bg-primary/5" : "hover:bg-background",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("truncate text-sm", !email.read && email.direction === "received" ? "font-semibold text-text" : "text-text")}>
          {counterparty || "(unknown)"}
        </span>
        <span className="shrink-0 text-xs text-text-secondary">
          {formatDateTime(email.received_at ?? email.sent_at ?? email.created_at)}
        </span>
      </div>
      <span className="truncate text-sm text-text-secondary">{email.subject || "(no subject)"}</span>
    </button>
  );
}
