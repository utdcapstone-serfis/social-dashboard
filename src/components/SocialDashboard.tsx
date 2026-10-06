import { useMemo, useState } from "react";
import {
  Area,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, CalendarClock, CheckCircle2, RefreshCw, Timer, Unplug } from "lucide-react";
import type { DailyPayload, PlatformDailyMetric, TopPost } from "../types";
import { PLATFORM_META } from "../data/mockData";
import { useDailyPayload } from "../hooks/useDailyPayload";
import { DASHBOARD_TZ } from "../lib/schedule";
import { cn, formatClockTime, formatCompact, formatCountdown, formatFull, formatPercent } from "../lib/utils";

/**
 * Some brand colors (Threads black, LinkedIn navy) vanish on the dark theme,
 * so charts use these lifted variants. PLATFORM_META itself is untouched.
 */
const DARK_COLOR: Partial<Record<string, string>> = {
  Threads: "#E4E4E7",
  LinkedIn: "#3B82C4",
  Facebook: "#4C8DF6",
  YouTube: "#FF4E45",
};
const colorOf = (name: PlatformDailyMetric["name"]): string => DARK_COLOR[name] ?? PLATFORM_META[name].color;

const NA = "n/a";
const pct = (ratio: number): string => (ratio > 0 ? formatPercent(ratio) : NA);

/* ------------------------------ small parts ------------------------------ */

function Delta({ value, className }: { value: number; className?: string }) {
  const up = value >= 0;
  return (
    <span className={cn("inline-flex items-center font-medium tabular-nums", up ? "text-up" : "text-down", className)}>
      {up ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
      {formatPercent(Math.abs(value))}
      <span className="sr-only"> {up ? "up" : "down"} versus yesterday</span>
    </span>
  );
}

function Kpi({ label, value, hint, delta }: { label: string; value: string; hint: string; delta?: number }) {
  return (
    <div className="panel justify-between px-4 py-2.5">
      <div className="panel-title">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold leading-tight tabular-nums text-ink">{value}</span>
        {delta !== undefined && <Delta value={delta} className="text-xs" />}
      </div>
      <div className="text-[11px] text-ink-faint">{hint}</div>
    </div>
  );
}

function PlatformBadge({ name, size = "h-5 w-5" }: { name: PlatformDailyMetric["name"]; size?: string }) {
  const meta = PLATFORM_META[name];
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded text-[9px] font-bold", size)}
      style={{ backgroundColor: colorOf(name), color: DARK_COLOR[name] ? "#06030F" : meta.onColor }}
      aria-hidden
    >
      {meta.badge}
    </span>
  );
}

interface ChartDatum {
  id: string;
  label: string;
  views: number;
  color: string;
}

const tooltipStyle = {
  background: "#0F032D",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 8,
  fontSize: 12,
  color: "#EFEFEF",
  padding: "6px 10px",
} as const;

/* -------------------------------- panels -------------------------------- */

