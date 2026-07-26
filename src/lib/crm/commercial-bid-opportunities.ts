import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { getBrokeredGmailAccessToken } from "@/lib/crm/installation-invoices";

type CrmSupabaseClient = SupabaseClient;

type GmailHeader = {
  name: string;
  value: string;
};

type GmailPart = {
  mimeType?: string;
  headers?: GmailHeader[];
  body?: { data?: string };
  parts?: GmailPart[];
};

type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart;
};

type ListedGmailMessage = {
  id: string;
  threadId?: string;
};

export type CommercialBidPortal =
  | "PlanHub"
  | "PlanetBids"
  | "Public Purchase"
  | "Cal eProcure"
  | "Euna Supplier Network";

export type CommercialBidEmail = {
  messageId: string;
  threadId: string | null;
  from: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
};

export type CommercialBidOpportunity = {
  portal: CommercialBidPortal;
  projectName: string;
  location: string | null;
  city: string | null;
  state: string | null;
  bidDeadline: string | null;
  bidDeadlineText: string | null;
  solicitationId: string | null;
  scopeKeywords: string[];
  scopeSummary: string;
  sourceUrl: string | null;
  externalId: string;
  hasEstimateReviewData: boolean;
};

export type CommercialBidClassification = {
  portal: CommercialBidPortal | null;
  disposition: "opportunity" | "ignored";
  reason: string;
  opportunities: CommercialBidOpportunity[];
};

export type ProcessCommercialBidOpportunityOptions = {
  mailbox?: string;
  query?: string;
  maxResults?: number;
  messageIds?: string[];
  actorEmail?: string;
};

export type ProcessCommercialBidOpportunityResult = {
  mailbox: string;
  query: string;
  scanned: number;
  classified: number;
  leadsCreated: number;
  leadsUpdated: number;
  reviewsCreated: number;
  ignored: number;
  skipped: number;
  errors: number;
};

const DEFAULT_MAILBOX = "805@805shutters.com";
const DEFAULT_MAX_RESULTS = 50;

const portalMatchers: Array<{ portal: CommercialBidPortal; pattern: RegExp }> = [
  { portal: "PlanHub", pattern: /\b(?:planhub|planhubprojects\.com)\b/i },
  { portal: "PlanetBids", pattern: /\b(?:planetbids|pb system)\b/i },
  { portal: "Public Purchase", pattern: /\bpublic\s*purchase\b|publicpurchase\.com/i },
  { portal: "Cal eProcure", pattern: /\bcal\s*eprocure\b|caleprocure\.ca\.gov|pd\.dgs\.ca\.gov/i },
  { portal: "Euna Supplier Network", pattern: /\beuna\b|eunasolutions\.com|supplier\s*network/i }
];

const blockedSubjectPattern =
  /\b(password|passcode|one[- ]time|otp|verification|verify (?:your|email)|security code|registration confirmation|account activation|welcome to|profile update|trial ending|upgrade|subscription|newsletter|webinar|request a demo|book a demo|how (?:pro|to)|everything you need to know)\b/i;
const marketingPattern =
  /\b(find bid opportunities faster|supplier network pro|pricing plan|product update|free trial (?:is )?ending|schedule (?:a )?(?:call|demo)|sales consultation)\b/i;
const opportunityPattern =
  /\b(invitation to bid|invite to bid|itb|request for (?:proposal|quote|qualification)|rfp|rfq|ifb|solicitation|bid opportunity|bid notice|project match(?:es)?|daily project matches|bid due date|closing date)\b/i;

