export type PlatformName =
  | "Facebook"
  | "YouTube"
  | "Instagram"
  | "TikTok"
  | "LinkedIn"
  | "Pinterest"
  | "Twitter"
  | "Snapchat"
  | "Threads"
  | "Reddit"
  | "Bluesky";

export interface PlatformDailyMetric {
  id: string;
  name: PlatformName;
  views: number;
  /** 0.42 = 42%. 0 means "not reported by this platform" and is shown as n/a. */
  retentionRate: number;
  likesPerView: number; // 0.05 = 5%
  shareRate: number; // 0.015 = 1.5%
  lastUpdated: string; // ISO date
}

/** Static presentation data for a platform. */
export interface PlatformMeta {
  /** Brand color used for chart slices and accents. */
  color: string;
  /** Text color with accessible contrast on top of `color`. */
  onColor: string;
  /** 1–2 character badge label. */
  badge: string;
  /** Display label (Twitter is shown as "Twitter / X"). */
  label: string;
}

/** One point of the cross-platform trend line. */
export interface TrendPoint {
  /** YYYY-MM-DD of the day the numbers describe. */
  date: string;
  views: number;
  likes: number;
  shares: number;
}

export interface TopPost {
  id: string;
  platform: PlatformName;
  title: string;
  views: number;
  likes: number;
  url?: string;
}

/** One day's worth of analytics for every connected platform. */
export interface DailyPayload {
  /** Calendar day, YYYY-MM-DD, this payload was produced for. */
  date: string;
  /** ISO timestamp of the sync that produced this payload. */
  syncedAt: string;
  metrics: PlatformDailyMetric[];
  /** Previous day's views by platform id, for day-over-day deltas. */
  previousViews: Record<string, number>;
  /* ---- optional additions: older payloads without them still render ---- */
  /** Oldest → newest daily totals for the trend chart. */
  history?: TrendPoint[];
  topPosts?: TopPost[];
  /** "live" = real platform APIs, "mock" = generated demo data. */
  source?: "live" | "mock";
  /** Platforms with no credentials configured on the server. */
  unconnected?: PlatformName[];
}
