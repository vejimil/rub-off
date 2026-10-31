import "server-only";

// Live runs spend API credit, and billing has no cap. Production serves the sample unless
// ALLOW_LIVE_RUNS=1, and live runs are capped per visitor and overall per day. The counters live
// in the instance's memory, so a cold start resets them: the global cap is a brake, not a meter.
// Set a billing alert on the Meta account as the real backstop.

const PER_VISITOR_PER_DAY = 5;
const GLOBAL_PER_DAY = 100;

const counts = new Map<string, number>();
let day = "";

export type LimitError = "live_disabled" | "visitor_limit" | "daily_limit";

export function liveAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_LIVE_RUNS === "1";
}

// Counts one live run for this visitor, or says why not.
export function takeLiveRun(request: Request): LimitError | null {
  if (!liveAllowed()) return "live_disabled";
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    counts.clear();
    day = today;
  }
  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const all = counts.get("*") ?? 0, mine = counts.get(visitor) ?? 0;
  if (all >= GLOBAL_PER_DAY) return "daily_limit";
  if (mine >= PER_VISITOR_PER_DAY) return "visitor_limit";
  counts.set("*", all + 1);
  counts.set(visitor, mine + 1);
  return null;
}
