import { Select } from "@/components/common/Input";
import { COMPANY_STATUS_OPTIONS } from "@/lib/constants";
import type { CompanyStatus } from "@/lib/types";

interface StatusFilterProps {
  value: CompanyStatus | "";
  onChange: (value: CompanyStatus | "") => void;
}

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value as CompanyStatus | "")}
      className="w-40"
    >
      <option value="">All statuses</option>
      {COMPANY_STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Select>
  );
}
