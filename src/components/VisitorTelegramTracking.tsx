"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type MutableRefObject } from "react";

type VisitorSession = {
  id: string;
  startedAt: number;
  entryPath: string;
  lastPath: string;
  pageCount: number;
  referrer: string;
  startSentAt?: number;
  activeDurationMs: number;
};

const enabled = process.env.NEXT_PUBLIC_TELEGRAM_VISITOR_ALERTS_ENABLED === "true";
const sessionKey = "805.visitorAlert.session";
const lastDepartureKey = "805.visitorAlert.lastDeparture";

export function VisitorTelegramTracking() {
  const pathname = usePathname();
  const activeStartedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const session = ensureSession();
    if (!session.startSentAt) {
      sendAlert("start", session);
      saveSession({ ...session, startSentAt: Date.now() });
    }

    activeStartedAt.current = document.visibilityState === "visible" ? Date.now() : null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        addActiveTime(activeStartedAt);
        sendDeparture("inactive");
      } else {
        activeStartedAt.current = Date.now();
      }
    };

    const handlePageHide = () => {
      addActiveTime(activeStartedAt);
      sendDeparture("pagehide");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const session = ensureSession();
    const currentPath = currentPathWithSearch();
    if (session.lastPath !== currentPath) {
      saveSession({
        ...session,
        lastPath: currentPath,
        pageCount: session.pageCount + 1,
      });
    }
  }, [pathname]);

  return null;
}

function ensureSession(): VisitorSession {
  const existing = readSession();
  if (existing) return existing;

  const path = currentPathWithSearch();
  const session: VisitorSession = {
    id: cryptoRandomId(),
    startedAt: Date.now(),
    entryPath: path,
    lastPath: path,
    pageCount: 1,
    referrer: document.referrer || "",
    activeDurationMs: 0,
  };
  saveSession(session);
  return session;
}

function readSession(): VisitorSession | null {
  try {
    const raw = window.sessionStorage.getItem(sessionKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VisitorSession;
    if (!parsed.id || !parsed.startedAt) return null;
    return {
      id: parsed.id,
      startedAt: parsed.startedAt,
      entryPath: parsed.entryPath || "/",
      lastPath: parsed.lastPath || parsed.entryPath || "/",
      pageCount: Math.max(1, Number(parsed.pageCount) || 1),
      referrer: parsed.referrer || "",
      startSentAt: parsed.startSentAt,
      activeDurationMs: Math.max(0, Number(parsed.activeDurationMs) || 0),
    };
  } catch {
    return null;
  }
}

function saveSession(session: VisitorSession) {
  try {
    window.sessionStorage.setItem(sessionKey, JSON.stringify(session));
  } catch {
    // Ignore storage failures; the route still accepts stateless events.
  }
}

function addActiveTime(activeStartedAt: MutableRefObject<number | null>) {
  if (!activeStartedAt.current) return;
  const session = ensureSession();
  const now = Date.now();
  saveSession({
    ...session,
    activeDurationMs: session.activeDurationMs + Math.max(0, now - activeStartedAt.current),
  });
  activeStartedAt.current = null;
}

function sendDeparture(reason: "inactive" | "pagehide") {
  const session = ensureSession();
  const now = Date.now();
  const durationMs = now - session.startedAt;
  const lastDeparture = readLastDeparture();

  if (lastDeparture && now - lastDeparture.sentAt < 15000) return;
  if (lastDeparture && durationMs - lastDeparture.durationMs < 15000) return;

  saveLastDeparture({ sentAt: now, durationMs });
  sendAlert("end", session, reason);
}

function readLastDeparture(): { sentAt: number; durationMs: number } | null {
  try {
    const raw = window.sessionStorage.getItem(lastDepartureKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sentAt?: number; durationMs?: number };
    if (!parsed.sentAt || typeof parsed.durationMs !== "number") return null;
    return { sentAt: parsed.sentAt, durationMs: parsed.durationMs };
  } catch {
    return null;
  }
}

function saveLastDeparture(value: { sentAt: number; durationMs: number }) {
  try {
    window.sessionStorage.setItem(lastDepartureKey, JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
}

function sendAlert(event: "start" | "end", session: VisitorSession, reason?: "inactive" | "pagehide") {
  const now = Date.now();
  const payload = {
    event,
    sessionId: session.id,
    path: currentPathWithSearch(),
    href: window.location.href,
    entryPath: session.entryPath,
    lastPath: session.lastPath,
    referrer: session.referrer,
    pageCount: session.pageCount,
    durationMs: now - session.startedAt,
    activeDurationMs: session.activeDurationMs,
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: event === "end" ? new Date(now).toISOString() : undefined,
    reason,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: {
      width: window.screen?.width,
      height: window.screen?.height,
    },
    utm: utmParams(),
  };

  const body = JSON.stringify(payload);
  if (event === "end" && navigator.sendBeacon) {
    const sent = navigator.sendBeacon("/api/visitor-alerts", new Blob([body], { type: "application/json" }));
    if (sent) return;
  }

  fetch("/api/visitor-alerts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    keepalive: event === "end",
  }).catch(() => {
    // Alerting is best effort.
  });
}

function currentPathWithSearch() {
  return `${window.location.pathname}${window.location.search}`;
}

function utmParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    source: params.get("utm_source") || undefined,
    medium: params.get("utm_medium") || undefined,
    campaign: params.get("utm_campaign") || undefined,
    content: params.get("utm_content") || undefined,
    term: params.get("utm_term") || undefined,
  };
}

function cryptoRandomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
