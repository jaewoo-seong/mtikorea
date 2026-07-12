import { Button } from "@/components/common/Button";
import { Icon } from "@/components/common/Icon";
import { Spinner } from "@/components/common/Spinner";
import { Table } from "@/components/common/Table";
import { CompanyRow } from "@/components/database/CompanyRow";
import type { Company } from "@/lib/types";

interface CompaniesTableProps {
  companies: Company[];
  isLoading: boolean;
  onFieldSave: (companyId: string, field: keyof Company, value: string) => unknown;
  onOpenDetail: (companyId: string) => void;
  onCreateClick: () => void;
  onImportClick: () => void;
  onExportClick: () => void;
}

export function CompaniesTable({
  companies,
  isLoading,
  onFieldSave,
  onOpenDetail,
  onCreateClick,
  onImportClick,
  onExportClick,
}: CompaniesTableProps) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onImportClick}>
          Import CSV
        </Button>
        <Button size="sm" variant="secondary" onClick={onExportClick} disabled={companies.length === 0}>
          Export CSV
        </Button>
        <Button size="sm" onClick={onCreateClick}>
          <Icon name="plus" className="h-4 w-4" />
          New Company
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : companies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-secondary">
          No companies yet. Add one or import a CSV to get started.
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Korean Name</Table.HeaderCell>
              <Table.HeaderCell>Industry</Table.HeaderCell>
              <Table.HeaderCell>Email</Table.HeaderCell>
              <Table.HeaderCell>Phone</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {companies.map((company) => (
              <CompanyRow
                key={company.id}
                company={company}
                onFieldSave={(field, value) => onFieldSave(company.id, field, value)}
                onOpenDetail={() => onOpenDetail(company.id)}
              />
            ))}
          </Table.Body>
        </Table>
      )}
    </div>
  );
}