const tradeMatchers: Array<{ keyword: string; pattern: RegExp }> = [
  { keyword: "roller shades", pattern: /\broller shades?\b/i },
  { keyword: "solar shades", pattern: /\bsolar(?: roller)? shades?\b/i },
  { keyword: "blackout shades", pattern: /\bblackout (?:shades?|curtains?)\b/i },
  { keyword: "window shades", pattern: /\bwindow shades?\b/i },
  { keyword: "window blinds", pattern: /\bwindow blinds?\b/i },
  { keyword: "mini blinds", pattern: /\bmini[- ]?blinds?\b/i },
  { keyword: "aluminum blinds", pattern: /\balumin(?:um|ium) blinds?\b/i },
  { keyword: "faux wood blinds", pattern: /\bfaux[- ]?wood blinds?\b/i },
  { keyword: "window coverings", pattern: /\bwindow coverings?\b/i },
  { keyword: "window treatments", pattern: /\bwindow treatments?\b/i },
  { keyword: "drapery", pattern: /\bdraper(?:y|ies)\b/i },
  { keyword: "curtains", pattern: /\b(?:privacy|cubicle|window)?\s*curtains?\b/i },
  { keyword: "interior shutters", pattern: /\b(?:interior|plantation) shutters?\b/i },
  { keyword: "Division 12", pattern: /\bdivision\s*12\b|\b12\s*2[14]\s*\d{2}\b/i }
];

