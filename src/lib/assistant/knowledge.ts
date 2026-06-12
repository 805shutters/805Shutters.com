import {
  buildBookingAvailability,
  losAngelesDateString,
  monthRangeUtc
} from "@/lib/booking/availability";
import type { CrmCalendarEvent } from "@/lib/crm/types";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { allPages, normalizePath, services, site, type SitePage } from "@/lib/site-data";

export type AssistantRole = "user" | "assistant";

export type AssistantMessage = {
  role: AssistantRole;
  content: string;
};

export type AssistantLink = {
  label: string;
  href: string;
};

export type SchedulingContext = {
  configured: boolean;
  text: string;
  links: AssistantLink[];
};

export type AssistantKnowledgeContext = {
  businessFacts: string[];
  links: AssistantLink[];
  pageSnippets: string[];
  scheduling?: SchedulingContext;
};

const stopWords = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "ask",
  "can",
  "for",
  "from",
  "has",
  "have",
  "how",
  "into",
  "our",
  "the",
  "their",
  "them",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "you",
  "your"
]);

const schedulingTerms = [
  "appointment",
  "availability",
  "available",
  "book",
  "calendar",
  "consultation",
  "estimate",
  "free consultation",
  "in-home",
  "measure",
  "schedule",
  "scheduling",
  "slot",
  "time",
  "visit"
];

export function redactPersonalDetails(text: string) {
  let redacted = text;
  let changed = false;

  const replacements: Array<[RegExp, string]> = [
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email removed]"],
    [/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, "[phone removed]"],
    [
      /\b\d{1,6}\s+[A-Z0-9.'-]+(?:\s+[A-Z0-9.'-]+){0,4}\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|place|pl|boulevard|blvd|circle|cir|way)\b/gi,
      "[address removed]"
    ]
  ];

  for (const [pattern, placeholder] of replacements) {
    redacted = redacted.replace(pattern, () => {
      changed = true;
      return placeholder;
    });
  }

  return {
    redacted,
    detected: changed
  };
}

export function isSchedulingQuestion(text: string) {
  const normalized = text.toLowerCase();
  return schedulingTerms.some((term) => normalized.includes(term));
}

export async function buildAssistantKnowledge({
  question,
  pagePath
}: {
  question: string;
  pagePath?: string;
}): Promise<AssistantKnowledgeContext> {
  const pageMatches = matchPages(question, pagePath);
  const scheduling = isSchedulingQuestion(question) ? await getSchedulingContext() : undefined;
  const links = uniqueLinks([
    ...pageMatches.map((match) => ({
      label: match.page.h1,
      href: match.page.path
    })),
    ...(scheduling?.links || []),
    { label: "Book a consultation", href: "/book-consultation/" },
    { label: "FAQ", href: "/faq/" }
  ]).slice(0, 5);

  return {
    businessFacts: [
      `${site.name} serves ${site.serviceArea}, including ${site.areas.join(", ")}.`,
      `The main products are ${services.map((service) => service.shortTitle).join(", ")}.`,
      "A free consultation helps compare products, confirm measurements, review light and privacy goals, and plan installation details.",
      "The website assistant should not collect names, phone numbers, email addresses, or street addresses. Visitors should use the booking form or phone link when they are ready to share contact details."
    ],
    links,
    pageSnippets: pageMatches.map(({ page }) => pageSnippet(page)),
    scheduling
  };
}

