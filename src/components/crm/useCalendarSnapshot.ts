"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { CrmCalendarEvent, CrmJob } from "@/lib/crm/types";
import { weekCalendarDays } from "@/lib/crm/staff-week-calendar";
import { readCrmResponse } from "@/lib/crm/client-response";

type Snapshot = { events: CrmCalendarEvent[]; jobs: CrmJob[] };
export function useCalendarSnapshot(session: Session | null, enabled: boolean, anchorDate: string) {
  const days = weekCalendarDays(anchorDate);
  const start = days[0];
  const end = new Date(Date.parse(`${days[6]}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const [stored, setStored] = useState<{ owner: string; start: string; end: string; snapshot: Snapshot } | null>(null);
  const owner = session?.user.id;
  const snapshot = enabled && owner && stored?.owner === owner && stored.start === start && stored.end === end ? stored.snapshot : null;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const version = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!session || !enabled) return null;
    const current = ++version.current;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/crm/calendar/?start=${start}&end=${end}`, {
        signal: controller.signal, cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const body = await readCrmResponse(response, "/api/crm/calendar");
      if (!response.ok || !Array.isArray(body.events) || !Array.isArray(body.jobs)) throw new Error(typeof body.message === "string" ? body.message : "Calendar response is incomplete.");
      const next = body as Snapshot;
      if (current === version.current) setStored({ owner: session.user.id, start, end, snapshot: next });
      return next;
    } catch (reason) {
      if (current === version.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Calendar could not be loaded.");
      return null;
    } finally { if (current === version.current) { setLoading(false); pending.current = null; } }
  }, [session?.access_token, session?.user.id, enabled, start, end]);
  useEffect(() => {
    if (!enabled || !session) { setStored(null); return; }
    void refresh();
    const update = () => { if (document.visibilityState === "visible" && !pending.current) void refresh(); };
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { ++version.current; pending.current?.abort(); pending.current = null; clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [refresh, enabled, session?.user.id]);
  return { snapshot, error, loading, refresh };
}
