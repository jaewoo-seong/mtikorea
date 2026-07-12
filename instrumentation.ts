export async function register() {
  console.log(`[instrumentation] register() called, NEXT_RUNTIME=${process.env.NEXT_RUNTIME}`);

  if (process.env.NEXT_RUNTIME === "edge") return;

  try {
    const { startOrchestratorLoop } = await import("@/lib/orchestrator");
    startOrchestratorLoop();
  } catch (err) {
    console.error("[instrumentation] failed to start orchestrator loop:", err);
  }
}
