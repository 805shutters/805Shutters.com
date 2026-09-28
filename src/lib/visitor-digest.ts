import { metaAttributionSource } from "./meta-booking-alert";

export function visitorSource(metadata: unknown): string {
  const value = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  if (["Facebook", "Instagram", "Facebook/Instagram"].includes(String(value.source))) return String(value.source);
  const referrer = typeof value.referrer === "string" ? value.referrer : "";
  const url = referrer && !referrer.includes("://") ? `https://${referrer}` : referrer;
  const meta = metaAttributionSource({ referrer: url, utmSource: typeof value.utm_source === "string" ? value.utm_source : null });
  if (meta) return meta;
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { /* Missing referrer. */ }
  if (host.includes("google.")) return "Google";
  if (host.includes("yelp.")) return "Yelp";
  return host.replace(/^www\./, "") || "Unknown";
}

export function buildDailyVisitorDigest(events: Array<{ metadata: unknown }>) {
  const counts = new Map<string, number>([["Facebook", 0], ["Instagram", 0], ["Facebook/Instagram", 0]]);
  for (const event of events) {
    const source = visitorSource(event.metadata);
    counts.set(source, (counts.get(source) || 0) + 1);
  }
  return ["805 daily site visit summary", `Total visits: ${events.length}`, "Traffic sources:",
    ...[...counts.entries()].sort(([a, ac], [b, bc]) => bc - ac || a.localeCompare(b))
      .map(([source, count]) => `${source === "Facebook/Instagram" ? "Facebook/Instagram (placement unknown)" : source}: ${count}`),
  ].join("\n");
}
