// Customer-facing quote: load by unguessable share_token, project to a SAFE
// public shape (no cost/profit/internal fields), and accept (e-sign -> sold).
// All access is service-role + server-only (same trust model as public booking).

import { randomBytes } from "node:crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import { round2, selectedDesign } from "@/lib/crm/quote-builder";
import type { CrmQuoteDesign, CrmQuoteLineItem, CrmQuote } from "@/lib/crm/types";
import { getProduct } from "@/lib/quote/catalog";
import { productImage } from "@/lib/quote/product-images";
import { ensureBookkeepingEntry, listQuoteVersions } from "@/lib/crm/quote-groups";
import { sendSms } from "@/lib/notify/twilio";
import { sendEmail, buildQuoteEmail } from "@/lib/notify/email";

type CrmSupabaseClient = SupabaseClient;
type CrmActor = { email: string; userId?: string };

const BUSINESS_NAME = "805 Shutters";

export type PublicQuoteLine = {
  id: string;
  room: string;
  dimensions: string;
  productName: string;
  styleName: string;
  options: string[];
  image: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  priceReady: boolean;
};

export type PublicQuote = {
  token: string;
  quoteNumber: string | null;
  customerName: string;
  status: string;
  signed: boolean;
  signedAt: string | null;
  lines: PublicQuoteLine[];
  subtotal: number;
  depositDue: number;
  balanceDue: number;
  total: number;
  allPriced: boolean;
  business: { name: string; phone: string };
  versions: { token: string; label: string; total: number; signed: boolean; current: boolean }[];
};

function dimensions(li: CrmQuoteLineItem): string {
  if (li.width_in == null || li.height_in == null) return "Measurements pending";
  return `${li.width_in}" W × ${li.height_in}" H`;
}

/** Customer-readable description of a design from the catalog (no prices leaked beyond unit_price). */
export function describeDesign(design: CrmQuoteDesign): { productName: string; styleName: string; options: string[] } {
  const product = getProduct(design.product_id);
  const productName = product?.name ?? design.product_id;
  let styleName = "";
  if (design.program_id) {
    styleName = product?.programs.find((p) => p.id === design.program_id)?.name ?? "";
  }
  if (!styleName && design.fabric) styleName = design.fabric;
  const options = (design.surcharges ?? [])
    .map((s) => product?.surcharges.find((x) => x.id === s.id)?.name)
    .filter((n): n is string => Boolean(n));
  return { productName, styleName, options };
}

function projectLine(li: CrmQuoteLineItem): PublicQuoteLine {
  const design = selectedDesign(li);
  const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
  if (!design) {
    return { id: li.id, room: li.room || "Window", dimensions: dimensions(li), productName: "—", styleName: "", options: [], image: "", unitPrice: 0, quantity: qty, lineTotal: 0, priceReady: false };
  }
  const { productName, styleName, options } = describeDesign(design);
  const product = getProduct(design.product_id);
  const priceReady = design.price_status === "ok";
  const unitPrice = priceReady ? round2(Number(design.unit_price)) : 0;
  return {
    id: li.id,
    room: li.room || "Window",
    dimensions: dimensions(li),
    productName,
    styleName,
    options,
    image: product ? productImage(product.productType) : "",
    unitPrice,
    quantity: qty,
    lineTotal: round2(unitPrice * qty),
    priceReady,
  };
}

async function fetchByToken(supabase: CrmSupabaseClient, token: string): Promise<CrmQuote | null> {
  if (!token) return null;
  const { data } = await supabase.from("crm_quotes").select("*").eq("share_token", token).maybeSingle();
  return (data as CrmQuote) ?? null;
}

