import { LoadingBlock } from "@/components/common/LoadingBlock";
import { EmailRow } from "@/components/email/EmailRow";
import type { Email } from "@/lib/types";

interface EmailListProps {
  emails: Email[];
  isLoading: boolean;
  selectedEmailId: string | null;
  onSelect: (id: string) => void;
}

export function EmailList({ emails, isLoading, selectedEmailId, onSelect }: EmailListProps) {
  if (isLoading) {
    return <LoadingBlock />;
  }

  if (emails.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-text-secondary">
        No emails here yet.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {emails.map((email) => (
        <EmailRow
          key={email.id}
          email={email}
          selected={email.id === selectedEmailId}
          onClick={() => onSelect(email.id)}
        />
      ))}
    </div>
  );
}