export function buildLocalAssistantReply({
  question,
  context,
  personalDetailsDetected
}: {
  question: string;
  context: AssistantKnowledgeContext;
  personalDetailsDetected: boolean;
}) {
  const normalized = question.toLowerCase();
  const parts: string[] = [];

  if (personalDetailsDetected) {
    parts.push(
      "I removed contact details from this chat. I can answer product and scheduling questions here, but booking details should go through the booking form or a call."
    );
  }

  if (context.scheduling) {
    parts.push(context.scheduling.text);
    parts.push(
      "When someone is ready to book, the next step is the booking page. That form is where name, phone, and address belong."
    );
    return parts.join("\n\n");
  }

  if (normalized.includes("commercial") || normalized.includes("office") || normalized.includes("storefront")) {
    parts.push(
      "For commercial spaces, 805 Shutters can help with roller shades, solar shades, blackout shades, motorized shades, vertical blinds, and replacement blinds. The consultation usually starts with glare, heat, privacy, safety, damaged coverings, and schedule constraints."
    );
    parts.push("A free commercial shade audit is the best next step for offices, storefronts, medical spaces, schools, and property managers.");
    return parts.join("\n\n");
  }

  if (normalized.includes("shutter") && normalized.includes("shade")) {
    parts.push(
      "Shutters are usually the stronger fit when you want a built-in look, durability, easy cleaning, and architectural lines. Shades are usually better when softness, glare control, room darkening, woven texture, or motorization matter more."
    );
    parts.push("805 Shutters can compare both during one free in-home consultation so the recommendation matches the room instead of forcing one product.");
    return parts.join("\n\n");
  }

  if (normalized.includes("area") || normalized.includes("serve") || site.areas.some((area) => normalized.includes(area.toLowerCase()))) {
    parts.push(
      `805 Shutters serves ${site.serviceArea}, including ${site.areas.join(", ")}. If the project is nearby, the consultation can usually confirm the best path.`
    );
    return parts.join("\n\n");
  }

  if (context.pageSnippets.length > 0) {
    parts.push(context.pageSnippets[0]);
  } else {
    parts.push(
      "805 Shutters helps compare shutters, shades, blinds, drapery, exterior shades, and commercial window coverings around light control, privacy, style, budget, and installation details."
    );
  }

  parts.push("For a project-specific recommendation, ask about the room, window type, privacy goal, light problem, or scheduling process.");
  return parts.join("\n\n");
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function pageText(page: SitePage) {
  return [
    page.path,
    page.title,
    page.description,
    page.h1,
    page.eyebrow,
    page.intro,
    page.cta,
    ...page.sections.flatMap((section) => [section.heading, section.body, ...(section.bullets || [])])
  ]
    .filter(Boolean)
    .join(" ");
}

function matchPages(question: string, pagePath?: string) {
  const tokens = tokenize(question);
  const normalizedPagePath = pagePath ? normalizePath(pagePath) : "";
  const scores = allPages.map((page) => {
    const text = pageText(page).toLowerCase();
    let score = page.path === normalizedPagePath ? 6 : 0;

    for (const token of tokens) {
      if (text.includes(token)) score += 1;
      if (page.path.includes(token)) score += 2;
      if (page.h1.toLowerCase().includes(token)) score += 2;
    }

    return { page, score };
  });

  return scores
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function pageSnippet(page: SitePage) {
  const sectionText = page.sections
    .slice(0, 4)
    .map((section) => `${section.heading}: ${section.body}`)
    .join(" ");
  const text = `${page.h1}. ${page.intro} ${sectionText}`.replace(/\s+/g, " ").trim();
  return text.length > 780 ? `${text.slice(0, 777)}...` : text;
}

function uniqueLinks(links: AssistantLink[]) {
  const seen = new Set<string>();
  const unique: AssistantLink[] = [];

  for (const link of links) {
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    unique.push(link);
  }

  return unique;
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function getSchedulingContext(): Promise<SchedulingContext> {
  const supabase = getSupabaseServiceClient();
  const bookingLink = { label: "Book a consultation", href: "/book-consultation/" };

  if (!supabase) {
    return {
      configured: false,
      links: [bookingLink],
      text:
        "The booking calendar is connected to 805's CRM availability, but live appointment slots are not available in this environment. The scheduling process is still simple: choose a published slot on the booking page, then enter contact and address details there so the appointment can be confirmed."
    };
  }

  const months = [losAngelesDateString().slice(0, 7), shiftMonth(losAngelesDateString().slice(0, 7), 1)];
  const slotSummaries: string[] = [];
  let configured = true;

  for (const month of months) {
    const range = monthRangeUtc(month);
    const eventsResult = await supabase
      .from("crm_calendar_events")
      .select("*")
      .lt("start_at", range.end)
      .gt("end_at", range.start)
      .neq("status", "canceled")
      .order("start_at", { ascending: true });

    if (eventsResult.error) {
      return {
        configured: false,
        links: [bookingLink],
        text:
          "The live booking calendar could not be checked right now. The safest next step is to open the booking page or call/text 805-806-9344 for available consultation times."
      };
    }

    const availability = buildBookingAvailability(
      month,
      (eventsResult.data || []) as CrmCalendarEvent[]
    );

    for (const day of availability.days) {
      for (const slot of day.slots) {
        if (slot.available) {
          slotSummaries.push(`${formatDate(day.date)} ${slot.label}`);
        }
      }
    }
  }

  if (!configured) {
    return {
      configured: false,
      links: [bookingLink],
      text:
        "Appointment availability is controlled from the CRM, but no live availability slots are published yet. Visitors can still use the booking page or call/text 805-806-9344 for help finding a consultation time."
    };
  }

  if (slotSummaries.length === 0) {
    return {
      configured: true,
      links: [bookingLink],
      text:
        "The live calendar is connected, but there are no open consultation slots showing in the next two months. Visitors should use the booking page if it shows updated openings, or call/text 805-806-9344 for scheduling help."
    };
  }

  return {
    configured: true,
    links: [bookingLink],
    text: `The live calendar is showing appointment openings. Earliest options include ${slotSummaries.slice(0, 6).join("; ")}. Availability can change, so the booking page is the source of truth before a customer enters contact details.`
  };
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles"
  }).format(new Date(`${date}T12:00:00`));
}
