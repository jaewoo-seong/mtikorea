"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Textarea } from "@/components/common/Input";
import { useAddInternalNote } from "@/lib/hooks";
import { formatDateTime } from "@/lib/utils";
import type { EmailInternalNote } from "@/lib/types";

export function InternalNoteBox({ emailId, notes }: { emailId: string; notes: EmailInternalNote[] }) {
  const [draft, setDraft] = useState("");
  const addNote = useAddInternalNote();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    await addNote.mutateAsync({ id: emailId, note: draft });
    setDraft("");
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Internal Notes (team only)
      </h4>
      {notes.length > 0 && (
        <ul className="mb-3 space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="text-sm">
              <p className="text-text">{note.note}</p>
              <p className="text-xs text-text-secondary">{formatDateTime(note.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note visible only to your team…"
          rows={2}
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={addNote.isPending || !draft.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}