function BreakdownPanel({
  data,
  hidden,
  onToggle,
  onReset,
}: {
  data: ChartDatum[];
  hidden: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  const total = data.reduce((s, d) => s + d.views, 0);
  const visible = data.filter((d) => !hidden.has(d.id));
  const visibleTotal = visible.reduce((s, d) => s + d.views, 0);

  return (
    <section className="panel p-3" aria-labelledby="breakdown-h">
      <div className="flex items-center justify-between">
        <h2 id="breakdown-h" className="panel-title">
          Views by platform
        </h2>
        <button
          type="button"
          onClick={onReset}
          disabled={hidden.size === 0}
          className="text-[11px] font-medium text-violet-soft hover:underline disabled:opacity-0"
        >
          Show all
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {visible.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={visible}
                dataKey="views"
                nameKey="label"
                innerRadius="64%"
                outerRadius="94%"
                paddingAngle={2}
                stroke="#0F032D"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {visible.map((d) => (
                  <Cell key={d.id} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: "#EFEFEF" }}
                formatter={(v: number, _n, item) => [
                  `${formatFull(v)} · ${formatPercent(v / visibleTotal)}`,
                  (item.payload as ChartDatum).label,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-xs text-ink-muted">
            All platforms hidden.
          </div>
        )}
        {visible.length > 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-wider text-ink-faint">
              {visible.length}/{data.length} platforms
            </span>
            <span className="text-2xl font-bold tabular-nums">{formatCompact(visibleTotal)}</span>
          </div>
        )}
      </div>

      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5" aria-label="Chart legend, toggle platforms">
        {data.map((d) => {
          const off = hidden.has(d.id);
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onToggle(d.id)}
                aria-pressed={!off}
                className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] hover:bg-white/5"
              >
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-sm", off && "opacity-30")}
                  style={{ backgroundColor: d.color }}
                  aria-hidden
                />
                <span className={cn("flex-1 truncate", off ? "text-ink-faint line-through" : "text-ink")}>{d.label}</span>
                <span className="tabular-nums text-ink-faint">{formatPercent(d.views / total, 0)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TrendPanel({ payload }: { payload: DailyPayload }) {
  const data = useMemo(
    () =>
      (payload.history ?? []).map((p) => ({
        label: p.date.slice(5),
        views: p.views,
        engagement: p.views > 0 ? (p.likes + p.shares) / p.views : 0,
      })),
    [payload.history],
  );

  return (
    <section className="panel p-3" aria-labelledby="trend-h">
      <div className="flex items-center justify-between">
        <h2 id="trend-h" className="panel-title">
          Engagement trend · {data.length || 0}d
        </h2>
        <div className="flex gap-3 text-[10px] text-ink-faint">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-3 rounded-sm bg-violet-bright" aria-hidden /> Views
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 bg-accent-fuchsia" aria-hidden /> Engagement rate
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 pt-1">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#905BF4" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#905BF4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: "#8A82A6", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis yAxisId="v" tick={{ fill: "#8A82A6", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={formatCompact} width={44} />
              <YAxis yAxisId="e" orientation="right" hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number, name) => (name === "views" ? [formatFull(v), "Views"] : [formatPercent(v, 2), "Engagement"])}
              />
              <Area yAxisId="v" type="monotone" dataKey="views" stroke="#905BF4" strokeWidth={2} fill="url(#viewsFill)" isAnimationActive={false} />
              <Line yAxisId="e" type="monotone" dataKey="engagement" stroke="#D946EF" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-xs text-ink-muted">
            Trend appears after the second daily sync.
          </div>
        )}
      </div>
    </section>
  );
}

function TopPostsPanel({ posts }: { posts: TopPost[] }) {
  return (
    <section className="panel p-3" aria-labelledby="posts-h">
      <h2 id="posts-h" className="panel-title">
        Top posts
      </h2>
      {posts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-ink-muted">No post-level data yet.</div>
      ) : (
        <ol className="mt-1.5 flex min-h-0 flex-1 flex-col justify-between gap-1">
          {posts.slice(0, 5).map((p, i) => {
            const body = (
              <>
                <span className="w-3 font-mono text-[10px] text-ink-faint">{i + 1}</span>
                <PlatformBadge name={p.platform} size="h-4 w-4" />
                <span className="min-w-0 flex-1 truncate text-xs text-ink">{p.title}</span>
                <span className="text-xs font-semibold tabular-nums text-ink">{formatCompact(p.views)}</span>
                <span className="w-12 text-right text-[11px] tabular-nums text-ink-faint">♥ {formatCompact(p.likes)}</span>
              </>
            );
            return (
              <li key={p.id}>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5">
                    {body}
                  </a>
                ) : (
                  <div className="flex items-center gap-2 px-1 py-0.5">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function PlatformTable({
  payload,
  hidden,
}: {
  payload: DailyPayload;
  hidden: ReadonlySet<string>;
}) {
  const rows = useMemo(() => [...payload.metrics].sort((a, b) => b.views - a.views), [payload.metrics]);
  const maxViews = Math.max(1, ...rows.map((r) => r.views));

  return (
    <section className="panel p-3" aria-labelledby="platforms-h">
      <h2 id="platforms-h" className="panel-title">
        Platform overview
      </h2>
      <div className="mt-1.5 grid grid-cols-[minmax(0,1.5fr)_1fr_0.8fr_0.8fr_0.8fr] gap-x-2 border-b border-white/10 pb-1 text-[10px] uppercase tracking-wider text-ink-faint">
        <span>Platform</span>
        <span className="text-right">Views</span>
        <span className="text-right">Retain</span>
        <span className="text-right">Likes/v</span>
        <span className="text-right">Share</span>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col">
        {rows.map((m) => {
          const prev = payload.previousViews[m.id] ?? 0;
          const delta = prev > 0 ? (m.views - prev) / prev : 0;
          return (
            <li
              key={m.id}
              className={cn(
                "grid min-h-0 flex-1 grid-cols-[minmax(0,1.5fr)_1fr_0.8fr_0.8fr_0.8fr] items-center gap-x-2 border-b border-white/5 text-xs last:border-0",
                hidden.has(m.id) && "opacity-45",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <PlatformBadge name={m.name} />
                <span className="truncate font-medium">{PLATFORM_META[m.name].label}</span>
              </span>
              <span className="flex flex-col items-end leading-tight">
                <span className="font-semibold tabular-nums">{formatCompact(m.views)}</span>
                <Delta value={delta} className="text-[10px]" />
              </span>
              <span className="text-right tabular-nums text-ink-muted">{pct(m.retentionRate)}</span>
              <span className="text-right tabular-nums text-ink-muted">{pct(m.likesPerView)}</span>
              <span className="text-right tabular-nums text-ink-muted">{pct(m.shareRate)}</span>
              <span className="col-span-5 -mt-0.5 hidden h-0.5 overflow-hidden rounded-full bg-white/5 2xl:block" aria-hidden>
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(m.views / maxViews) * 100}%`, backgroundColor: colorOf(m.name) }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      {(payload.unconnected?.length ?? 0) > 0 && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-ink-faint">
          <Unplug className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>Not connected: {payload.unconnected!.map((n) => PLATFORM_META[n].label).join(", ")}</span>
        </div>
      )}
    </section>
  );
}

/* --------------------------------- page --------------------------------- */

export default function SocialDashboard() {
  const { payload, loading, now, nextRefresh, stale, reload } = useDailyPayload();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stats = useMemo(() => {
    if (!payload) return null;
    const totalViews = payload.metrics.reduce((s, m) => s + m.views, 0);
    const prevTotal = Object.values(payload.previousViews).reduce((s, v) => s + v, 0);
    const weighted = (pick: (m: PlatformDailyMetric) => number) => {
      // Skip platforms that don't report the metric (value 0) so they don't drag the average down.
      const rows = payload.metrics.filter((m) => pick(m) > 0);
      const w = rows.reduce((s, m) => s + m.views, 0);
      return w > 0 ? rows.reduce((s, m) => s + pick(m) * m.views, 0) / w : 0;
    };
    const chart: ChartDatum[] = [...payload.metrics]
      .sort((a, b) => b.views - a.views)
      .map((m) => ({ id: m.id, label: PLATFORM_META[m.name].label, views: m.views, color: colorOf(m.name) }));
    return {
      totalViews,
      delta: prevTotal > 0 ? (totalViews - prevTotal) / prevTotal : undefined,
      retention: weighted((m) => m.retentionRate),
      likes: weighted((m) => m.likesPerView),
      share: weighted((m) => m.shareRate),
      chart,
    };
  }, [payload]);

  const isDemo = payload?.source !== "live";

  return (
    <div className="flex flex-col gap-3 p-3 lg:h-screen lg:overflow-hidden">
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-bright to-accent-blue font-mono text-sm font-bold text-white shadow-glow" aria-hidden>
            S
          </span>
          <div className="leading-tight">
            <h1 className="text-base font-semibold tracking-tight">Social Command Center</h1>
            <p className="text-[11px] text-ink-faint">Daily performance across {payload?.metrics.length ?? "—"} connected platforms</p>
          </div>
          <span
            className={cn(
              "chip ml-1",
              isDemo ? "border-warn/40 text-warn" : "border-up/40 text-up",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", isDemo ? "bg-warn" : "bg-up")} aria-hidden />
            {isDemo ? "Demo data" : "Live"}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-ink-muted" role="status" aria-live="polite">
          <span className="chip">
            {stale ? <CalendarClock className="h-3 w-3 text-warn" aria-hidden /> : <CheckCircle2 className="h-3 w-3 text-up" aria-hidden />}
            {payload ? `Updated ${formatClockTime(payload.syncedAt, DASHBOARD_TZ)}` : "Loading…"}
          </span>
          <span className="chip">
            <Timer className="h-3 w-3" aria-hidden />
            Next refresh 12:00 AM CT · in{" "}
            <strong className="tabular-nums text-ink">{formatCountdown(nextRefresh.getTime() - now.getTime())}</strong>
          </span>
          <button type="button" onClick={reload} disabled={loading} className="btn-primary">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
            {loading ? "Loading…" : "Reload"}
          </button>
        </div>
      </header>

      {!payload || !stats ? (
        <div className="panel flex flex-1 items-center justify-center text-sm text-ink-muted">Loading analytics…</div>
      ) : (
        <>
          {/* KPI row */}
          <section aria-label="Totals" className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Total views" value={formatCompact(stats.totalViews)} delta={stats.delta} hint="vs yesterday" />
            <Kpi label="Avg. retention" value={pct(stats.retention)} hint="Weighted by views · where reported" />
            <Kpi label="Avg. likes / view" value={pct(stats.likes)} hint="Weighted by views" />
            <Kpi label="Avg. share rate" value={pct(stats.share)} hint="Weighted by views" />
          </section>

          {/* Main grid fills the remaining height; every panel manages its own overflow. */}
          <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="grid min-h-[22rem] lg:col-span-3 lg:min-h-0">
              <BreakdownPanel data={stats.chart} hidden={hidden} onToggle={toggle} onReset={() => setHidden(new Set())} />
            </div>
            <div className="grid min-h-[28rem] grid-rows-[1.15fr_1fr] gap-3 lg:col-span-5 lg:min-h-0">
              <TrendPanel payload={payload} />
              <TopPostsPanel posts={payload.topPosts ?? []} />
            </div>
            <div className="grid min-h-[26rem] lg:col-span-4 lg:min-h-0">
              <PlatformTable payload={payload} hidden={hidden} />
            </div>
          </main>
        </>
      )}
    </div>
  );
}
