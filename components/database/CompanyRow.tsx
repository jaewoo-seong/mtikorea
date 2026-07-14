import { Avatar } from "@/components/common/Avatar";
import { Badge } from "@/components/common/Badge";
import { Table } from "@/components/common/Table";
import { EditableCell } from "@/components/database/EditableCell";
import { COMPANY_STATUS_OPTIONS } from "@/lib/constants";
import type { Company, CompanyStatus } from "@/lib/types";

interface CompanyRowProps {
  company: Company;
  onFieldSave: (field: keyof Company, value: string) => unknown;
  onOpenDetail: () => void;
}

export function CompanyRow({ company, onFieldSave, onOpenDetail }: CompanyRowProps) {
  return (
    <Table.Row>
      <Table.Cell editable>
        <button
          type="button"
          onClick={onOpenDetail}
          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm font-medium text-primary hover:underline"
        >
          <Avatar name={company.name} size="sm" />
          {company.name}
        </button>
      </Table.Cell>
      <Table.Cell editable>
        <EditableCell value={company.korean_name} onSave={(v) => onFieldSave("korean_name", v)} />
      </Table.Cell>
      <Table.Cell editable>
        <EditableCell value={company.industry} onSave={(v) => onFieldSave("industry", v)} />
      </Table.Cell>
      <Table.Cell editable>
        <EditableCell value={company.email} onSave={(v) => onFieldSave("email", v)} />
      </Table.Cell>
      <Table.Cell editable>
        <EditableCell value={company.phone} onSave={(v) => onFieldSave("phone", v)} />
      </Table.Cell>
      <Table.Cell editable className="w-32">
        <EditableCell
          variant="select"
          options={COMPANY_STATUS_OPTIONS}
          value={company.status}
          onSave={(v) => onFieldSave("status", v)}
          renderDisplay={(v) => <Badge status={(v as CompanyStatus) ?? "prospect"}>{v}</Badge>}
        />
      </Table.Cell>
    </Table.Row>
  );
}
