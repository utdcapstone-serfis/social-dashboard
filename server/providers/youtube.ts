import type { TopPost } from "../../src/types.ts";
import { addDays } from "../../src/lib/schedule.ts";
import { env, getJson, type Provider } from "./types.ts";

/**
 * YouTube Analytics API (OAuth) for per-day views/likes/shares/retention, plus
 * the Data API (API key) to resolve video titles. The Data API alone only
 * exposes lifetime totals, so the OAuth refresh token is required for daily numbers.
 */
async function accessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: env("YOUTUBE_CLIENT_ID"),
    client_secret: env("YOUTUBE_CLIENT_SECRET"),
    refresh_token: env("YOUTUBE_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const t = await getJson<{ access_token: string }>("https://oauth2.googleapis.com/token", { method: "POST", body });
  return t.access_token;
}

interface Report {
  rows?: Array<Array<string | number>>;
}

export const youtube: Provider = {
  id: "youtube",
  platforms: ["YouTube"],
  configured: () =>
    Boolean(env("YOUTUBE_API_KEY") && env("YOUTUBE_CLIENT_ID") && env("YOUTUBE_CLIENT_SECRET") && env("YOUTUBE_REFRESH_TOKEN")),

  async fetch(day) {
    const auth = { headers: { Authorization: `Bearer ${await accessToken()}` } };
    const base = "https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE";

    const daily = await getJson<Report>(
      `${base}&startDate=${day.date}&endDate=${day.date}&metrics=views,likes,shares,averageViewPercentage`,
      auth,
    );
    const [views = 0, likes = 0, shares = 0, avgPct = 0] = (daily.rows?.[0] ?? []).map(Number);

    // Top videos over the trailing 7 days ending on the reporting day.
    const top = await getJson<Report>(
      `${base}&startDate=${addDays(day.date, -6)}&endDate=${day.date}&dimensions=video&metrics=views,likes&sort=-views&maxResults=5`,
      auth,
    );
    const rows = top.rows ?? [];
    let titles: Record<string, string> = {};
    if (rows.length > 0) {
      const ids = rows.map((r) => String(r[0])).join(",");
      const vids = await getJson<{ items: Array<{ id: string; snippet: { title: string } }> }>(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids}&key=${env("YOUTUBE_API_KEY")}`,
      );
      titles = Object.fromEntries(vids.items.map((v) => [v.id, v.snippet.title]));
    }
    const topPosts: TopPost[] = rows.map((r) => ({
      id: `yt-${r[0]}`,
      platform: "YouTube",
      title: titles[String(r[0])] ?? String(r[0]),
      views: Number(r[1]),
      likes: Number(r[2]),
      url: `https://www.youtube.com/watch?v=${r[0]}`,
    }));

    return {
      metrics: [{ id: "youtube", name: "YouTube", views, likes, shares, retentionRate: avgPct / 100 }],
      topPosts,
    };
  },
};
