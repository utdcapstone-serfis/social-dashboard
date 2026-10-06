import { env, getJson, type Provider, type RawMetric } from "./types.ts";

const version = () => env("META_GRAPH_VERSION") || "v23.0";

function graph(path: string, token: string, query: Record<string, string | number>): string {
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])), access_token: token });
  return `https://graph.facebook.com/${version()}/${path}?${q}`;
}

interface InsightsTotal {
  data: Array<{ name: string; total_value?: { value: number } }>;
}
interface InsightsSeries {
  data: Array<{ name: string; values: Array<{ value: number }> }>;
}

/** Instagram Business/Creator account insights (daily totals). */
export const instagram: Provider = {
  id: "instagram",
  platforms: ["Instagram"],
  configured: () => Boolean(env("META_IG_USER_ID") && env("META_ACCESS_TOKEN")),
  async fetch(day) {
    const res = await getJson<InsightsTotal>(
      graph(`${env("META_IG_USER_ID")}/insights`, env("META_ACCESS_TOKEN"), {
        metric: "views,likes,shares",
        metric_type: "total_value",
        period: "day",
        since: day.startUnix,
        until: day.endUnix,
      }),
    );
    const get = (n: string) => res.data.find((d) => d.name === n)?.total_value?.value ?? 0;
    const m: RawMetric = { id: "instagram", name: "Instagram", views: get("views"), likes: get("likes"), shares: get("shares") };
    return { metrics: [m], topPosts: [] };
  },
};

/**
 * Facebook Page insights. Meta's per-day Page metrics don't map 1:1 onto our
 * shape: views = page_media_view; "likes" uses page_post_engagements as the
 * closest engagement proxy; shares isn't a separate daily Page metric.
 */
export const facebook: Provider = {
  id: "facebook",
  platforms: ["Facebook"],
  configured: () => Boolean(env("META_PAGE_ID") && env("META_PAGE_ACCESS_TOKEN")),
  async fetch(day) {
    const res = await getJson<InsightsSeries>(
      graph(`${env("META_PAGE_ID")}/insights`, env("META_PAGE_ACCESS_TOKEN"), {
        metric: "page_media_view,page_post_engagements",
        period: "day",
        since: day.startUnix,
        until: day.endUnix,
      }),
    );
    const get = (n: string) => res.data.find((d) => d.name === n)?.values?.[0]?.value ?? 0;
    const m: RawMetric = { id: "facebook", name: "Facebook", views: get("page_media_view"), likes: get("page_post_engagements"), shares: 0 };
    return { metrics: [m], topPosts: [] };
  },
};
