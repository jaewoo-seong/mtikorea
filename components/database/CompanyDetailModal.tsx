"use client";

import { Badge } from "@/components/common/Badge";
import { LoadingBlock } from "@/components/common/LoadingBlock";
import { Modal } from "@/components/common/Modal";
import { AuditTrail } from "@/components/database/AuditTrail";
import { EditableCell } from "@/components/database/EditableCell";
import { LinkedEmailsSection } from "@/components/database/LinkedEmailsSection";
import { LinkedTasksSection } from "@/components/database/LinkedTasksSection";
import { COMPANY_STATUS_OPTIONS } from "@/lib/constants";
import { useCompany, useUpdateCompany } from "@/lib/hooks";
import type { Company, CompanyStatus } from "@/lib/types";

const FIELD_LABELS: [keyof Company, string][] = [
  ["korean_name", "Korean Name"],
  ["industry", "Industry"],
  ["website", "Website"],
  ["email", "Email"],
  ["phone", "Phone"],
];

interface CompanyDetailModalProps {
  companyId: string;
  onClose: () => void;
}

export function CompanyDetailModal({ companyId, onClose }: CompanyDetailModalProps) {
  const { data: company, isLoading } = useCompany(companyId);
  const updateCompany = useUpdateCompany();

  function save(field: keyof Company, value: string) {
    return updateCompany.mutateAsync({ id: companyId, [field]: value });
  }

  return (
    <Modal open onClose={onClose} title={company?.name ?? "Company"} variant="sidebar">
      {isLoading || !company ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <EditableCell
                variant="select"
                options={COMPANY_STATUS_OPTIONS}
                value={company.status}
                onSave={(v) => save("status", v)}
                renderDisplay={(v) => <Badge status={(v as CompanyStatus) ?? "prospect"}>{v}</Badge>}
              />
            </div>
            <dl className="grid grid-cols-3 gap-y-2 text-sm">
              {FIELD_LABELS.map(([field, label]) => (
                <div key={field} className="col-span-3 grid grid-cols-3 items-center gap-2">
                  <dt className="text-text-secondary">{label}</dt>
                  <dd className="col-span-2">
                    <EditableCell value={company[field] as string | null} onSave={(v) => save(field, v)} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <h3 className="mb-1 text-sm font-semibold text-text">Notes</h3>
            <EditableCell value={company.notes} onSave={(v) => save("notes", v)} placeholder="Add notes…" />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-text">Linked Emails</h3>
            <LinkedEmailsSection emails={company.linked_emails} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-text">Linked Tasks</h3>
            <LinkedTasksSection tasks={company.linked_tasks} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-text">Edit History</h3>
            <AuditTrail companyId={companyId} />
          </div>
        </div>
      )}
    </Modal>
  );
}
