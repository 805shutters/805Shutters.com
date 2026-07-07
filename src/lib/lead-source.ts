export const leadSourceOptions = [
  "Google Search",
  "Google Ads",
  "Google Maps",
  "Yelp",
  "Nextdoor",
  "Facebook",
  "Instagram",
  "AI Chat",
  "Bing / Other Search",
  "Referral",
  "Repeat Customer",
  "Home Show / Event",
  "Yard Sign / Truck",
  "Flyer / Print",
  "Other"
] as const;

export type LeadAttributionSignals = {
  utmSource?: string | null;
  utmMedium?: string | null;
  gclid?: string | null;
  referrer?: string | null;
};

const paidMediums = new Set(["cpc", "ppc", "paid", "paidsearch", "paid_search", "sem"]);

const aiHosts = [
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
  "claude.ai",
  "you.com",
  "poe.com"
];

function referrerHost(referrer?: string | null) {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function matchUtmSource(source: string, medium: string) {
  if (/^(gbp|gmb|google[-_ ]?(maps|business))/.test(source)) return "Google Maps";
  if (source.includes("google")) return paidMediums.has(medium) ? "Google Ads" : "Google Search";
  if (/^(facebook|fb|meta)/.test(source)) return "Facebook";
  if (/^(instagram|ig)$/.test(source)) return "Instagram";
  if (source.includes("yelp")) return "Yelp";
  if (source.includes("nextdoor")) return "Nextdoor";
  if (/chatgpt|openai|perplexity|gemini|copilot|claude/.test(source)) return "AI Chat";
  if (/bing|duckduckgo|yahoo/.test(source)) return "Bing / Other Search";
  return null;
}

function matchReferrerHost(host: string) {
  if (host === "maps.google.com") return "Google Maps";
  if (host === "google.com" || host.endsWith(".google.com") || /^www\.google\./.test(host)) return "Google Search";
  if (host.endsWith("facebook.com") || host === "fb.com") return "Facebook";
  if (host.endsWith("instagram.com")) return "Instagram";
  if (host.endsWith("yelp.com")) return "Yelp";
  if (host.endsWith("nextdoor.com")) return "Nextdoor";
  if (aiHosts.some((item) => host === item || host.endsWith(`.${item}`))) return "AI Chat";
  if (host.endsWith("bing.com") || host.endsWith("duckduckgo.com") || host.includes("search.yahoo")) {
    return "Bing / Other Search";
  }
  return null;
}

/**
 * True when an insert/update failed only because the lead_source column has
 * not been added to the production schema yet (migration not applied).
 * Callers retry without the field so lead capture never breaks on deploy.
 */
export function isMissingLeadSourceColumnError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message || "";
  return message.includes("lead_source") && (error.code === "42703" || /column|schema cache/i.test(message));
}

/**
 * Best-effort marketing-channel classification from web attribution signals.
 * Returns null when nothing identifies the channel so the rep can ask the
 * customer and fill it in by hand.
 */
export function classifyLeadSource(signals: LeadAttributionSignals): string | null {
  if (signals.gclid?.trim()) return "Google Ads";

  const source = (signals.utmSource || "").trim().toLowerCase();
  const medium = (signals.utmMedium || "").trim().toLowerCase();
  if (source) {
    const fromUtm = matchUtmSource(source, medium);
    if (fromUtm) return fromUtm;
  }

  const host = referrerHost(signals.referrer);
  if (host) {
    const fromReferrer = matchReferrerHost(host);
    if (fromReferrer) return fromReferrer;
  }

  return null;
}
