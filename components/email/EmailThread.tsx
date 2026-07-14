import { emailTimestamp, formatDateTime } from "@/lib/utils";
import type { EmailWithBody } from "@/lib/types";

export function EmailThread({ emails }: { emails: EmailWithBody[] }) {
  return (
    <div className="space-y-3">
      {emails.map((email) => (
        <div
          key={email.id}
          className="rounded-lg border border-border bg-surface p-3"
        >
          <div className="mb-1 flex items-center justify-between text-xs text-text-secondary">
            <span>
              <span className="font-medium text-text">{email.from_address}</span> → {email.to_address}
            </span>
            <span>{formatDateTime(emailTimestamp(email))}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm text-text">{email.body || "(no content)"}</p>
        </div>
      ))}
    </div>
  );
}
