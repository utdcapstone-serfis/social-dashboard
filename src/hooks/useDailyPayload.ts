import { useCallback, useEffect, useRef, useState } from "react";
import type { DailyPayload } from "../types";
import { fetchPayload } from "../data/api";
import { isStale, nextMidnight } from "../lib/schedule";

const CACHE_KEY = "social-dashboard:payload:v2";
/** Give the server a head start: it refreshes its own cache at exactly 00:00 Chicago. */
const MIDNIGHT_GRACE_MS = 20_000;
const TICK_MS = 30_000;
const MIN_RETRY_MS = 60_000;

function readCache(): DailyPayload | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as DailyPayload) : null;
    return parsed && Array.isArray(parsed.metrics) && parsed.metrics.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(payload: DailyPayload): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable: in-memory state still works */
  }
}

export interface DailyPayloadState {
  payload: DailyPayload | null;
  loading: boolean;
  /** Wall-clock "now", refreshed every 30s, for countdowns. */
  now: Date;
  /** The next scheduled automatic refresh (00:00 America/Chicago). */
  nextRefresh: Date;
  /** True when the payload predates today's Chicago midnight. */
  stale: boolean;
  reload: () => void;
}

/**
 * Loads the dashboard payload and keeps it fresh:
 *  1. a timer targeted at the next 00:00 America/Chicago re-fetches the data;
 *  2. a 30s tick + tab-visibility check catches missed timers (sleeping laptops,
 *     throttled background tabs) by re-fetching whenever the payload is from a
 *     previous Chicago day.
 */
export function useDailyPayload(): DailyPayloadState {
  const [payload, setPayload] = useState<DailyPayload | null>(readCache);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const lastAttempt = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  const reload = useCallback(() => {
    inFlight.current?.abort();
    const ctl = new AbortController();
    inFlight.current = ctl;
    lastAttempt.current = Date.now();
    setLoading(true);
    fetchPayload(ctl.signal)
      .then((p) => {
        setPayload(p);
        writeCache(p);
      })
      .catch(() => {
        /* aborted by a newer request; keep showing the last good payload */
      })
      .finally(() => {
        if (inFlight.current === ctl) setLoading(false);
      });
  }, []);

  // Initial load.
  useEffect(() => {
    reload();
    return () => inFlight.current?.abort();
  }, [reload]);

  // (1) Midnight-Chicago timer, re-armed after every fire.
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const delay = nextMidnight(new Date()).getTime() - Date.now() + MIDNIGHT_GRACE_MS;
    const id = window.setTimeout(() => {
      reload();
      setEpoch((e) => e + 1);
    }, Math.max(delay, 1_000));
    return () => window.clearTimeout(id);
  }, [epoch, reload]);

  // (2) Safety net.
  const stale = payload ? isStale(payload.syncedAt, now) : false;
  useEffect(() => {
    const check = () => {
      const t = new Date();
      setNow(t);
      if (payload && isStale(payload.syncedAt, t) && Date.now() - lastAttempt.current > MIN_RETRY_MS) reload();
    };
    const id = window.setInterval(check, TICK_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [payload, reload]);

  return { payload, loading, now, nextRefresh: nextMidnight(now), stale, reload };
}
