import type { PlatformName, TopPost } from "../../src/types.ts";

/** The reporting window: one full America/Chicago calendar day. */
export interface ReportDay {
  /** YYYY-MM-DD */
  date: string;
  /** Unix seconds, inclusive start / exclusive end of that day in America/Chicago. */
  startUnix: number;
  endUnix: number;
}

/** Raw counts for one platform, before ratios are computed. */
export interface RawMetric {
  id: string;
  name: PlatformName;
  views: number;
  likes: number;
  shares: number;
  /** 0–1 average view-through; omit if the platform doesn't expose it. */
  retentionRate?: number;
  /**
   * True when the numbers are cumulative lifetime totals (TikTok, X). The
   * aggregator turns them into a daily figure by diffing against the previous
   * stored snapshot, so the first day after connecting reads 0 (baseline).
   */
  lifetime?: boolean;
}

export interface ProviderResult {
  metrics: RawMetric[];
  topPosts: TopPost[];
}

export interface Provider {
  id: string;
  platforms: PlatformName[];
  /** True when every required env var is present. */
  configured(): boolean;
  fetch(day: ReportDay): Promise<ProviderResult>;
}

export function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** fetch + JSON with a readable error that never includes the query string (tokens may live there). */
export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  if (!res.ok) {
    const u = new URL(url);
    throw new Error(`${init?.method ?? "GET"} ${u.origin}${u.pathname} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}
