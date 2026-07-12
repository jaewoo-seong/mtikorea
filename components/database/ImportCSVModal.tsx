"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { useImportCompaniesCsv } from "@/lib/hooks";
import { parseCsv } from "@/lib/utils";

interface ImportCSVModalProps {
  open: boolean;
  onClose: () => void;
}

export function ImportCSVModal({ open, onClose }: ImportCSVModalProps) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const importCsv = useImportCompaniesCsv();

  const preview = csv ? parseCsv(csv).slice(0, 6) : [];

  async function handleFile(file: File) {
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    importCsv.reset();
  }

  function handleClose() {
    setCsv("");
    setFileName("");
    importCsv.reset();
    onClose();
  }

  async function handleImport() {
    await importCsv.mutateAsync(csv);
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import Companies from CSV">
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Expected columns: <code className="font-mono text-xs">name, korean_name, industry, website,
          email, phone, status, notes</code>. Existing companies with a matching name are updated.
        </p>

        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="block w-full text-sm text-text-secondary file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
        />

        {fileName && <p className="text-xs text-text-secondary">Selected: {fileName}</p>}

        {preview.length > 0 && (
          <div className="max-h-48 overflow-auto rounded border border-border">
            <table className="w-full text-xs">
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className={i === 0 ? "bg-background font-semibold" : "border-t border-border"}>
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {importCsv.isError && <p className="text-sm text-danger">{(importCsv.error as Error).message}</p>}
        {importCsv.isSuccess && (
          <p className="text-sm text-success">
            Imported {importCsv.data.imported} companies.
            {importCsv.data.errors.length > 0 && ` ${importCsv.data.errors.length} rows had errors.`}
          </p>
        )}

        <Modal.Footer>
          <Button type="button" variant="secondary" onClick={handleClose}>
            {importCsv.isSuccess ? "Close" : "Cancel"}
          </Button>
          <Button type="button" disabled={!csv || importCsv.isPending} onClick={handleImport}>
            {importCsv.isPending ? "Importing…" : "Import"}
          </Button>
        </Modal.Footer>
      </div>
    </Modal>
  );
}
