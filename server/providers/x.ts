import type { TopPost } from "../../src/types.ts";
import { env, getJson, type Provider } from "./types.ts";

interface Tweet {
  id: string;
  text: string;
  public_metrics: { impression_count?: number; like_count?: number; retweet_count?: number; quote_count?: number };
}

/**
 * X API v2. Impressions are lifetime counters per post, so (like TikTok) we sum
 * the most recent posts and let the aggregator diff consecutive days.
 * Requires an X API tier that allows reading your own timeline.
 */
export const x: Provider = {
  id: "x",
  platforms: ["Twitter"],
  configured: () => Boolean(env("X_BEARER_TOKEN") && env("X_USER_ID")),
  async fetch() {
    const res = await getJson<{ data?: Tweet[] }>(
      `https://api.x.com/2/users/${env("X_USER_ID")}/tweets?max_results=100&exclude=retweets,replies&tweet.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${env("X_BEARER_TOKEN")}` } },
    );
    const tweets = res.data ?? [];
    const sum = (f: (t: Tweet) => number) => tweets.reduce((s, t) => s + f(t), 0);
    const topPosts: TopPost[] = [...tweets]
      .sort((a, b) => (b.public_metrics.impression_count ?? 0) - (a.public_metrics.impression_count ?? 0))
      .slice(0, 5)
      .map((t) => ({
        id: `x-${t.id}`,
        platform: "Twitter",
        title: t.text.replace(/\s+/g, " ").slice(0, 90),
        views: t.public_metrics.impression_count ?? 0,
        likes: t.public_metrics.like_count ?? 0,
        url: `https://x.com/i/web/status/${t.id}`,
      }));
    return {
      metrics: [
        {
          id: "twitter",
          name: "Twitter",
          views: sum((t) => t.public_metrics.impression_count ?? 0),
          likes: sum((t) => t.public_metrics.like_count ?? 0),
          shares: sum((t) => (t.public_metrics.retweet_count ?? 0) + (t.public_metrics.quote_count ?? 0)),
          lifetime: true,
        },
      ],
      topPosts,
    };
  },
};
