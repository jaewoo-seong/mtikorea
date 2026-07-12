import { query } from "@/lib/db";
import { writeStorageFile } from "@/lib/fileStorage";
import { chatCompletion } from "@/lib/openrouterClient";
import { isTavilyConfigured, search as tavilySearch } from "@/lib/tavilyClient";
import type { AgentTask, Organization } from "@/lib/types";

const POLL_INTERVAL_MS = 5000;
const MAX_TOKENS_PER_CALL = 2000;
const MAX_SUBTASKS = 4;

declare global {
  var __orchestratorStarted: boolean | undefined;
}

// Atomic job-queue claim: SKIP LOCKED means concurrent callers (or overlapped
// poll ticks) never grab the same row, without needing an app-level mutex.
// Optionally scoped to one org — used by the manual-trigger route so it can
// never claim (and thereby strand in 'running') a task from another org.
export async function claimNextQueuedTask(orgId?: string): Promise<AgentTask | null> {
  const { rows } = await query<AgentTask>(
    `WITH next_task AS (
       SELECT id FROM agent_tasks
       WHERE status = 'queued' ${orgId ? "AND org_id = $1" : ""}
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE agent_tasks
     SET status = 'running', started_at = now()
     FROM next_task
     WHERE agent_tasks.id = next_task.id
     RETURNING agent_tasks.*`,
    orgId ? [orgId] : [],
  );
  return rows[0] ?? null;
}

function buildSystemPrompt(org: Organization | undefined, grounded: boolean) {
  const base = `You are an AI research and sales assistant for ${org?.name ?? "a B2B company"}. You help with market research, prospect research, and outreach drafting for their sales team.`;
  const browsing = grounded
    ? "You have been given live web search results below — use them as your primary source for current information, and cite sources by URL where relevant."
    : "You do NOT have live web browsing or search tools right now — rely only on your existing knowledge, and say so explicitly if the task needs current information you can't verify.";
  return `${base} ${browsing}`;
}

