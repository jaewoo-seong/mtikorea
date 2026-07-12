import { ResponseViewer } from "@/components/dashboard/ResponseViewer";
import { formatDateTime } from "@/lib/utils";
import type { AgentWorkLogEntryWithResponse } from "@/lib/types";

const PHASE_LABEL: Record<string, string> = {
  orchestration: "Orchestration",
  sub_agent_call: "Sub-agent call",
  synthesis: "Synthesis",
};

export function WorkLogEntry({ entry }: { entry: AgentWorkLogEntryWithResponse }) {
  return (
    <li className="border-l-2 border-border py-2 pl-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text">
          {entry.action ?? (entry.phase ? PHASE_LABEL[entry.phase] : "Step")}
          {entry.sub_agent_used && (
            <span className="ml-2 text-xs font-normal text-text-secondary">
              via {entry.sub_agent_used}
            </span>
          )}
        </p>
        <span className="shrink-0 text-xs text-text-secondary">
          {formatDateTime(entry.created_at)}
        </span>
      </div>
      {(entry.duration_ms || entry.tokens_used) && (
        <p className="mt-0.5 text-xs text-text-secondary">
          {entry.duration_ms ? `${entry.duration_ms}ms` : null}
          {entry.duration_ms && entry.tokens_used ? " · " : null}
          {entry.tokens_used ? `${entry.tokens_used} tokens` : null}
        </p>
      )}
      <ResponseViewer promptSent={entry.prompt_sent} response={entry.response} />
    </li>
  );
}
