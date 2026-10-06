import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { DASHBOARD_TZ, isStale, nextMidnight } from "../src/lib/schedule.ts";
import { PROVIDERS, readCachedPayload, refresh } from "./aggregate.ts";

/**
 * Tiny BFF for the dashboard. It is the only place platform credentials exist:
 * the browser calls /api/metrics and never sees a token.
 *
 *   GET /api/metrics  -> cached DailyPayload (refreshed 00:00 America/Chicago)
 *   GET /api/health   -> config + schedule status (no secrets)
 *   everything else   -> static files from dist/ (production build)
 */
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const DIST = resolve("dist");
const RETRY_MS = 30 * 60_000;
const MAX_RETRIES = 4;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

let lastRefreshOk: string | null = null;
let nextRun: Date | null = null;

function json(res: ServerResponse, status: number, body: unknown, cache = "no-store"): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(body));
}

/** Runs a refresh; on partial failure retries a few times (30 min apart) before waiting for the next midnight. */
async function runRefresh(attempt = 0): Promise<void> {
  try {
    const { failures } = await refresh();
    lastRefreshOk = new Date().toISOString();
    if (failures > 0 && attempt < MAX_RETRIES) setTimeout(() => void runRefresh(attempt + 1), RETRY_MS).unref();
  } catch (err) {
    console.error(`[refresh] failed: ${(err as Error).message}`);
    if (attempt < MAX_RETRIES) setTimeout(() => void runRefresh(attempt + 1), RETRY_MS).unref();
  }
}

/** Arms a timer for the next 00:00 America/Chicago, then re-arms itself. */
function scheduleMidnight(): void {
  nextRun = nextMidnight(new Date());
  const delay = nextRun.getTime() - Date.now();
  console.log(`[schedule] next refresh ${nextRun.toISOString()} (00:00 ${DASHBOARD_TZ})`);
  setTimeout(() => {
    void runRefresh().finally(scheduleMidnight);
  }, delay).unref();
}

async function serveStatic(urlPath: string, res: ServerResponse): Promise<void> {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, "");
  let file = resolve(join(DIST, rel || "index.html"));
  if (file !== DIST && !file.startsWith(DIST + sep)) return json(res, 403, { error: "forbidden" });
  let body: Buffer;
  try {
    body = await readFile(file);
  } catch {
    file = join(DIST, "index.html"); // SPA fallback
    try {
      body = await readFile(file);
    } catch {
      return json(res, 404, { error: "dist/ not built. Run `npm run build`." });
    }
  }
  const immutable = file.includes(`${join(DIST, "assets")}`);
  res.writeHead(200, {
    "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "method not allowed" });

  if (url.pathname === "/api/metrics") {
    void readCachedPayload()
      .then(async (cached) => {
        if (cached && !isStale(cached.syncedAt)) return json(res, 200, cached, "public, max-age=60");
        // Cold start or missed midnight: refresh once, serve whatever we have.
        const { payload } = await refresh();
        lastRefreshOk = new Date().toISOString();
        return json(res, 200, payload, "public, max-age=60");
      })
      .catch((err: Error) => {
        console.error(`[api] ${err.message}`);
        return json(res, 502, { error: "upstream refresh failed" });
      });
    return;
  }

  if (url.pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      timezone: DASHBOARD_TZ,
      nextRefresh: nextRun?.toISOString() ?? null,
      lastRefreshOk,
      providers: Object.fromEntries(PROVIDERS.map((p) => [p.id, p.configured()])),
    });
  }

  void serveStatic(url.pathname, res).catch(() => json(res, 500, { error: "internal error" }));
});

server.listen(PORT, HOST, () => {
  console.log(`[server] http://${HOST}:${PORT}  providers: ${PROVIDERS.filter((p) => p.configured()).map((p) => p.id).join(", ") || "none (demo data)"}`);
  scheduleMidnight();
  // Warm the cache on boot if today's data isn't there yet.
  void readCachedPayload().then((c) => {
    if (!c || isStale(c.syncedAt)) void runRefresh();
  });
});