// Soft-fails on purpose: a search outage shouldn't fail the whole task, just
// degrade to ungrounded (and the system prompt above says so honestly).
async function getGroundingContext(searchQuery: string): Promise<string> {
  if (!isTavilyConfigured()) return "";
  try {
    const results = await tavilySearch(searchQuery, 4);
    if (results.length === 0) return "";
    return results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content.slice(0, 600)}`)
      .join("\n\n");
  } catch (err) {
    console.error("[orchestrator] Tavily search failed, continuing without grounding:", err);
    return "";
  }
}

interface Plan {
  type: "direct" | "decompose";
  subtasks: string[];
}

function parsePlan(raw: string): Plan {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    if (parsed.type === "decompose" && Array.isArray(parsed.subtasks) && parsed.subtasks.length > 0) {
      return { type: "decompose", subtasks: parsed.subtasks.slice(0, MAX_SUBTASKS).map(String) };
    }
  } catch {
    // Any parse failure just falls back to the safe, simple path.
  }
  return { type: "direct", subtasks: [] };
}

async function planTask(task: AgentTask, stepNumber: number, maxTokens: number) {
  const userText = [task.title, task.description].filter(Boolean).join("\n\n");
  const system = [
    "You are a task planner for a B2B sales/research assistant.",
    `Decide whether the task below needs breaking into 2-${MAX_SUBTASKS} independent research sub-questions that can be researched separately and then combined, or can be answered directly in one step.`,
    "Respond with ONLY a JSON object, no other text, no markdown fences.",
    `Simple tasks (drafting, single facts, short answers): {"type": "direct"}`,
    `Tasks that benefit from decomposition: {"type": "decompose", "subtasks": ["...", "..."]}`,
  ].join(" ");

  const start = Date.now();
  const result = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
    { maxTokens, temperature: 0.2 },
  );
  const durationMs = Date.now() - start;
  const plan = parsePlan(result.content);

  await query(
    `INSERT INTO agent_work_log (task_id, step_number, phase, action, prompt_sent, duration_ms, tokens_used)
     VALUES ($1, $2, 'orchestration', $3, $4, $5, $6)`,
    [
      task.id,
      stepNumber,
      plan.type === "decompose" ? `Plan: decomposed into ${plan.subtasks.length} sub-tasks` : "Plan: direct",
      userText,
      durationMs,
      result.totalTokens,
    ],
  );

  return { plan, tokens: result.totalTokens };
}

async function runDirect(task: AgentTask, org: Organization | undefined, maxTokens: number) {
  const userText = [task.title, task.description].filter(Boolean).join("\n\n");
  const grounding = await getGroundingContext(userText);
  const system = buildSystemPrompt(org, !!grounding);
  const user = grounding ? `${userText}\n\nWeb search results:\n${grounding}` : userText;

  const start = Date.now();
  const result = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { maxTokens },
  );
  const durationMs = Date.now() - start;

  const responsePath = `tasks/${task.org_id}/${task.id}/response.txt`;
  await writeStorageFile(responsePath, result.content);

  await query(
    `INSERT INTO agent_work_log (task_id, step_number, phase, action, prompt_sent, response_file_path, duration_ms, tokens_used)
     VALUES ($1, 1, 'orchestration', 'Run task', $2, $3, $4, $5)`,
    [task.id, user, responsePath, durationMs, result.totalTokens],
  );

  return { content: result.content, tokens: result.totalTokens, responsePath };
}

interface SubTaskResult {
  subtaskText: string;
  content: string;
  tokens: number;
  ok: boolean;
}

async function runSubAgentTask(
  task: AgentTask,
  subtaskText: string,
  stepNumber: number,
  maxTokens: number,
): Promise<SubTaskResult> {
  const model = process.env.OPENROUTER_SUBAGENT_MODEL || "anthropic/claude-haiku-4.5";
  const grounding = await getGroundingContext(subtaskText);
  const system = [
    "You are a research sub-agent. Answer the specific sub-question below concisely and factually.",
    grounding
      ? "Use the web search results provided as your primary source, and cite URLs where relevant."
      : "You do not have live web search — answer from existing knowledge and flag anything you're unsure is current.",
  ].join(" ");
  const user = grounding ? `${subtaskText}\n\nWeb search results:\n${grounding}` : subtaskText;

  const start = Date.now();
  try {
    const result = await chatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { model, maxTokens },
    );
    const durationMs = Date.now() - start;

    await query(
      `INSERT INTO agent_work_log (task_id, step_number, phase, action, sub_agent_used, prompt_sent, duration_ms, tokens_used)
       VALUES ($1, $2, 'sub_agent_call', $3, $4, $5, $6, $7)`,
      [task.id, stepNumber, `Sub-task: ${subtaskText.slice(0, 80)}`, model, user, durationMs, result.totalTokens],
    );

    await query(
      `INSERT INTO sub_agent_performance (org_id, agent_name, task_type, speed_ms)
       VALUES ($1, $2, 'sub_agent_call', $3)`,
      [task.org_id, model, durationMs],
    );

    return { subtaskText, content: result.content, tokens: result.totalTokens, ok: true };
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);

    await query(
      `INSERT INTO agent_work_log (task_id, step_number, phase, action, sub_agent_used, prompt_sent, duration_ms)
       VALUES ($1, $2, 'sub_agent_call', $3, $4, $5, $6)`,
      [task.id, stepNumber, `Sub-task failed: ${message.slice(0, 150)}`, model, user, durationMs],
    );

    return { subtaskText, content: "", tokens: 0, ok: false };
  }
}

async function synthesize(
  task: AgentTask,
  org: Organization | undefined,
  results: SubTaskResult[],
  stepNumber: number,
  maxTokens: number,
) {
  const successCount = results.filter((r) => r.ok).length;
  const combined = results
    .map(
      (r, i) =>
        `Sub-question ${i + 1}: ${r.subtaskText}\n${r.ok ? r.content : "(this sub-task failed to complete)"}`,
    )
    .join("\n\n---\n\n");

  const system = buildSystemPrompt(org, false); // grounding is already baked into each sub-task's content
  const gapNote =
    successCount < results.length ? " Note: some sub-research failed — synthesize from what succeeded and note the gap." : "";
  const user = `Original task: ${task.title}\n${task.description ?? ""}\n\nCombine the following research into one coherent final answer for the task.${gapNote}\n\n${combined}`;

  const start = Date.now();
  const result = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { maxTokens },
  );
  const durationMs = Date.now() - start;

  const responsePath = `tasks/${task.org_id}/${task.id}/response.txt`;
  await writeStorageFile(responsePath, result.content);

  await query(
    `INSERT INTO agent_work_log (task_id, step_number, phase, action, prompt_sent, response_file_path, duration_ms, tokens_used)
     VALUES ($1, $2, 'synthesis', 'Combine sub-task results', $3, $4, $5, $6)`,
    [task.id, stepNumber, user, responsePath, durationMs, result.totalTokens],
  );

  return { content: result.content, tokens: result.totalTokens, responsePath };
}

export async function runTask(task: AgentTask): Promise<void> {
  const overallStart = Date.now();
  const { rows: orgRows } = await query<Organization>(`SELECT * FROM organizations WHERE id = $1`, [
    task.org_id,
  ]);
  const org = orgRows[0];

  let tokensSoFar = 0;
  const remaining = () => Math.max(1, task.token_budget - task.tokens_used - tokensSoFar);

  try {
    const { plan, tokens: planTokens } = await planTask(task, 1, Math.min(300, remaining()));
    tokensSoFar += planTokens;

    let finalContent: string;
    let responsePath: string;

    if (plan.type === "decompose") {
      const perSubCap = Math.max(200, Math.floor(remaining() / (plan.subtasks.length + 1)));
      const subResults = await Promise.all(
        plan.subtasks.map((st, i) => runSubAgentTask(task, st, i + 2, Math.min(800, perSubCap))),
      );
      tokensSoFar += subResults.reduce((sum, r) => sum + r.tokens, 0);

      const synthesisStep = plan.subtasks.length + 2;
      const synthesisResult = await synthesize(task, org, subResults, synthesisStep, Math.min(1200, remaining()));
      tokensSoFar += synthesisResult.tokens;
      finalContent = synthesisResult.content;
      responsePath = synthesisResult.responsePath;
    } else {
      const direct = await runDirect(task, org, Math.min(MAX_TOKENS_PER_CALL, remaining()));
      tokensSoFar += direct.tokens;
      finalContent = direct.content;
      responsePath = direct.responsePath;
    }

    await query(
      `INSERT INTO agent_task_results (task_id, category, title, summary, full_response_file_path)
       VALUES ($1, 'summary', $2, $3, $4)`,
      [task.id, task.title, finalContent.slice(0, 500), responsePath],
    );

    await query(
      `UPDATE agent_tasks SET status = 'completed', completed_at = now(), tokens_used = tokens_used + $1 WHERE id = $2`,
      [tokensSoFar, task.id],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - overallStart;

    await query(
      `INSERT INTO agent_work_log (task_id, step_number, phase, action, duration_ms, tokens_used)
       VALUES ($1, 1, 'orchestration', $2, $3, $4)`,
      [task.id, `Failed: ${message.slice(0, 200)}`, durationMs, tokensSoFar],
    );

    await query(
      `UPDATE agent_tasks SET status = 'failed', completed_at = now(), tokens_used = tokens_used + $1 WHERE id = $2`,
      [tokensSoFar, task.id],
    );

    console.error(`[orchestrator] task ${task.id} failed:`, message);
  }
}

export function startOrchestratorLoop() {
  if (global.__orchestratorStarted) return;
  global.__orchestratorStarted = true;

  let isProcessing = false;

  console.log("[orchestrator] poll loop started");

  setInterval(() => {
    if (isProcessing) return;
    isProcessing = true;

    claimNextQueuedTask()
      .then((task) => {
        if (!task) return undefined;
        console.log(`[orchestrator] running task ${task.id}: ${task.title}`);
        return runTask(task);
      })
      .catch((err) => {
        console.error("[orchestrator] poll tick error:", err);
      })
      .finally(() => {
        isProcessing = false;
      });
  }, POLL_INTERVAL_MS);
}
