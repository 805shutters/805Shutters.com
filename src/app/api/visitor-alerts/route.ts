import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/notify/telegram";
import { isPublicFacingPath } from "@/lib/public-activity";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type VisitorAlertPayload = {
  event?: unknown;
  sessionId?: unknown;
  path?: unknown;
  href?: unknown;
  entryPath?: unknown;
  lastPath?: unknown;
  referrer?: unknown;
  pageCount?: unknown;
  durationMs?: unknown;
  activeDurationMs?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  reason?: unknown;
  timeZone?: unknown;
  screen?: {
    width?: unknown;
    height?: unknown;
  };
  utm?: {
    source?: unknown;
    medium?: unknown;
    campaign?: unknown;
    content?: unknown;
    term?: unknown;
  };
};

const eventLabels = {
  start: "805 site visitor",
  end: "805 visit ended",
  update: "805 visit update",
};

export async function POST(request: NextRequest) {
  if (!requestComesFromSite(request)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const payload = await readPayload(request);
  if (!payload) {
    return NextResponse.json({ message: "Invalid visitor alert payload" }, { status: 400 });
  }

  const event = normalizeEvent(payload.event);
  if (!event) {
    return NextResponse.json({ message: "Invalid visitor alert event" }, { status: 400 });
  }

  const alertPath = cleanString(payload.path, 300) || cleanPathFromHref(payload.href) || "/";
  const entryPath = cleanString(payload.entryPath, 300);
  const lastPath = cleanString(payload.lastPath, 300);
  if (
    !isPublicFacingPath(alertPath) ||
    (entryPath && !isPublicFacingPath(entryPath)) ||
    (lastPath && !isPublicFacingPath(lastPath))
  ) {
    return NextResponse.json({ sent: false, skipped: "non_public_path" });
  }

  const userAgent = request.headers.get("user-agent") || "";
  if (isLikelyBot(userAgent)) {
    return NextResponse.json({ sent: false, skipped: "bot" });
  }

  // A visit is recorded once, when it starts. The hourly cron produces the
  // compact Telegram digest instead of sending a message for every event.
  if (event !== "start") return NextResponse.json({ sent: false, queued: false, skipped: "not_start" });

  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ sent: false, queued: false, skipped: "database_not_configured" });

  const { error } = await supabase.from("visitor_alert_events").insert({
    viewed_at: parseViewedAt(payload.startedAt),
    referrer: cleanReferrer(payload.referrer) || null,
    location: geoLabel(request) || null,
  });
  if (error) {
    console.warn("Could not queue visitor alert:", error.message);
    return NextResponse.json({ sent: false, queued: false, error: "visitor_alert_queue_failed" }, { status: 503 });
  }

  return NextResponse.json({ sent: false, queued: true });
}

export async function GET(request: NextRequest) {
  if (!hasCronAccess(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ sent: false, skipped: "database_not_configured" }, { status: 503 });

  const { data: events, error } = await supabase
    .from("visitor_alert_events")
    .select("id, viewed_at, referrer, location")
    .is("sent_at", null)
    .order("viewed_at", { ascending: true })
    .limit(150);
  if (error) {
    console.warn("Could not read visitor alert digest:", error.message);
    return NextResponse.json({ sent: false, error: "visitor_alert_digest_failed" }, { status: 503 });
  }
  if (!events?.length) return NextResponse.json({ sent: false, count: 0 });

  const result = await sendTelegramMessage({ text: buildHourlyDigest(events) });
  if (!result.sent) return NextResponse.json({ ...result, count: events.length }, { status: 503 });

  const { error: markSentError } = await supabase
    .from("visitor_alert_events")
    .update({ sent_at: new Date().toISOString() })
    .in("id", events.map((event) => event.id));
  if (markSentError) console.warn("Could not mark visitor digest events sent:", markSentError.message);

  return NextResponse.json({ ...result, count: events.length });
}

async function readPayload(request: NextRequest): Promise<VisitorAlertPayload | null> {
  try {
    const body = await request.text();
    if (!body) return null;
    return JSON.parse(body) as VisitorAlertPayload;
  } catch {
    return null;
  }
}

function normalizeEvent(value: unknown): keyof typeof eventLabels | null {
  if (value === "start" || value === "end" || value === "update") return value;
  return null;
}

