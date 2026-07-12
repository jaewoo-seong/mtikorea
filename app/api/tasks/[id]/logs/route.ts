import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { readStorageFile } from "@/lib/fileStorage";
import type { AgentTask, AgentWorkLogEntry, AgentWorkLogEntryWithResponse } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Confirm the task belongs to this org before exposing its logs.
  const { rows: taskRows } = await query<AgentTask>(
    `SELECT id FROM agent_tasks WHERE id = $1 AND org_id = $2`,
    [id, session.user.orgId],
  );
  if (taskRows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { rows } = await query<AgentWorkLogEntry>(
    `SELECT * FROM agent_work_log WHERE task_id = $1 ORDER BY created_at ASC`,
    [id],
  );

  const entries: AgentWorkLogEntryWithResponse[] = await Promise.all(
    rows.map(async (entry) => {
      if (!entry.response_file_path) return entry;
      try {
        const response = await readStorageFile(entry.response_file_path);
        return { ...entry, response };
      } catch {
        return entry;
      }
    }),
  );

  return NextResponse.json(entries);
}