function cleanText(value: string | null | undefined, maxLength = 1000) {
  const cleaned = (value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function cleanMultiline(value: string | null | undefined, maxLength = 5000) {
  const cleaned = (value || "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned.slice(0, maxLength);
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

export function commercialBidHtmlToText(value: string) {
  return value
    .replace(
      /<a\b[^>]*href=(["'])(https?:\/\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, _quote, url: string, label: string) => `[${label.replace(/<[^>]+>/g, " ").trim()}](${url})`
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|th|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function messageBody(message: GmailMessage) {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (part: GmailPart | undefined) => {
    if (!part) return;
    if (part.body?.data && part.mimeType === "text/plain") plain.push(decodeBase64Url(part.body.data));
    if (part.body?.data && part.mimeType === "text/html") html.push(commercialBidHtmlToText(decodeBase64Url(part.body.data)));
    for (const child of part.parts || []) walk(child);
  };
  walk(message.payload);
  return cleanMultiline(plain.join("\n\n") || html.join("\n\n") || message.snippet || "");
}

function receivedAt(message: GmailMessage) {
  const dateHeader = header(message, "Date");
  const headerTime = Date.parse(dateHeader);
  if (Number.isFinite(headerTime)) return new Date(headerTime).toISOString();
  const internalTime = Number(message.internalDate || 0);
  return internalTime > 0 ? new Date(internalTime).toISOString() : new Date().toISOString();
}

function identifyPortal(value: string): CommercialBidPortal | null {
  return portalMatchers.find((candidate) => candidate.pattern.test(value))?.portal || null;
}

function scopeKeywords(value: string) {
  return tradeMatchers.filter((candidate) => candidate.pattern.test(value)).map((candidate) => candidate.keyword);
}

function markdownUrl(value: string) {
  return value.match(/\[[^\]]*(?:view|open|details|bid)[^\]]*\]\((https?:\/\/[^)\s]+)\)/i)?.[1] || null;
}

function normalizedExternalId(value: string) {
  return value
    .toLowerCase()
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 240);
}

function solicitationId(value: string) {
  const match =
    value.match(
      /\b(?:solicitation|bid|project|contract|rfp|rfq|ifb|itb)\s*(?:number|no\.?|#|id)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,})\b/i
    ) ||
    value.match(/\b(?:rfp|rfq|ifb|itb)\s*[:#-]\s*([A-Z0-9][A-Z0-9._/-]{2,})\b/i);
  return cleanText(match?.[1] || null, 120);
}

function parseLocation(value: string) {
  const labeled = value.match(
    /(?:project\s+location|location|city)\s*[:\-]\s*([^\n]{2,100})(?:\n|$)/i
  )?.[1];
  const california = value.match(/\b([A-Za-z][A-Za-z .'-]+),\s*(California|CA)\s+(\d{5}(?:-\d{4})?)\b/i);
  const location = cleanText(labeled || (california ? california[0] : null), 300);
  if (california) {
    return {
      location,
      city: cleanText(california[1], 120),
      state: "CA"
    };
  }
  return { location, city: null, state: null };
}

function parseBidDeadline(value: string) {
  const match = value.match(
    /(?:bid\s+due(?:\s+date)?|closing\s+date|response\s+deadline|proposal\s+due)\s*[:\-]?\s*\n?\s*([A-Za-z0-9,/: -]{6,60})/i
  );
  const text = cleanText(match?.[1]?.split(/\n/)[0] || null, 80);
  if (!text) return { date: null, text: null };

  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (numeric) {
    const year = numeric[3].length === 2 ? Number(`20${numeric[3]}`) : Number(numeric[3]);
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, text };
    }
  }

  const parsed = Date.parse(text);
  return {
    date: Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null,
    text
  };
}

function projectNameFromSubject(subject: string) {
  const cleaned = subject
    .replace(/^(?:re|fw|fwd)\s*:\s*/gi, "")
    .replace(
      /^(?:invitation to bid|invite to bid|itb|rfp|rfq|ifb|solicitation|bid opportunity|new opportunity|bid notice)\s*[:#-]\s*/i,
      ""
    )
    .replace(/\s*[-|]\s*(?:planetbids|public purchase|cal eprocure|euna supplier network|planhub).*$/i, "");
  if (!cleaned || /daily project matches|project notification|bid opportunit(?:y|ies)$/i.test(cleaned)) return null;
  return cleanText(cleaned, 300);
}

function projectNameFromBody(body: string) {
  const labeled = body.match(/(?:project\s+name|solicitation\s+title|bid\s+title|event\s+title)\s*[:\-]\s*([^\n]{3,300})/i)?.[1];
  return cleanText(labeled || null, 300);
}

function relevantScopeSummary(value: string) {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  const relevantIndex = lines.findIndex((line) => scopeKeywords(line).length > 0);
  if (relevantIndex < 0) return cleanText(value, 1000) || "";
  return cleanText(lines.slice(Math.max(0, relevantIndex - 1), relevantIndex + 3).join(" "), 1000) || "";
}

function buildOpportunity(
  portal: CommercialBidPortal,
  projectName: string,
  value: string,
  sourceUrl?: string | null
): CommercialBidOpportunity | null {
  const keywords = scopeKeywords(value);
  if (!keywords.length) return null;

  const location = parseLocation(value);
  const deadline = parseBidDeadline(value);
  const reference = solicitationId(value);
  const externalId = normalizedExternalId(
    reference || [projectName, location.location, deadline.date].filter(Boolean).join("-")
  );
  if (!externalId) return null;

  return {
    portal,
    projectName,
    location: location.location,
    city: location.city,
    state: location.state,
    bidDeadline: deadline.date,
    bidDeadlineText: deadline.text,
    solicitationId: reference,
    scopeKeywords: keywords,
    scopeSummary: relevantScopeSummary(value),
    sourceUrl: sourceUrl || markdownUrl(value),
    externalId,
    hasEstimateReviewData: Boolean(deadline.date && (location.location || reference) && keywords.length)
  };
}

function planHubProjects(body: string) {
  const pattern =
    /(?:^|\n\n)([^\n]{4,300})\n\n([A-Za-z][A-Za-z .'-]+,\s*(?:California|CA)\s+\d{5}(?:-\d{4})?)\n\n\[View\]\((https?:\/\/[^)\s]+)\)\n\n([\s\S]*?)(?=\n\n[^\n]{4,300}\n\n[A-Za-z][A-Za-z .'-]+,\s*(?:California|CA)\s+\d{5}(?:-\d{4})?\n\n\[View\]\(|\n\n\[View All ITBs\]|$)/gi;
  return [...body.matchAll(pattern)].map((match) => ({
    name: cleanText(match[1], 300),
    value: `${match[2]}\n${match[4]}`,
    url: match[3]
  }));
}

export function classifyCommercialBidEmail(email: CommercialBidEmail): CommercialBidClassification {
  const combined = `${email.from}\n${email.subject}\n${email.bodyText}`;
  if (/\b(?:dodge construction network|dodge data|construction\.com)\b/i.test(combined)) {
    return { portal: null, disposition: "ignored", reason: "Dodge is evaluation-only and its sales outreach is excluded.", opportunities: [] };
  }

  const portal = identifyPortal(`${email.from}\n${email.subject}`);
  if (!portal) return { portal: null, disposition: "ignored", reason: "Sender is not a monitored bid portal.", opportunities: [] };
  if (blockedSubjectPattern.test(email.subject)) {
    return { portal, disposition: "ignored", reason: "Account, registration, password, OTP, training, or marketing message.", opportunities: [] };
  }
  if (marketingPattern.test(`${email.subject}\n${email.bodyText.slice(0, 1200)}`) && !opportunityPattern.test(email.subject)) {
    return { portal, disposition: "ignored", reason: "Portal marketing or product-upgrade message.", opportunities: [] };
  }
  if (!opportunityPattern.test(combined)) {
    return { portal, disposition: "ignored", reason: "No bid invitation, solicitation, project match, or deadline signal.", opportunities: [] };
  }

  const opportunities: CommercialBidOpportunity[] = [];
  if (portal === "PlanHub" && /daily project matches/i.test(email.subject)) {
    for (const project of planHubProjects(email.bodyText)) {
      if (!project.name) continue;
      const opportunity = buildOpportunity(portal, project.name, project.value, project.url);
      if (opportunity) opportunities.push(opportunity);
    }
  } else {
    const projectName = projectNameFromBody(email.bodyText) || projectNameFromSubject(email.subject);
    if (projectName) {
      const opportunity = buildOpportunity(portal, projectName, `${email.subject}\n${email.bodyText}`);
      if (opportunity) opportunities.push(opportunity);
    }
  }

  if (!opportunities.length) {
    return {
      portal,
      disposition: "ignored",
      reason: "The email does not contain visible blinds, shades, shutters, drapery, curtain, window-treatment, or Division 12 scope.",
      opportunities: []
    };
  }
  return { portal, disposition: "opportunity", reason: "Relevant bid scope found.", opportunities };
}

export function buildCommercialBidGmailQuery(mailbox = DEFAULT_MAILBOX) {
  return [
    `to:${mailbox}`,
    "newer_than:30d",
    "(from:planhubprojects.com OR from:planetbids.com OR from:publicpurchase.com OR from:caleprocure.ca.gov OR from:dgs.ca.gov OR from:eunasolutions.com)"
  ].join(" ");
}

function envValue(keys: string[]) {
  return keys.map((key) => process.env[key]?.trim()).find(Boolean);
}

async function gmailAccessToken(mailbox: string) {
  const clientId = envValue(["GMAIL_805_CLIENT_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_ID"]);
  const clientSecret = envValue(["GMAIL_805_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALENDAR_CLIENT_SECRET"]);
  const refreshToken = envValue(["GMAIL_805_REFRESH_TOKEN", "GMAIL_REFRESH_TOKEN", "GOOGLE_CALENDAR_REFRESH_TOKEN"]);

  if (!clientId || !clientSecret || !refreshToken) {
    const brokered = await getBrokeredGmailAccessToken(mailbox);
    if (brokered) return brokered;
    throw new CrmAuthError(503, "Commercial bid email monitoring is not configured for the 805 mailbox.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const data = (await response.json().catch(() => null)) as { access_token?: string; error_description?: string; error?: string } | null;
  if (!response.ok || !data?.access_token) {
    throw new CrmAuthError(502, `Gmail token refresh failed: ${data?.error_description || data?.error || response.status}`);
  }
  return data.access_token;
}

async function gmailFetch<T>(token: string, path: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  if (!response.ok) throw new CrmAuthError(502, `Commercial bid Gmail request failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

function priorityForDeadline(deadline: string | null) {
  if (!deadline) return "normal";
  const days = Math.ceil((Date.parse(`${deadline}T23:59:59-07:00`) - Date.now()) / 86_400_000);
  return days <= 7 ? "high" : "normal";
}

function earliestDueDate(deadline: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  if (!deadline || deadline < today) return today;
  return deadline;
}

function gmailUrl(email: CommercialBidEmail) {
  return `https://mail.google.com/mail/u/0/#all/${email.threadId || email.messageId}`;
}

async function upsertOpportunity(
  supabase: CrmSupabaseClient,
  email: CommercialBidEmail,
  opportunity: CommercialBidOpportunity,
  actorEmail: string
) {
  const { data: existing, error: existingError } = await supabase
    .from("crm_commercial_accounts")
    .select("*")
    .eq("source_name", opportunity.portal)
    .eq("external_id", opportunity.externalId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const sourceEmail = {
    gmailMessageId: email.messageId,
    gmailThreadId: email.threadId,
    gmailUrl: gmailUrl(email),
    subject: email.subject,
    from: email.from,
    receivedAt: email.receivedAt
  };
  const meta = {
    ...(existing?.meta && typeof existing.meta === "object" ? existing.meta : {}),
    recordKind: "commercial_bid_opportunity",
    reviewStatus: "review_needed",
    portal: opportunity.portal,
    projectName: opportunity.projectName,
    location: opportunity.location,
    bidDeadline: opportunity.bidDeadline,
    bidDeadlineText: opportunity.bidDeadlineText,
    solicitationId: opportunity.solicitationId,
    scopeKeywords: opportunity.scopeKeywords,
    sourceEmail,
    lastOpportunityEmailAt: email.receivedAt
  };
  const tags = [
    ...new Set([
      ...(Array.isArray(existing?.tags) ? existing.tags.map(String) : []),
      "commercial-bid",
      "review-needed",
      opportunity.portal.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      ...opportunity.scopeKeywords.map((item) => item.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
    ])
  ];
  const accountPayload = {
    company_name: opportunity.projectName,
    account_type: "other",
    status: "review_needed",
    priority: priorityForDeadline(opportunity.bidDeadline),
    assigned_to: "Jessica",
    city: opportunity.city,
    state: opportunity.state || "CA",
    source_type: "bid_portal_email",
    source_name: opportunity.portal,
    source_url: opportunity.sourceUrl,
    source_checked_at: email.receivedAt,
    external_id: opportunity.externalId,
    next_action: `Review ${opportunity.portal} opportunity and confirm the window-covering scope before estimating.`,
    next_action_due: earliestDueDate(opportunity.bidDeadline),
    estimated_value: 0,
    notes: opportunity.scopeSummary,
    tags,
    do_not_email: true,
    meta
  };

  let account = existing;
  let created = false;
  if (existing) {
    const { data, error } = await supabase
      .from("crm_commercial_accounts")
      .update(accountPayload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    account = data;
  } else {
    const { data, error } = await supabase.from("crm_commercial_accounts").insert(accountPayload).select("*").single();
    if (error) {
      if (error.code !== "23505") throw new Error(error.message);
      const retry = await supabase
        .from("crm_commercial_accounts")
        .select("*")
        .eq("source_name", opportunity.portal)
        .eq("external_id", opportunity.externalId)
        .single();
      if (retry.error) throw new Error(retry.error.message);
      account = retry.data;
    } else {
      account = data;
      created = true;
    }
  }
  if (!account?.id) throw new Error("Commercial bid lead could not be resolved after upsert.");

  const { data: existingActivity, error: activityCheckError } = await supabase
    .from("crm_commercial_activities")
    .select("id")
    .eq("account_id", account.id)
    .eq("gmail_message_id", email.messageId)
    .maybeSingle();
  if (activityCheckError) throw new Error(activityCheckError.message);
  if (existingActivity) return { created, reviewCreated: false, skipped: true };

  const activityType = opportunity.hasEstimateReviewData ? "estimate_review" : "bid_invite";
  const { error: activityError } = await supabase.from("crm_commercial_activities").insert({
    account_id: account.id,
    activity_type: activityType,
    actor_email: actorEmail,
    subject: email.subject,
    body_preview: opportunity.scopeSummary,
    external_message_id: `${email.messageId}:${opportunity.externalId}`,
    gmail_message_id: email.messageId,
    gmail_thread_id: email.threadId,
    occurred_at: email.receivedAt,
    meta: {
      automatedSync: true,
      recordKind: opportunity.hasEstimateReviewData ? "commercial_estimate_review" : "commercial_bid_notice",
      reviewStatus: "review_needed",
      pricingStatus: "not_started",
      projectName: opportunity.projectName,
      portal: opportunity.portal,
      location: opportunity.location,
      bidDeadline: opportunity.bidDeadline,
      bidDeadlineText: opportunity.bidDeadlineText,
      solicitationId: opportunity.solicitationId,
      scopeKeywords: opportunity.scopeKeywords,
      gmailUrl: gmailUrl(email)
    }
  });
  if (activityError) throw new Error(activityError.message);
  return { created, reviewCreated: opportunity.hasEstimateReviewData, skipped: false };
}

export async function processCommercialBidOpportunityInbox(
  supabase: CrmSupabaseClient,
  options: ProcessCommercialBidOpportunityOptions = {}
): Promise<ProcessCommercialBidOpportunityResult> {
  const mailbox = (options.mailbox || process.env.COMMERCIAL_BID_MAILBOX || DEFAULT_MAILBOX).trim().toLowerCase();
  const query = options.query?.trim() || process.env.COMMERCIAL_BID_GMAIL_QUERY?.trim() || buildCommercialBidGmailQuery(mailbox);
  const maxResults = Math.min(
    Math.max(Math.trunc(options.maxResults || Number(process.env.COMMERCIAL_BID_GMAIL_MAX_RESULTS || DEFAULT_MAX_RESULTS)), 1),
    100
  );
  const actorEmail = options.actorEmail || "commercial-bid-monitor@805shutters.com";
  const token = await gmailAccessToken(mailbox);
  const listed = options.messageIds?.length
    ? options.messageIds.map((id) => ({ id }))
    : (
        await gmailFetch<{ messages?: ListedGmailMessage[] }>(
          token,
          `messages?${new URLSearchParams({ q: query, maxResults: String(maxResults) }).toString()}`
        )
      ).messages || [];

  const result: ProcessCommercialBidOpportunityResult = {
    mailbox,
    query,
    scanned: listed.length,
    classified: 0,
    leadsCreated: 0,
    leadsUpdated: 0,
    reviewsCreated: 0,
    ignored: 0,
    skipped: 0,
    errors: 0
  };

  for (const listedMessage of listed) {
    try {
      const message = await gmailFetch<GmailMessage>(token, `messages/${encodeURIComponent(listedMessage.id)}?format=full`);
      const email: CommercialBidEmail = {
        messageId: message.id,
        threadId: message.threadId || null,
        from: header(message, "From"),
        subject: header(message, "Subject"),
        bodyText: messageBody(message),
        receivedAt: receivedAt(message)
      };
      const classification = classifyCommercialBidEmail(email);
      if (classification.disposition === "ignored") {
        result.ignored += 1;
        continue;
      }
      result.classified += classification.opportunities.length;

      for (const opportunity of classification.opportunities) {
        const saved = await upsertOpportunity(supabase, email, opportunity, actorEmail);
        if (saved.skipped) {
          result.skipped += 1;
          continue;
        }
        if (saved.created) result.leadsCreated += 1;
        else result.leadsUpdated += 1;
        if (saved.reviewCreated) result.reviewsCreated += 1;
      }
    } catch (error) {
      console.warn("commercial bid email sync", listedMessage.id, error);
      result.errors += 1;
    }
  }

  return result;
}
