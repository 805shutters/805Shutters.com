import { createHash } from "node:crypto";

import { isFbc, isFbp, resolveFbc } from "@/lib/meta-click";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Email is trimmed and lowercased. Phone is digits only, with US country code 1. */
export function scheduleMatchingData(email: string, phone: string) {
  const normalizedEmail = email.trim().toLowerCase();
  let normalizedPhone = phone.replace(/\D/g, "");
  if (normalizedPhone.length === 10) normalizedPhone = `1${normalizedPhone}`;
  return {
    ...(normalizedEmail ? { em: [hash(normalizedEmail)] } : {}),
    ...(normalizedPhone ? { ph: [hash(normalizedPhone)] } : {}),
  };
}

export type MetaUserData = {
  em?: string[];
  ph?: string[];
  fbc?: string;
  fbp?: string;
  client_ip_address?: string;
  client_user_agent?: string;
};

export function clientIpFromForwarded(forwardedFor: string | null | undefined, realIp: string | null | undefined) {
  const first = forwardedFor?.split(",")[0]?.trim();
  const candidate = first || realIp?.trim() || "";
  if (!isClientIp(candidate)) return undefined;
  return candidate;
}

function isClientIp(value: string) {
  if (!value || value.length > 64) return false;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split(".").every((part) => Number(part) <= 255);
  }
  return value.includes(":") && /^[0-9a-fA-F:]+$/.test(value);
}

export function normalizeUserAgent(value: string | null | undefined) {
  const agent = value?.replace(/[\r\n]/g, " ").trim();
  if (!agent) return undefined;
  return agent.slice(0, 512);
}

export function clickUserData(input: {
  fbc?: string | null;
  fbp?: string | null;
  client_ip_address?: string | null;
  client_user_agent?: string | null;
}): Pick<MetaUserData, "fbc" | "fbp" | "client_ip_address" | "client_user_agent"> {
  const fbc = input.fbc && isFbc(input.fbc) ? input.fbc : undefined;
  const fbp = input.fbp && isFbp(input.fbp) ? input.fbp : undefined;
  const ip = clientIpFromForwarded(input.client_ip_address, null);
  const agent = normalizeUserAgent(input.client_user_agent);
  return {
    ...(fbc ? { fbc } : {}),
    ...(fbp ? { fbp } : {}),
    ...(ip ? { client_ip_address: ip } : {}),
    ...(agent ? { client_user_agent: agent } : {}),
  };
}

type ClickCarrier = {
  cookies: { get(name: string): { value: string } | undefined };
  headers: { get(name: string): string | null };
};

export function metaClickFromRequest(
  request: ClickCarrier,
  body?: { fbp?: unknown; fbc?: unknown; fbclid?: unknown },
  nowMs = Date.now(),
) {
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  const fbc = resolveFbc(
    [
      { fbc: request.cookies.get("_fbc")?.value, fbclid: request.cookies.get("805_fbclid")?.value },
      { fbc: text(body?.fbc), fbclid: text(body?.fbclid) },
    ],
    nowMs,
  );
  const fbp = request.cookies.get("_fbp")?.value || text(body?.fbp);
  return clickUserData({
    fbc,
    fbp,
    client_ip_address: clientIpFromForwarded(
      request.headers.get("x-forwarded-for"),
      request.headers.get("x-real-ip"),
    ),
    client_user_agent: request.headers.get("user-agent"),
  });
}

export function buildMetaUserData(input: {
  email?: string | null;
  phone?: string | null;
  click?: Pick<MetaUserData, "fbc" | "fbp" | "client_ip_address" | "client_user_agent">;
}): MetaUserData {
  return {
    ...scheduleMatchingData(input.email || "", input.phone || ""),
    ...clickUserData(input.click || {}),
  };
}

export function publicEventSourceUrl(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !/^(?:www\.)?805shutters\.com$/.test(url.hostname)) return fallback;
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export function cleanEventId(value: unknown) {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return /^[A-Za-z0-9_-]{8,80}$/.test(id) ? id : undefined;
}

export function isMetaBotOrPrefetch(headers: { get(name: string): string | null }) {
  const prefetch = [
    headers.get("next-router-prefetch"),
    headers.get("purpose"),
    headers.get("sec-purpose"),
    headers.get("x-middleware-prefetch"),
  ].filter(Boolean).join(" ");
  if (/prefetch/i.test(prefetch) || prefetch === "1") return true;
  const agent = headers.get("user-agent") || "";
  return /bot|crawl|spider|slurp|facebookexternalhit|lighthouse|pagespeed|headlesschrome|curl\/|wget\//i.test(agent);
}

/**
 * META_TEST_EVENT_CODE is the explicit Events Manager switch and is included
 * whenever it is set. META_CAPI_TEST_EVENT_CODE stays limited to preview and
 * the reserved production verification contact, because that variable is
 * already present for live traffic.
 */
export function metaTestEventCode(verificationMatch = false) {
  const explicit = process.env.META_TEST_EVENT_CODE?.trim();
  if (explicit) return explicit;
  const legacy = process.env.META_CAPI_TEST_EVENT_CODE?.trim();
  if (!legacy) return undefined;
  if (process.env.VERCEL_ENV === "preview" || verificationMatch) return legacy;
  return undefined;
}
