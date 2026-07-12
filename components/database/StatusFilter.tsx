import { Select } from "@/components/common/Input";
import type { CompanyStatus } from "@/lib/types";

interface StatusFilterProps {
  value: CompanyStatus | "";
  onChange: (value: CompanyStatus | "") => void;
}

const STATUSES: CompanyStatus[] = ["prospect", "lead", "customer", "inactive"];

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value as CompanyStatus | "")}
      className="w-40"
    >
      <option value="">All statuses</option>
      {STATUSES.map((status) => (
        <option key={status} value={status} className="capitalize">
          {status}
        </option>
      ))}
    </Select>
  );
}
