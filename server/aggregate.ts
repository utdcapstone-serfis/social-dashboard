import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DailyPayload, PlatformDailyMetric, PlatformName, TopPost, TrendPoint } from "../src/types.ts";
import { addDays, zonedDateKey, zonedMidnight } from "../src/lib/schedule.ts";
import { facebook, instagram } from "./providers/meta.ts";
import { tiktok } from "./providers/tiktok.ts";
import { x } from "./providers/x.ts";
import { youtube } from "./providers/youtube.ts";
import { env, type Provider, type RawMetric, type ReportDay } from "./providers/types.ts";

export const PROVIDERS: Provider[] = [youtube, instagram, facebook, tiktok, x];

const ALL_PLATFORMS: PlatformName[] = [
  "Facebook", "YouTube", "Instagram", "TikTok", "LinkedIn", "Pinterest", "Twitter", "Snapchat", "Threads", "Reddit", "Bluesky",
];
const HISTORY_DAYS = 14;

interface DayRecord {
  name: PlatformName;
  views: number;
  likes: number;
  shares: number;
  retentionRate: number;
}
interface LifetimeSnapshot {
  /** Report date the baseline was taken for. */
  date: string;
  base: { views: number; likes: number; shares: number };
  current: { views: number; likes: number; shares: number };
}
interface Store {
  daily: Record<string, Record<string, DayRecord>>;
  lifetime: Record<string, LifetimeSnapshot>;
  payload?: DailyPayload;
}

const CACHE_DIR = env("DASHBOARD_CACHE_DIR") || ".cache";
const STORE_FILE = join(CACHE_DIR, "store.json");

async function loadStore(): Promise<Store> {
  try {
    return JSON.parse(await readFile(STORE_FILE, "utf8")) as Store;
  } catch {
    return { daily: {}, lifetime: {} };
  }
}

async function saveStore(store: Store): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(store));
  await rename(tmp, STORE_FILE);
}

export async function readCachedPayload(): Promise<DailyPayload | undefined> {
  return (await loadStore()).payload;
}

function reportDay(now: Date): ReportDay {
  const lag = Math.max(0, Number(env("REPORT_LAG_DAYS") || 1));
  const date = addDays(zonedDateKey(now), -lag);
  return {
    date,
    startUnix: Math.floor(zonedMidnight(date).getTime() / 1000),
    endUnix: Math.floor(zonedMidnight(addDays(date, 1)).getTime() / 1000),
  };
}

/** Converts a provider's raw numbers into a per-day record (diffing lifetime counters). */
function toDayRecord(raw: RawMetric, day: ReportDay, store: Store): DayRecord {
  let { views, likes, shares } = raw;
  if (raw.lifetime) {
    const cur = { views, likes, shares };
    const prev = store.lifetime[raw.id];
    // Same report day (a retry/re-run): keep the original baseline. New day: yesterday's total is the baseline.
    const base = prev ? (prev.date === day.date ? prev.base : prev.current) : cur;
    store.lifetime[raw.id] = { date: day.date, base, current: cur };
    views = Math.max(0, cur.views - base.views);
    likes = Math.max(0, cur.likes - base.likes);
    shares = Math.max(0, cur.shares - base.shares);
  }
  return { name: raw.name, views, likes, shares, retentionRate: raw.retentionRate ?? 0 };
}

function latestRecord(store: Store, id: string, before: string): DayRecord | undefined {
  const dates = Object.keys(store.daily).filter((d) => d <= before && store.daily[d][id]).sort();
  const last = dates.at(-1);
  return last ? store.daily[last][id] : undefined;
}

export interface RefreshResult {
  payload: DailyPayload;
  /** Number of providers that errored (their last good data is kept). */
  failures: number;
}

let running: Promise<RefreshResult> | null = null;

/** Fetches every configured platform and rebuilds + persists the payload. Concurrent calls share one run. */
export function refresh(now: Date = new Date()): Promise<RefreshResult> {
  running ??= doRefresh(now).finally(() => {
    running = null;
  });
  return running;
}

async function doRefresh(now: Date): Promise<RefreshResult> {
  const store = await loadStore();
  const day = reportDay(now);
  const active = PROVIDERS.filter((p) => p.configured());
  const settled = await Promise.allSettled(active.map((p) => p.fetch(day)));

  const topPosts: TopPost[] = [];
  const connected = new Set<PlatformName>();
  let failures = 0;

  settled.forEach((result, i) => {
    const provider = active[i];
    provider.platforms.forEach((p) => connected.add(p));
    if (result.status === "fulfilled") {
      for (const raw of result.value.metrics) {
        (store.daily[day.date] ??= {})[raw.id] = toDayRecord(raw, day, store);
      }
      topPosts.push(...result.value.topPosts);
    } else {
      failures++;
      console.error(`[refresh] ${provider.id} failed: ${(result.reason as Error).message}`);
      // Keep the last good posts for this provider's platforms so the panel doesn't blank out.
      topPosts.push(...(store.payload?.topPosts ?? []).filter((t) => provider.platforms.includes(t.platform)));
    }
  });

  // Metrics: today's record, or the most recent earlier one if a provider failed.
  const metrics: PlatformDailyMetric[] = [];
  const previousViews: Record<string, number> = {};
  const prevDate = addDays(day.date, -1);
  const syncedAt = now.toISOString();
  for (const p of active.flatMap((pr) => pr.platforms)) {
    const id = p.toLowerCase();
    const rec = store.daily[day.date]?.[id] ?? latestRecord(store, id, day.date);
    if (!rec) continue;
    const stale = !store.daily[day.date]?.[id];
    metrics.push({
      id,
      name: rec.name,
      views: rec.views,
      retentionRate: rec.retentionRate,
      likesPerView: rec.views > 0 ? rec.likes / rec.views : 0,
      shareRate: rec.views > 0 ? rec.shares / rec.views : 0,
      lastUpdated: stale ? (store.payload?.metrics.find((m) => m.id === id)?.lastUpdated ?? syncedAt) : syncedAt,
    });
    previousViews[id] = store.daily[prevDate]?.[id]?.views ?? 0;
  }

  const history: TrendPoint[] = Object.keys(store.daily)
    .sort()
    .slice(-HISTORY_DAYS)
    .map((date) => {
      const recs = Object.values(store.daily[date]);
      return {
        date,
        views: recs.reduce((s, r) => s + r.views, 0),
        likes: recs.reduce((s, r) => s + r.likes, 0),
        shares: recs.reduce((s, r) => s + r.shares, 0),
      };
    });

  const payload: DailyPayload = {
    date: zonedDateKey(now),
    syncedAt,
    metrics,
    previousViews,
    history,
    topPosts: topPosts.sort((a, b) => b.views - a.views).slice(0, 8),
    source: "live",
    unconnected: ALL_PLATFORMS.filter((p) => !connected.has(p)),
  };

  // Keep ~90 days of history on disk.
  for (const d of Object.keys(store.daily).sort().slice(0, -90)) delete store.daily[d];
  // Only advance the cache if something real came back, or there was nothing to fetch.
  if (metrics.length > 0 || active.length === 0 || failures === 0) store.payload = payload;
  await saveStore(store);

  console.log(`[refresh] ${syncedAt} report-day=${day.date} platforms=${metrics.length} failures=${failures}`);
  return { payload, failures };
}
