import type { DailyPayload } from "../types";
import { buildDailyPayload } from "./mockData";

/**
 * Loads the cached daily payload from our own backend (`/api/metrics`).
 * Platform credentials never reach the browser: the server holds them and
 * refreshes its cache at 00:00 America/Chicago. If the backend is unreachable
 * or has no platform connected yet, we fall back to clearly-labelled demo data.
 */
export async function fetchPayload(signal?: AbortSignal): Promise<DailyPayload> {
  try {
    const res = await fetch("/api/metrics", { signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = (await res.json()) as DailyPayload;
    if (Array.isArray(payload.metrics) && payload.metrics.length > 0) return payload;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
  }
  const mock = buildDailyPayload(new Date());
  return { ...mock, syncedAt: new Date().toISOString() };
}