export async function loadPublicQuoteByToken(
  supabase: CrmSupabaseClient,
  token: string,
): Promise<PublicQuote | null> {
  const quote = await fetchByToken(supabase, token);
  if (!quote) return null;
  const { data: items } = await supabase
    .from("crm_quote_line_items")
    .select("*, designs:crm_quote_designs(*)")
    .eq("quote_id", quote.id);

  const lineItems = ((items as CrmQuoteLineItem[]) ?? [])
    .map((li) => ({ ...li, designs: li.designs ?? [] }))
    .sort((a, b) => a.sort_order - b.sort_order);
  const lines = lineItems.map(projectLine);
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const total = round2(Number(quote.quote_total) || subtotal);

  let customerName = quote.customer_name || "";
  if (!customerName && quote.job_id) {
    const { data: job } = await supabase.from("crm_jobs").select("customer_name").eq("id", quote.job_id).maybeSingle();
    customerName = (job as { customer_name?: string } | null)?.customer_name || "";
  }

  let versions: PublicQuote["versions"] = [];
  if (quote.quote_group_id) {
    const siblings = await listQuoteVersions(supabase, quote.id);
    versions = siblings
      .filter((s) => s.share_token)
      .map((s) => ({ token: s.share_token as string, label: s.label, total: s.quote_total, signed: s.signed, current: s.share_token === token }));
  }

  return {
    token,
    quoteNumber: quote.quote_number,
    customerName: customerName || "Valued customer",
    status: quote.status,
    signed: Boolean(quote.signed_at),
    signedAt: quote.signed_at,
    lines,
    subtotal,
    depositDue: round2(Number(quote.deposit_required) || 0),
    balanceDue: round2(Number(quote.balance_due) || 0),
    total,
    allPriced: lines.length > 0 && lines.every((l) => l.priceReady),
    business: { name: BUSINESS_NAME, phone: process.env.NEXT_PUBLIC_BUSINESS_PHONE || "" },
    versions,
  };
}

export function buildSignedShopSms(customerName: string, total: number): string {
  const amount = total.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return `${BUSINESS_NAME}: ${customerName} signed their quote (${amount}). Time to order.`;
}
export function buildSignedCustomerSms(customerName: string): string {
  return `${BUSINESS_NAME}: Thank you, ${customerName}! Your order is confirmed. We'll be in touch to schedule. Reply with any questions.`;
}

export async function acceptPublicQuote(
  supabase: CrmSupabaseClient,
  token: string,
  input: { printedName: string; signature?: string },
): Promise<{ ok: true; alreadySigned: boolean }> {
  const quote = await fetchByToken(supabase, token);
  if (!quote) throw new CrmAuthError(404, "This quote link is no longer valid.");
  if (quote.signed_at) return { ok: true, alreadySigned: true };

  const printedName = (input.printedName || "").trim();
  if (!printedName) throw new CrmAuthError(400, "Please type your name to sign.");
  const signature = (input.signature || printedName).trim();
  const now = new Date().toISOString();

  // Guard: never let a customer sign an unfinished / unpriced / $0 quote.
  const pub = await loadPublicQuoteByToken(supabase, token);
  if (!pub || pub.lines.length === 0 || !pub.allPriced || pub.total <= 0) {
    throw new CrmAuthError(409, "This quote isn't finalized yet — please contact us before signing.");
  }
  const soldTotal = pub.total;

  // Atomic claim: only the first request that flips signed_at from null wins
  // (guards against double-submit / concurrent sign of the same link).
  const { data: claimed, error } = await supabase
    .from("crm_quotes")
    .update({
      status: "sold",
      signed_at: now,
      sold_at: now,
      customer_signature: signature,
      customer_printed_name: printedName,
    })
    .eq("id", quote.id)
    .eq("share_token", token)
    .is("signed_at", null)
    .select("id");
  if (error) throw new CrmAuthError(502, "We couldn't record your signature. Please try again.");
  if (!claimed || claimed.length === 0) return { ok: true, alreadySigned: true };

  // Within a group, the chosen version wins — supersede the unsigned alternatives
  // so they can't also be signed and never get their own bookkeeping entry.
  if (quote.quote_group_id) {
    await supabase
      .from("crm_quotes")
      .update({ status: "archived", share_token: null })
      .eq("quote_group_id", quote.quote_group_id)
      .neq("id", quote.id)
      .is("signed_at", null);
  }

  // Sync the parent job + bookkeeping entry to "sold".
  let customerPhone: string | null = null;
  if (quote.job_id) {
    const { data: job } = await supabase
      .from("crm_jobs")
      .update({ status: "sold" })
      .eq("id", quote.job_id)
      .select("phone, customer_name")
      .maybeSingle();
    customerPhone = (job as { phone?: string } | null)?.phone ?? null;
  }
  // Alternative versions have no bookkeeping entry until won — ensure one now,
  // using the authoritative sold total.
  await ensureBookkeepingEntry(supabase, { ...quote, quote_total: soldTotal });
  await supabase
    .from("crm_quote_bookkeeping_entries")
    .update({ sold_date: now.slice(0, 10), total_amount: soldTotal })
    .eq("quote_id", quote.id);

  await recordCrmActivity(supabase, { email: "customer:" + printedName }, {
    entityType: "quote",
    entityId: quote.id,
    action: "customer.sign",
    metadata: { token, total: soldTotal },
  });

  // Notify shop (one or more numbers) + customer. Best-effort; never blocks signing.
  const shopNumbers = (process.env.CRM_SOLD_QUOTE_SMS_NUMBERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const num of shopNumbers) {
    await sendSms({ to: num, body: buildSignedShopSms(printedName, soldTotal) });
  }
  if (customerPhone) {
    await sendSms({ to: customerPhone, body: buildSignedCustomerSms(printedName) });
  }

  return { ok: true, alreadySigned: false };
}

