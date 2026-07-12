"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/common/Spinner";
import { CompaniesTable } from "@/components/database/CompaniesTable";
import { CompanyDetailModal } from "@/components/database/CompanyDetailModal";
import { CompanyForm } from "@/components/database/CompanyForm";
import { ImportCSVModal } from "@/components/database/ImportCSVModal";
import { IndustryFilter } from "@/components/database/IndustryFilter";
import { SearchBox } from "@/components/database/SearchBox";
import { StatusFilter } from "@/components/database/StatusFilter";
import { useCompanies, useUpdateCompany } from "@/lib/hooks";
import { toCsv } from "@/lib/utils";
import type { Company, CompanyStatus } from "@/lib/types";

function downloadCsv(companies: Company[]) {
  const headers = ["name", "korean_name", "industry", "website", "email", "phone", "status", "notes"];
  const rows = companies.map((c) => [
    c.name,
    c.korean_name,
    c.industry,
    c.website,
    c.email,
    c.phone,
    c.status,
    c.notes,
  ]);
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `companies-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function CompaniesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = (searchParams.get("status") ?? "") as CompanyStatus | "";
  const industry = searchParams.get("industry") ?? "";
  const q = searchParams.get("q") ?? "";

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const { data: companies = [], isLoading } = useCompanies({ status, industry, q });
  const updateCompany = useUpdateCompany();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`/companies?${params.toString()}`);
  }

  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-6">
      <h1 className="mb-4 text-xl font-bold text-text">Companies</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={(v) => setParam("q", v)} />
        <StatusFilter value={status} onChange={(v) => setParam("status", v)} />
        <IndustryFilter value={industry} onChange={(v) => setParam("industry", v)} />
      </div>

      <CompaniesTable
        companies={companies}
        isLoading={isLoading}
        onFieldSave={(companyId, field, value) => updateCompany.mutateAsync({ id: companyId, [field]: value })}
        onOpenDetail={setSelectedCompanyId}
        onCreateClick={() => setCreateOpen(true)}
        onImportClick={() => setImportOpen(true)}
        onExportClick={() => downloadCsv(companies)}
      />

      <CompanyForm open={createOpen} onClose={() => setCreateOpen(false)} />
      <ImportCSVModal open={importOpen} onClose={() => setImportOpen(false)} />
      {selectedCompanyId && (
        <CompanyDetailModal companyId={selectedCompanyId} onClose={() => setSelectedCompanyId(null)} />
      )}
    </div>
  );
}

export default function CompaniesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <CompaniesPageInner />
    </Suspense>
  );
}
