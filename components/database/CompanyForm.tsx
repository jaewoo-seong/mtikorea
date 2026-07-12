"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Input, Select, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { useCreateCompany } from "@/lib/hooks";
import type { CompanyStatus } from "@/lib/types";

interface CompanyFormProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (companyId: string) => void;
}

const EMPTY = {
  name: "",
  korean_name: "",
  industry: "",
  website: "",
  email: "",
  phone: "",
  status: "prospect" as CompanyStatus,
  notes: "",
};

export function CompanyForm({ open, onClose, onCreated }: CompanyFormProps) {
  const [fields, setFields] = useState(EMPTY);
  const createCompany = useCreateCompany();

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function handleClose() {
    setFields(EMPTY);
    createCompany.reset();
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!fields.name.trim()) return;
    const company = await createCompany.mutateAsync(fields);
    onCreated?.(company.id);
    handleClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Company">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="company-name" className="mb-1 block text-sm font-medium text-text">
              Name
            </label>
            <Input
              id="company-name"
              value={fields.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="company-korean-name" className="mb-1 block text-sm font-medium text-text">
              Korean Name
            </label>
            <Input
              id="company-korean-name"
              value={fields.korean_name}
              onChange={(e) => set("korean_name", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="company-industry" className="mb-1 block text-sm font-medium text-text">
              Industry
            </label>
            <Input
              id="company-industry"
              value={fields.industry}
              onChange={(e) => set("industry", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="company-status" className="mb-1 block text-sm font-medium text-text">
              Status
            </label>
            <Select
              id="company-status"
              value={fields.status}
              onChange={(e) => set("status", e.target.value as CompanyStatus)}
            >
              <option value="prospect">Prospect</option>
              <option value="lead">Lead</option>
              <option value="customer">Customer</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <div>
            <label htmlFor="company-website" className="mb-1 block text-sm font-medium text-text">
              Website
            </label>
            <Input
              id="company-website"
              value={fields.website}
              onChange={(e) => set("website", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="company-email" className="mb-1 block text-sm font-medium text-text">
              Email
            </label>
            <Input
              id="company-email"
              type="email"
              value={fields.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="company-phone" className="mb-1 block text-sm font-medium text-text">
              Phone
            </label>
            <Input
              id="company-phone"
              value={fields.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor="company-notes" className="mb-1 block text-sm font-medium text-text">
            Notes
          </label>
          <Textarea
            id="company-notes"
            value={fields.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
        {createCompany.isError && (
          <p className="text-sm text-danger">{(createCompany.error as Error).message}</p>
        )}
        <Modal.Footer>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createCompany.isPending || !fields.name.trim()}>
            {createCompany.isPending ? "Creating…" : "Create Company"}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
