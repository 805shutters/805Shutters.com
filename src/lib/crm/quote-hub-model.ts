import {
  computeQuoteMoney,
  type QuoteAdjustments,
  type QuoteMoney,
} from "./quote-money";

export const HUB_FROM = "805@805shutters.com";
export const HUB_ACTIONS = [
  "interested",
  "savings",
  "inspiration",
  "personal",
] as const;
export type HubAction = (typeof HUB_ACTIONS)[number];
export type HubSource = "crm" | "sales";
export type HubPhoto = { id: string; title: string; url: string };
export const HUB_PHOTOS: HubPhoto[] = [
  {
    id: "shutters",
    title: "Plantation shutters",
    url: "/images/homepage-flow/mobile-hero-plantation-shutters.jpg",
  },
  {
    id: "roller",
    title: "Roller shades",
    url: "/images/homepage-flow/roller-shades.jpg",
  },
  {
    id: "roman",
    title: "Roman shades",
    url: "/images/homepage-flow/mobile-hero-roman-shades.jpg",
  },
];
export type HubOfferBasis = {
  subtotal: number;
  total: number;
  adjustments: QuoteAdjustments;
  sourceAdjustment: number;
  allPriced: boolean;
};
export type HubOffer = {
  percent: number;
  originalTotal: number;
  savings: number;
  total: number;
  adjustments: QuoteAdjustments;
  money: QuoteMoney;
};
export type HubDraft = {
  action: HubAction;
  subject: string;
  body: string;
  percent: number;
  photoIds: string[];
};
export type HubMessage = {
  id: string;
  quote_id: string;
  action: HubAction | "note" | "reply";
  status:
    | "draft"
    | "prepared"
    | "sending"
    | "sent"
    | "unknown"
    | "failed"
    | "received"
    | "note";
  subject: string;
  body: string;
  recipient: string | null;
  created_at: string;
  actor_email: string;
  provider_id: string | null;
  payload: {
    draft?: HubDraft;
    offer?: HubOffer | null;
    photoIds?: string[];
    fingerprint?: string;
    offerId?: string;
    offerToken?: string;
    url?: string;
    html?: string;
    error?: string;
    rfcMessageId?: string;
    replyToMessageId?: string;
  };
};
export type HubConversation = {
  quoteId: string;
  name: string;
  email: string | null;
  quoteNumber: string;
  sentAt: string | null;
  total: number;
  url: string | null;
  canSend: boolean;
  blockedReason: string | null;
  basis: HubOfferBasis | null;
  messages: HubMessage[];
  photos: HubPhoto[];
};
export function hubMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
export function hubOffer(basis: HubOfferBasis, percent: number): HubOffer {
  if (!Number.isFinite(percent) || percent <= 0 || percent > 50)
    throw new Error("Choose a discount greater than 0% and no more than 50%.");
  if (
    !basis.allPriced ||
    basis.subtotal <= 0 ||
    Math.abs(basis.sourceAdjustment) >= 0.01 ||
    basis.adjustments.balanceDueOverride !== null
  ) {
    throw new Error(
      "Review this quote’s pricing in the editor before offering savings.",
    );
  }
  const current = computeQuoteMoney(basis.subtotal, basis.adjustments);
  if (Math.abs(current.total - basis.total) > 0.01)
    throw new Error("Quote pricing has changed. Reload the conversation.");
  // Additional discount applies to the remaining product share only. Preserve
  // existing discounts, fees, tax rate, deposit rate and underlying cost snapshots.
  const productShare = basis.subtotal / (basis.subtotal + current.extrasTotal);
  const additional =
    Math.round(current.taxableBase * productShare * percent) / 100;
  const adjustments = {
    ...basis.adjustments,
    discountFlat:
      Math.round((basis.adjustments.discountFlat + additional) * 100) / 100,
  };
  const money = computeQuoteMoney(basis.subtotal, adjustments);
  if (money.total >= current.total)
    throw new Error(
      "This percentage does not produce a savings amount. Choose a larger discount.",
    );
  return {
    percent,
    originalTotal: current.total,
    savings: Math.round((current.total - money.total) * 100) / 100,
    total: money.total,
    adjustments,
    money,
  };
}
export function hubTemplate(
  action: HubAction,
  name: string,
): Pick<HubDraft, "subject" | "body"> {
  const first = name.trim().split(/\s+/)[0] || "there";
  const content = {
    interested: [
      "Still on your window wish list?",
      "Are new window coverings still on your wish list, or has life moved things around?\n\nWhether you’re ready, still deciding, or thinking later, just hit reply. I’m happy to pick things up wherever you are.",
    ],
    savings: [
      "A little savings for your window project",
      "I’d love to help bring your window project to life. I’ve put together a little extra savings for you — the details are below.\n\nTake a look at the revised offer, or just reply if you’d like to talk it through.",
    ],
    inspiration: [
      "A little inspiration for your windows",
      "Sometimes it helps to see the finished look. I picked out a few photos to give you some inspiration for your windows.\n\nDoes one of these feel like what you have in mind? Reply with your favorite and we can talk through the details.",
    ],
    personal: ["Your window project", ""],
  }[action];
  return {
    subject: content[0],
    body: `Hi ${first},\n\n${content[1]}\n\nMichael\n805 Shutters`,
  };
}
export function validateHubDraft(value: unknown): HubDraft {
  if (!value || typeof value !== "object")
    throw new Error("A message is required.");
  const d = value as HubDraft;
  if (!HUB_ACTIONS.includes(d.action))
    throw new Error("Choose a message type.");
  if (
    typeof d.subject !== "string" ||
    !d.subject.trim() ||
    d.subject.length > 180 ||
    /[\r\n]/.test(d.subject)
  )
    throw new Error("Enter a subject of up to 180 characters on one line.");
  if (typeof d.body !== "string" || !d.body.trim() || d.body.length > 12000)
    throw new Error("Enter a message of up to 12,000 characters.");
  if (
    d.action === "savings" &&
    (!Number.isFinite(d.percent) || d.percent <= 0 || d.percent > 50)
  )
    throw new Error("Choose a discount greater than 0% and no more than 50%.");
  if (
    !Array.isArray(d.photoIds) ||
    d.photoIds.length > 6 ||
    d.photoIds.some((id) => typeof id !== "string" || id.length > 100)
  )
    throw new Error("Choose up to six photos.");
  if (d.action === "inspiration" && !d.photoIds.length)
    throw new Error("Choose at least one inspiration photo.");
  return {
    action: d.action,
    subject: d.subject.trim(),
    body: d.body.trim(),
    percent: d.percent,
    photoIds: d.action === "inspiration" ? [...new Set(d.photoIds)] : [],
  };
}
export function escapeHubHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function hubEmail(
  draft: HubDraft,
  offer: HubOffer | null,
  url: string,
  photoIds: string[],
) {
  const e = escapeHubHtml;
  const savings = offer
    ? `${offer.percent}% additional savings on products\nOriginal total: ${hubMoney(offer.originalTotal)}\nYou save: ${hubMoney(offer.savings)}\nYour revised total: ${hubMoney(offer.total)}\nFees excluded from additional discount; tax recalculated. Offer applies to the complete quoted project.`
    : "";
  const label = offer ? "Review your revised offer" : "Review your quote";
  return {
    text: `${draft.body}\n\n${savings ? savings + "\n\n" : ""}${label}: ${url}\n\n805@805shutters.com · https://805shutters.com`,
    html: `<div style="font-family:Arial,sans-serif;color:#20231f;max-width:620px;margin:auto;padding:24px"><h2 style="font-family:Georgia,serif;font-weight:normal">805 Shutters</h2><div style="white-space:pre-wrap;line-height:1.7">${e(draft.body)}</div>${offer ? `<div style="background:#f1f3ed;padding:18px;margin:18px 0;white-space:pre-wrap">${e(savings)}</div>` : ""}${photoIds.map((id, i) => `<img src="cid:photo-${i}" alt="Window treatment inspiration" style="width:100%;height:auto;margin-top:16px">`).join("")}<p><a href="${e(url)}" style="display:inline-block;padding:12px 16px;background:#36523a;color:white;text-decoration:none">${label}</a></p><p style="font-size:12px">805 Shutters<br>805@805shutters.com · 805shutters.com</p></div>`,
  };
}
