"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ResponseViewerProps {
  promptSent?: string | null;
  response?: string | null;
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
          {promptSent && (
            <div>
              <p className="mb-1 text-xs font-semibold text-text-secondary">Prompt</p>
              <pre
                className={cn(
                  "max-h-48 overflow-auto rounded border border-border bg-background p-2",
                  "whitespace-pre-wrap font-mono text-xs text-text",
                )}
              >
                {promptSent}
              </pre>
            </div>
          )}
          {response && (
            <div>
              <p className="mb-1 text-xs font-semibold text-text-secondary">Response</p>
              <pre
                className={cn(
                  "max-h-48 overflow-auto rounded border border-border bg-background p-2",
                  "whitespace-pre-wrap font-mono text-xs text-text",
                )}
              >
                {response}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