export async function ensureShareToken(
  supabase: CrmSupabaseClient,
  quoteId: string,
  actor: CrmActor,
): Promise<{ token: string; url: string }> {
  const { data: quote, error } = await supabase
    .from("crm_quotes")
    .select("id, share_token")
    .eq("id", quoteId)
    .maybeSingle();
  if (error || !quote) throw new CrmAuthError(404, "Quote was not found.");

  let token = (quote as { share_token?: string }).share_token || "";
  if (!token) {
    token = randomBytes(24).toString("base64url");
    const { error: updateError } = await supabase
      .from("crm_quotes")
      .update({ share_token: token })
      .eq("id", quoteId);
    if (updateError) throw new CrmAuthError(502, "Could not create a share link.");
    await recordCrmActivity(supabase, actor, { entityType: "quote", entityId: quoteId, action: "share_link.create" });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  return { token, url: `${base}/quote/${token}` };
}

export async function sendQuoteToCustomer(
  supabase: CrmSupabaseClient,
  quoteId: string,
  actor: CrmActor,
): Promise<{ url: string; sms: { sent: boolean; skipped?: string }; email: { sent: boolean; skipped?: string }; status: string }> {
  const { url } = await ensureShareToken(supabase, quoteId, actor);
  // Give every sibling version a link too, so the customer can compare them.
  try {
    const versions = await listQuoteVersions(supabase, quoteId);
    for (const v of versions) {
      if (!v.share_token && v.id !== quoteId) await ensureShareToken(supabase, v.id, actor);
    }
  } catch {
    /* non-fatal */
  }
  const { data: quote } = await supabase
    .from("crm_quotes")
    .select("id, status, quote_total, job_id")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) throw new CrmAuthError(404, "Quote was not found.");

  let phone: string | null = null;
  let email: string | null = null;
  let name = "there";
  if (quote.job_id) {
    const { data: job } = await supabase
      .from("crm_jobs")
      .select("phone, email, customer_name")
      .eq("id", quote.job_id)
      .maybeSingle();
    phone = (job as { phone?: string } | null)?.phone ?? null;
    email = (job as { email?: string | null } | null)?.email ?? null;
    name = (job as { customer_name?: string } | null)?.customer_name || name;
  }

  const total = Number(quote.quote_total) || 0;
  const sms = await sendSms({ to: phone, body: `${BUSINESS_NAME}: ${name}, here is your quote — review & approve: ${url}` });
  const mail = buildQuoteEmail(name, url, total);
  const emailRes = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });

  let status = String(quote.status);
  if (status === "draft") {
    await supabase.from("crm_quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", quoteId);
    status = "sent";
  }

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: quoteId,
    action: "send_to_customer",
    metadata: { url, sms: sms.sent, email: emailRes.sent },
  });

  return { url, sms, email: emailRes, status };
}
