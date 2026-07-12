"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { Spinner } from "@/components/common/Spinner";
import { useOrganization, useUpdateOrganization } from "@/lib/hooks";
import type { Organization } from "@/lib/types";

function OrganizationForm({ org }: { org: Organization }) {
  const [name, setName] = useState(org.name);
  const updateOrg = useUpdateOrganization();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    await updateOrg.mutateAsync(name);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="max-w-sm flex-1">
        <label htmlFor="org-name" className="mb-1 block text-sm font-medium text-text">
          Organization Name
        </label>
        <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <Button type="submit" disabled={updateOrg.isPending || !name.trim() || name === org.name}>
        {updateOrg.isPending ? "Saving…" : "Save"}
      </Button>
      {updateOrg.isSuccess && <span className="pb-2 text-sm text-success">Saved</span>}
    </form>
  );
}

export function OrganizationSettings() {
  const { data: org, isLoading } = useOrganization();

  if (isLoading || !org) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size="sm" />
      </div>
    );
  }

  return <OrganizationForm org={org} />;
}
