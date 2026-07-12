import { Spinner } from "@/components/common/Spinner";
import { useCompanyEdits } from "@/lib/hooks";
import { formatDateTime } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  korean_name: "Korean Name",
  industry: "Industry",
  website: "Website",
  email: "Email",
  phone: "Phone",
  status: "Status",
  notes: "Notes",
};

export function AuditTrail({ companyId }: { companyId: string }) {
  const { data: edits = [], isLoading } = useCompanyEdits(companyId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size="sm" />
      </div>
    );
  }

  if (edits.length === 0) {
    return <p className="text-sm text-text-secondary">No edits recorded yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {edits.map((edit) => (
        <li key={edit.id} className="border-l-2 border-border py-1 pl-3 text-sm">
          <p className="text-text">
            <span className="font-medium">{FIELD_LABELS[edit.field_name] ?? edit.field_name}</span>{" "}
            changed from{" "}
            <span className="text-text-secondary">&ldquo;{edit.old_value || "—"}&rdquo;</span> to{" "}
            <span className="text-text-secondary">&ldquo;{edit.new_value || "—"}&rdquo;</span>
          </p>
          <p className="text-xs text-text-secondary">{formatDateTime(edit.edited_at)}</p>
        </li>
      ))}
    </ul>
  );
}
