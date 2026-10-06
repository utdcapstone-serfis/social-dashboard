import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { TopPost } from "../../src/types.ts";
import { env, getJson, type Provider } from "./types.ts";

/**
 * TikTok Display API. It exposes lifetime counters per video (no daily
 * breakdown), so we sum the latest videos and let the aggregator diff
 * consecutive days. TikTok may rotate the refresh token on every refresh; the
 * newest one is persisted to the (git-ignored) cache dir and preferred over the env value.
 */
const TOKEN_FILE = `${process.env.DASHBOARD_CACHE_DIR || ".cache"}/tiktok-refresh-token`;
const MAX_VIDEOS = 100;

async function currentRefreshToken(): Promise<string> {
  try {
    const saved = (await readFile(TOKEN_FILE, "utf8")).trim();
    if (saved) return saved;
  } catch {
    /* first run: use the env value */
  }
  return env("TIKTOK_REFRESH_TOKEN");
}

async function accessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_key: env("TIKTOK_CLIENT_KEY"),
    client_secret: env("TIKTOK_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: await currentRefreshToken(),
  });
  const t = await getJson<{ access_token: string; refresh_token?: string }>("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (t.refresh_token) {
    await mkdir(dirname(TOKEN_FILE), { recursive: true });
    await writeFile(TOKEN_FILE, t.refresh_token, { mode: 0o600 });
  }
  return t.access_token;
}

interface Video {
  id: string;
  title?: string;
  share_url?: string;
  view_count?: number;
  like_count?: number;
  share_count?: number;
}
interface VideoList {
  data: { videos: Video[]; cursor: number; has_more: boolean };
}

export const tiktok: Provider = {
  id: "tiktok",
  platforms: ["TikTok"],
  configured: () => Boolean(env("TIKTOK_CLIENT_KEY") && env("TIKTOK_CLIENT_SECRET") && env("TIKTOK_REFRESH_TOKEN")),
  async fetch() {
    const token = await accessToken();
    const videos: Video[] = [];
    let cursor: number | undefined;
    while (videos.length < MAX_VIDEOS) {
      const res = await getJson<VideoList>(
        "https://open.tiktokapis.com/v2/video/list/?fields=id,title,share_url,view_count,like_count,share_count",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
        },
      );
      videos.push(...res.data.videos);
      if (!res.data.has_more) break;
      cursor = res.data.cursor;
    }
    const sum = (k: "view_count" | "like_count" | "share_count") => videos.reduce((s, v) => s + (v[k] ?? 0), 0);
    const topPosts: TopPost[] = [...videos]
      .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
      .slice(0, 5)
      .map((v) => ({
        id: `tt-${v.id}`,
        platform: "TikTok",
        title: v.title || "(untitled)",
        views: v.view_count ?? 0,
        likes: v.like_count ?? 0,
        url: v.share_url,
      }));
    return {
      metrics: [{ id: "tiktok", name: "TikTok", views: sum("view_count"), likes: sum("like_count"), shares: sum("share_count"), lifetime: true }],
      topPosts,
    };
  },
};
