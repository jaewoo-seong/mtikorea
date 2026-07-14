import { emailTimestamp, formatDateTime } from "@/lib/utils";
import type { Email } from "@/lib/types";

export function LinkedEmailsSection({ emails }: { emails: Email[] }) {
  if (emails.length === 0) {
    return <p className="text-sm text-text-secondary">No linked emails yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {emails.map((email) => (
        <li key={email.id} className="rounded border border-border p-2 text-sm">
          <p className="font-medium text-text">{email.subject || "(no subject)"}</p>
          <p className="text-xs text-text-secondary">
            {email.direction === "sent" ? "To" : "From"}{" "}
            {email.direction === "sent" ? email.to_address : email.from_address} ·{" "}
            {formatDateTime(emailTimestamp(email))}
          </p>
        </li>
      ))}
    </ul>
  );
}
