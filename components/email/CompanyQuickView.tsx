import { Badge } from "@/components/common/Badge";
import type { Company } from "@/lib/types";

export function CompanyQuickView({ company }: { company: Company }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">{company.name}</h3>
        <Badge status={company.status}>{company.status}</Badge>
      </div>
      {company.industry && <p className="text-xs text-text-secondary">{company.industry}</p>}
      {company.notes && <p className="mt-2 text-xs text-text-secondary">{company.notes}</p>}
    </div>
  );
}
