"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ResponseViewerProps {
  promptSent?: string | null;
  response?: string | null;
}

function ResponseBlock({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-text-secondary">{label}</p>
      <pre
        className={cn(
          "max-h-48 overflow-auto rounded border border-border bg-background p-2",
          "whitespace-pre-wrap font-mono text-xs text-text",
        )}
      >
        {content}
      </pre>
    </div>
  );
}

export function ResponseViewer({ promptSent, response }: ResponseViewerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!promptSent && !response) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs font-medium text-primary hover:text-primary-600"
      >
        {expanded ? "Hide details" : "Show details"}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 animate-fade-in">
          {promptSent && <ResponseBlock label="Prompt" content={promptSent} />}
          {response && <ResponseBlock label="Response" content={response} />}
        </div>
      )}
    </div>
  );
}
