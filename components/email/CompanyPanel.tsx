"use client";

import { LinkedTasksSection } from "@/components/database/LinkedTasksSection";
import { Spinner } from "@/components/common/Spinner";
import { CompanyQuickView } from "@/components/email/CompanyQuickView";
import { useCompany } from "@/lib/hooks";

export function CompanyPanel({ companyId }: { companyId: string | null }) {
  const { data: company, isLoading } = useCompany(companyId);

  if (!companyId) {
    return <p className="p-4 text-sm text-text-secondary">No company linked to this email.</p>;
  }

  if (isLoading || !company) {
    return (
      <div className="flex justify-center p-4">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <CompanyQuickView company={company} />
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Related Tasks
        </h4>
        <LinkedTasksSection tasks={company.linked_tasks} />
      </div>
    </div>
  );
}
