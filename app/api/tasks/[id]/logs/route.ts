import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { readStorageFile } from "@/lib/fileStorage";
import type { AgentTask, AgentWorkLogEntry, AgentWorkLogEntryWithResponse } from "@/lib/types";

// This route is polled every few seconds while a task is running. A step's
// response file is written once and never changes, so re-reading it from
// disk on every poll is wasted I/O — cache by path for the life of the
// process. Capped to avoid unbounded growth on a long-running server.
const RESPONSE_CACHE_MAX = 1000;
const responseFileCache = new Map<string, string>();

async function readCachedResponse(filePath: string): Promise<string | null> {
  const cached = responseFileCache.get(filePath);
  if (cached !== undefined) return cached;
  try {
    const content = await readStorageFile(filePath);
    if (responseFileCache.size >= RESPONSE_CACHE_MAX) {
      const oldestKey = responseFileCache.keys().next().value;
      if (oldestKey !== undefined) responseFileCache.delete(oldestKey);
    }
    responseFileCache.set(filePath, content);
    return content;
  } catch {
    return null;
  }
}

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
      const response = await readCachedResponse(entry.response_file_path);
      return response !== null ? { ...entry, response } : entry;
    }),
  );

  return NextResponse.json(entries);
}