function buildHourlyDigest(events: Array<{ viewed_at: string; referrer: string | null; location: string | null }>) {
  return [
    `805 visitor update (${events.length})`,
    ...events.map((event) => [
      formatViewedAt(event.viewed_at),
      event.referrer || "Direct",
      event.location || "Unknown location",
    ].join(" | ")),
  ].join("\n");
}

function formatViewedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function parseViewedAt(value: unknown) {
  if (typeof value !== "string") return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function hasCronAccess(request: NextRequest) {
  const secret = process.env.VISITOR_ALERTS_CRON_SECRET || process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function cleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanPathFromHref(value: unknown) {
  const href = cleanString(value, 300);
  if (!href) return "";
  try {
    const url = new URL(href);
    return `${url.pathname}${url.search}`.slice(0, 180);
  } catch {
    return "";
  }
}

function cleanReferrer(value: unknown) {
  const referrer = cleanString(value, 240);
  if (!referrer) return "";
  try {
    const url = new URL(referrer);
    if (isAllowedHost(url.hostname)) return "";
    return `${url.hostname}${url.pathname}`.slice(0, 160);
  } catch {
    return referrer.slice(0, 160);
  }
}

function clampNumber(value: unknown, min: number, max: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(number, max));
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function screenLabel(screen: VisitorAlertPayload["screen"]) {
  const width = clampNumber(screen?.width, 0, 10000);
  const height = clampNumber(screen?.height, 0, 10000);
  if (!width || !height) return "";
  return `${Math.round(width)}x${Math.round(height)}`;
}

function utmLabels(utm: VisitorAlertPayload["utm"]) {
  if (!utm) return [];
  const parts = [
    cleanString(utm.source, 64) ? `source=${cleanString(utm.source, 64)}` : null,
    cleanString(utm.medium, 64) ? `medium=${cleanString(utm.medium, 64)}` : null,
    cleanString(utm.campaign, 96) ? `campaign=${cleanString(utm.campaign, 96)}` : null,
    cleanString(utm.content, 96) ? `content=${cleanString(utm.content, 96)}` : null,
    cleanString(utm.term, 96) ? `term=${cleanString(utm.term, 96)}` : null,
  ].filter(Boolean);
  return parts.length ? [`UTM: ${parts.join(" | ")}`] : [];
}

function geoLabel(request: NextRequest) {
  const city = decodeHeader(request.headers.get("x-vercel-ip-city"));
  const region = decodeHeader(request.headers.get("x-vercel-ip-country-region"));
  const country = decodeHeader(request.headers.get("x-vercel-ip-country"));
  return [city, region, country].filter(Boolean).join(", ");
}

function decodeHeader(value: string | null) {
  if (!value) return "";
  try {
    return decodeURIComponent(value).trim().slice(0, 80);
  } catch {
    return value.trim().slice(0, 80);
  }
}

function deviceLabel(userAgent: string) {
  if (!userAgent) return "";
  const browser = userAgent.includes("Edg/")
    ? "Edge"
    : userAgent.includes("Chrome/")
      ? "Chrome"
      : userAgent.includes("Firefox/")
        ? "Firefox"
        : userAgent.includes("Safari/")
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad|iPod/.test(userAgent)
    ? "iOS"
    : userAgent.includes("Android")
      ? "Android"
      : userAgent.includes("Mac OS X")
        ? "macOS"
        : userAgent.includes("Windows")
          ? "Windows"
          : "OS";
  const device = /iPad|Tablet/.test(userAgent) ? "Tablet" : /Mobile|iPhone|Android/.test(userAgent) ? "Mobile" : "Desktop";
  return `${device} / ${browser} / ${os}`;
}

function isLikelyBot(userAgent: string) {
  return /bot|crawl|spider|slurp|facebookexternalhit|preview|lighthouse|pagespeed|headless|curl|wget/i.test(userAgent);
}

function requestComesFromSite(request: NextRequest) {
  const originHost = headerHost(request.headers.get("origin"));
  const referrerHost = headerHost(request.headers.get("referer"));
  const currentHost = headerHost(request.headers.get("host"));

  if (originHost && (isAllowedHost(originHost) || originHost === currentHost)) return true;
  if (referrerHost && (isAllowedHost(referrerHost) || referrerHost === currentHost)) return true;
  return process.env.NODE_ENV !== "production";
}

function headerHost(value: string | null) {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.split(":")[0]?.toLowerCase() || "";
  }
}

function isAllowedHost(host: string) {
  return (
    host === "805shutters.com" ||
    host === "www.805shutters.com" ||
    host.endsWith("-805-shutters.vercel.app") ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}
