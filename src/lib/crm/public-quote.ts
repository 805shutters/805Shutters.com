// Customer-facing quote: load by unguessable share_token, project to a SAFE
// public shape (no cost/profit/internal fields), and accept (e-sign -> sold).
// All access is service-role + server-only (same trust model as public booking).

import { randomBytes } from "node:crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity, upsertCrmCustomer } from "@/lib/crm/backend";
import { computeQuoteMoney, designOnceTotal, lineItemSubtotal, parseAdjustments, round2, selectedDesign } from "@/lib/crm/quote-builder";
import { advanceJobStatus, jobStatusForQuote } from "@/lib/quote/lifecycle";
import type { CrmJobStatus, CrmQuoteStatus } from "@/lib/crm/types";
import type { CrmQuoteDesign, CrmQuoteLineItem, CrmQuote } from "@/lib/crm/types";
import { catalog, getProduct } from "@/lib/quote/catalog";
import { detailDisplayValue, isCustomerVisibleDetail } from "@/lib/quote/product-options";
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
  designOptions: PublicQuoteDesignOption[];
  showDesignOptions: boolean;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  priceReady: boolean;
};

export type PublicQuoteDesignOption = {
  id: string;
  label: string;
  productName: string;
  styleName: string;
  options: string[];
  unitPrice: number;
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
  /** Extra flat fees (install, etc.) shown as their own lines so the math reconciles. */
  fees: { name: string; amount: number }[];
  discount: number;
  tax: number;
  sourceTotalAdjustment: number;
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function isLegacyMtsQuote(quote: CrmQuote): boolean {
  const meta = record(quote.meta);
  return meta.legacy_quote_system === "mts_sales_quote" || typeof meta.mts_quote_id === "string";
}

function legacySourceTotalAdjustment(quote: CrmQuote, calculatedTotal: number): number {
  const meta = record(quote.meta);
  const storedAdjustment = Number(meta.legacy_source_total_adjustment);
  if (Number.isFinite(storedAdjustment) && Math.abs(storedAdjustment) >= 0.01) return round2(storedAdjustment);
  const sourceTotal = Number(meta.legacy_source_total ?? quote.quote_total);
  if (!Number.isFinite(sourceTotal) || sourceTotal <= 0) return 0;
  const delta = round2(sourceTotal - calculatedTotal);
  return Math.abs(delta) >= 0.01 ? delta : 0;
}

function legacyDesignSnapshot(design: CrmQuoteDesign): {
  productType?: string;
  details?: { label: string; value: string }[];
} | null {
  const breakdown = record(design.price_breakdown);
  if (breakdown.source !== "mts_805_bookkeeping") return null;
  const details = Array.isArray(breakdown.details)
    ? breakdown.details
        .map((detail) => {
          const item = record(detail);
          const label = typeof item.label === "string" ? item.label : "";
          const value = typeof item.value === "string" ? item.value : "";
          return label && value ? { label, value } : null;
        })
        .filter((detail): detail is { label: string; value: string } => Boolean(detail))
    : [];
  return {
    productType: typeof breakdown.productType === "string" ? breakdown.productType : undefined,
    details,
  };
}

/** Customer-readable description of a design from the catalog (no prices leaked beyond unit_price). */
export function describeDesign(design: CrmQuoteDesign): { productName: string; styleName: string; options: string[] } {
  const legacy = legacyDesignSnapshot(design);
  const product = getProduct(design.product_id);
  const productName = legacy?.productType || product?.name || design.product_id;
  let styleName = "";
  if (design.program_id) {
    styleName = product?.programs.find((p) => p.id === design.program_id)?.name ?? "";
  }
  if (!styleName && design.fabric) styleName = design.fabric;
  const legacyOptions = legacy?.details?.map((detail) => `${detail.label}: ${detail.value}`) ?? [];
  const surchargeOptions = (design.surcharges ?? [])
    .map((s) => product?.surcharges.find((x) => x.id === s.id)?.name)
    .filter((n): n is string => Boolean(n));
  const detailOptions = Object.entries(design.details ?? {})
    .filter(([fieldId]) => isCustomerVisibleDetail(design.product_id, fieldId))
    .map(([fieldId, value]) => detailDisplayValue(design.product_id, fieldId, value))
    .filter((n): n is string => Boolean(n));
  const motorizationOptions = (design.motorization ?? [])
    .map((m) => {
      const group = catalog.motorization[m.groupId];
      const option = group?.options.find((o) => o.id === m.optionId);
      return group && option ? `${group.name}: ${option.name}` : null;
    })
    .filter((n): n is string => Boolean(n));
  const options = legacyOptions.length ? legacyOptions : [...detailOptions, ...surchargeOptions, ...motorizationOptions];
  return { productName, styleName, options };
}

function projectDesignOption(design: CrmQuoteDesign, quantity: number): PublicQuoteDesignOption {
  const { productName, styleName, options } = describeDesign(design);
  const priceReady = design.price_status === "ok";
  const unitPrice = priceReady ? round2(Number(design.unit_price)) : 0;
  return {
    id: design.id,
    label: design.label || "A",
    productName,
    styleName,
    options,
    unitPrice,
    lineTotal: priceReady ? round2(unitPrice * quantity + designOnceTotal(design)) : 0,
    priceReady,
  };
}

function projectLine(li: CrmQuoteLineItem, legacyMts: boolean): PublicQuoteLine {
  const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
  if (legacyMts) {
    const designOptions = [...(li.designs || [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((design) => projectDesignOption(design, qty));
    const first = designOptions[0] || null;
    const priceReady = designOptions.length > 0 && designOptions.every((option) => option.priceReady);
    return {
      id: li.id,
      room: li.room || "Window",
      dimensions: dimensions(li),
      productName: li.notes || first?.productName || "-",
      styleName: "",
      options: [],
      designOptions,
      showDesignOptions: true,
      unitPrice: priceReady ? round2(designOptions.reduce((sum, option) => sum + option.unitPrice, 0)) : 0,
      quantity: qty,
      lineTotal: priceReady ? round2(designOptions.reduce((sum, option) => sum + option.lineTotal, 0)) : 0,
      priceReady,
    };
  }

  const design = selectedDesign(li);
  if (!design) {
    return {
      id: li.id,
      room: li.room || "Window",
      dimensions: dimensions(li),
      productName: "-",
      styleName: "",
      options: [],
      designOptions: [],
      showDesignOptions: false,
      unitPrice: 0,
      quantity: qty,
      lineTotal: 0,
      priceReady: false
    };
  }
  const { productName, styleName, options } = describeDesign(design);
  const priceReady = design.price_status === "ok";
  const unitPrice = priceReady ? round2(Number(design.unit_price)) : 0;
  const lineTotal = priceReady ? lineItemSubtotal(li) : 0;
  return {
    id: li.id,
    room: li.room || "Window",
    dimensions: dimensions(li),
    productName,
    styleName,
    options,
    designOptions: [projectDesignOption(design, qty)],
    showDesignOptions: false,
    unitPrice,
    quantity: qty,
    // Authoritative billed amount (unit x qty + any per-order surcharge) — matches
    // exactly what the quote/bookkeeping bill, so the customer's math reconciles.
    lineTotal,
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
    .select("*, designs:crm_quote_designs!crm_quote_designs_line_item_id_fkey(*)")
    .eq("quote_id", quote.id);

  const lineItems = ((items as CrmQuoteLineItem[]) ?? [])
    .map((li) => ({ ...li, designs: li.designs ?? [] }))
    .sort((a, b) => a.sort_order - b.sort_order);
  const legacyMts = isLegacyMtsQuote(quote);
  const lines = lineItems.map((lineItem) => projectLine(lineItem, legacyMts));
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  // Rebuild the full money breakdown from line items + adjustments (same engine
  // the builder uses), so Subtotal − discount + tax + fees = Total exactly. This
  // also self-heals a stale stored quote_total.
  const adj = parseAdjustments(quote.meta);
  const money = computeQuoteMoney(subtotal, adj);
  const sourceTotalAdjustment = legacyMts ? legacySourceTotalAdjustment(quote, money.total) : 0;
  const total = sourceTotalAdjustment ? round2(money.total + sourceTotalAdjustment) : money.total;
  const depositPercent = adj.depositPercent || 0;
  const depositDue = depositPercent > 0 ? round2(total * (depositPercent / 100)) : money.depositRequired;

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
    subtotal: money.subtotal,
    fees: adj.fees,
    discount: money.discountAmount,
    tax: money.taxAmount,
    sourceTotalAdjustment,
    depositDue,
    balanceDue: round2(Math.max(total - depositDue, 0)),
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

function publicQuoteUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  return base ? `${base}/quote/${token}` : `/quote/${token}`;
}

function publicAssetUrl(path: string): string | undefined {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  return base ? `${base}${path}` : undefined;
}

async function syncSignedQuoteArtifacts(
  supabase: CrmSupabaseClient,
  quote: CrmQuote,
  token: string,
  pub: PublicQuote,
  signedAt: string,
  printedName: string,
) {
  const { data: job } = quote.job_id
    ? await supabase
        .from("crm_jobs")
        .select("id, customer_name, phone, email, address, city, notes")
        .eq("id", quote.job_id)
        .maybeSingle()
    : { data: null };

  const jobRow = job as {
    id: string;
    customer_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    notes?: string | null;
  } | null;
  const customerName = pub.customerName || jobRow?.customer_name || "Linked customer";
  const customer = await upsertCrmCustomer(supabase, {
    displayName: customerName,
    phone: quote.customer_phone || jobRow?.phone || null,
    email: quote.customer_email || jobRow?.email || null,
    address: quote.customer_address || jobRow?.address || null,
    city: jobRow?.city || null,
    latestStatus: "sold",
    latestSoldDate: signedAt.slice(0, 10),
    source: "crm",
    notes: quote.notes || jobRow?.notes || null,
    meta: {
      lastQuoteId: quote.id,
      lastSignedQuoteId: quote.id,
    },
  });

  const { error } = await supabase.from("crm_customer_contracts").upsert(
    {
      external_source: "crm_quote",
      external_id: `contract:${quote.id}`,
      customer_id: customer?.id || null,
      job_id: quote.job_id,
      quote_id: quote.id,
      bookkeeping_entry_id: null,
      title: quote.quote_number ? `Contract ${quote.quote_number}` : `${customerName} contract`,
      contract_url: publicQuoteUrl(token),
      share_token: token,
      status: "sold",
      signed_at: signedAt,
      total_amount: pub.total,
      meta: {
        customer_printed_name: printedName,
        source: "public_quote_signature",
      },
    },
    { onConflict: "external_source,external_id" },
  );
  if (error) throw new CrmAuthError(502, "Quote was signed, but the customer contract file could not be saved.");
}

export async function acceptPublicQuote(
  supabase: CrmSupabaseClient,
  token: string,
  input: { printedName: string; signature?: string; acknowledgedTotal?: number },
): Promise<{ ok: true; alreadySigned: boolean }> {
  const quote = await fetchByToken(supabase, token);
  if (!quote) throw new CrmAuthError(404, "This quote link is no longer valid.");
  if (quote.signed_at) {
    const pub = await loadPublicQuoteByToken(supabase, token);
    if (pub) {
      await syncSignedQuoteArtifacts(
        supabase,
        quote,
        token,
        pub,
        quote.signed_at,
        quote.customer_printed_name || input.printedName || pub.customerName || "Customer",
      );
    }
    return { ok: true, alreadySigned: true };
  }

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

  // Consent guard: the customer must sign the exact total they were shown. If an
  // admin edited the quote after the page loaded, the displayed total no longer
  // matches — reject so they review the new amount before binding themselves.
  if (
    input.acknowledgedTotal != null &&
    Math.round(Number(input.acknowledgedTotal) * 100) !== Math.round(soldTotal * 100)
  ) {
    throw new CrmAuthError(409, "This quote was updated since you opened it. Please refresh to review the new total before signing.");
  }

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
  if (error) {
    // The one-signed-per-group unique index (crm_quotes_one_signed_per_group)
    // rejects a second concurrent sign in the same group — treat that as a
    // graceful "already decided", not a server error.
    if ((error as { code?: string }).code === "23505") return { ok: true, alreadySigned: true };
    throw new CrmAuthError(502, "We couldn't record your signature. Please try again.");
  }
  if (!claimed || claimed.length === 0) return { ok: true, alreadySigned: true };

  // Within a group, the chosen version wins — supersede the unsigned alternatives
  // so they can't also be signed and never get their own bookkeeping entry.
  if (quote.quote_group_id) {
    // Concurrency guard (M6): if a sibling link was signed at nearly the same
    // moment, both per-row claims can succeed. Resolve to a single winner — the
    // earliest signature (tiebreak: lowest id). If THIS request lost, revert our
    // claim before any bookkeeping/supersede so we never end up with two sold
    // versions + two ledger entries.
    const { data: signedRows } = await supabase
      .from("crm_quotes")
      .select("id, signed_at")
      .eq("quote_group_id", quote.quote_group_id)
      .not("signed_at", "is", null);
    const others = ((signedRows as { id: string; signed_at: string }[]) ?? []).filter((r) => r.id !== quote.id);
    // Compare by parsed epoch ms — toISOString() (ms, "Z") and a PostgREST
    // timestamptz (microseconds, "+00:00") are NOT lexicographically comparable.
    const nowMs = Date.parse(now);
    const weLost = others.some((o) => {
      const oMs = Date.parse(String(o.signed_at));
      return oMs < nowMs || (oMs === nowMs && o.id < quote.id);
    });
    if (weLost) {
      await supabase
        .from("crm_quotes")
        .update({ status: "archived", signed_at: null, sold_at: null, customer_signature: null, customer_printed_name: null, share_token: null })
        .eq("id", quote.id);
      return { ok: true, alreadySigned: true };
    }

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

  await syncSignedQuoteArtifacts(
    supabase,
    { ...quote, signed_at: now, sold_at: now, customer_signature: signature, customer_printed_name: printedName },
    token,
    { ...pub, total: soldTotal, signed: true, signedAt: now },
    now,
    printedName,
  );

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

  return { token, url: publicQuoteUrl(token) };
}

export async function sendQuoteToCustomer(
  supabase: CrmSupabaseClient,
  quoteId: string,
  actor: CrmActor,
): Promise<{ url: string; sms: { sent: boolean; skipped?: string }; email: { sent: boolean; skipped?: string }; status: string }> {
  const { token, url } = await ensureShareToken(supabase, quoteId, actor);
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

  const publicQuote = await loadPublicQuoteByToken(supabase, token);
  const total = publicQuote?.total ?? (Number(quote.quote_total) || 0);
  const customerName = publicQuote?.customerName && publicQuote.customerName !== "Valued customer" ? publicQuote.customerName : name;
  const sms = await sendSms({ to: phone, body: `${BUSINESS_NAME}: ${customerName}, here is your quote — review & approve: ${url}` });
  const mail = buildQuoteEmail(customerName, url, total, {
    quoteNumber: publicQuote?.quoteNumber,
    lines: publicQuote?.lines,
    subtotal: publicQuote?.subtotal,
    fees: publicQuote?.fees,
    discount: publicQuote?.discount,
    tax: publicQuote?.tax,
    sourceTotalAdjustment: publicQuote?.sourceTotalAdjustment,
    depositDue: publicQuote?.depositDue,
    balanceDue: publicQuote?.balanceDue,
    logoUrl: publicAssetUrl("/brand/805-shutters-logo-header.png"),
    businessPhone: publicQuote?.business.phone,
  });
  const emailRes = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });

  let status = String(quote.status);
  if (status === "draft") {
    await supabase.from("crm_quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", quoteId);
    status = "sent";
  }

  // The job is a forward-only projection of the quote: sending it advances the
  // job to "quoted" (never downgrades a job already further along).
  if (quote.job_id) {
    const { data: jobRow } = await supabase.from("crm_jobs").select("status").eq("id", quote.job_id).maybeSingle();
    const current = (jobRow as { status?: CrmJobStatus } | null)?.status;
    if (current) {
      const next = advanceJobStatus(current, jobStatusForQuote(status as CrmQuoteStatus));
      if (next !== current) await supabase.from("crm_jobs").update({ status: next }).eq("id", quote.job_id);
    }
  }

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: quoteId,
    action: "send_to_customer",
    metadata: { url, sms: sms.sent, email: emailRes.sent },
  });

  return { url, sms, email: emailRes, status };
}
