"use client";

import { type ReactNode, useRef, useState } from "react";
import { Input, Select } from "@/components/common/Input";
import { cn } from "@/lib/utils";

interface EditableCellProps {
  value: string | null;
  onSave: (value: string) => unknown;
  variant?: "text" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  /** Custom display-mode rendering (e.g. a status Badge) instead of raw text. */
  renderDisplay?: (value: string | null) => ReactNode;
}

export function EditableCell({
  value,
  onSave,
  variant = "text",
  options,
  placeholder = "—",
  className,
  renderDisplay,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialValue = useRef(value ?? "");

  function startEdit() {
    initialValue.current = value ?? "";
    setDraft(value ?? "");
    setError(null);
    setEditing(true);
  }

  async function commit() {
    setEditing(false);
    if (draft === initialValue.current) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setDraft(initialValue.current);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    if (variant === "select" && options) {
      return (
        <Select
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          className="h-8 text-sm"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      );
    }
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(initialValue.current);
            setEditing(false);
          }
        }}
        className="h-8 text-sm"
      />
    );
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={startEdit}
        disabled={saving}
        className={cn(
          "w-full rounded px-2 py-1 text-left text-sm text-text transition-colors duration-150",
          "hover:bg-background hover:ring-1 hover:ring-border",
          saving && "opacity-50",
          !value && !renderDisplay && "text-text-secondary",
          className,
        )}
      >
        {renderDisplay ? renderDisplay(value) : value || placeholder}
      </button>
      {error && <p className="px-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
