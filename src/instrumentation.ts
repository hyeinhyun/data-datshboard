/**
 * Next.js instrumentation hook: runs once when the server process starts.
 * Starts the job handlers and background watchers (Node.js runtime only).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureHandlers } = await import("@/lib/jobs/handlers");
  const { startWatchers } = await import("@/lib/realtime/watcher");
  ensureHandlers();
  startWatchers();
}
