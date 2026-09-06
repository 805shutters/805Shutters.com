import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";
import { loadPublicQuoteByToken } from "./public-quote";
import { prepareSalesQuoteForCommunication } from "./sales-quote-send";
import {
  HUB_FROM,
  HUB_PHOTOS,
  hubOffer,
  hubEmail,
  validateHubDraft,
  type HubConversation,
  type HubDraft,
  type HubMessage,
  type HubPhoto,
  type HubSource,
} from "./quote-hub-model";
import {
  hubGmail,
  hubGmailHeader,
  hubGmailText,
  hubGmailToken,
  type HubAttachment,
  type HubGmailMessage,
} from "./quote-hub-gmail";
import type { CrmQuote } from "./types";
import {
  assertHubDeliveryConfigured,
  deliverHubEmail,
  HubDeliveryRejected,
} from "./quote-hub-delivery";

const ACCOUNT_805 = "72ccf12a-11c0-4261-8ad0-31af8ad0bbfb";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const base = () => "https://805shutters.com";
function check(
  error: { message: string } | null,
  message = "The conversation could not be saved.",
) {
  if (error) throw new CrmAuthError(502, message);
}
function userError(error: unknown): never {
  throw new CrmAuthError(
    400,
    error instanceof Error ? error.message : "Check the message details.",
  );
}

export async function resolveHubQuote(
  db: SupabaseClient,
  source: HubSource,
  id: string,
  open = false,
): Promise<CrmQuote> {
  if (!UUID.test(id) || !["sales", "crm"].includes(source))
    throw new CrmAuthError(400, "Invalid quote reference.");
  let quoteId = id;
  if (source === "sales") {
    const { data: sales, error } = await db
      .from("sales_quotes")
      .select("id,account_id")
      .eq("id", id)
      .maybeSingle();
    check(error);
    if (!sales || sales.account_id !== ACCOUNT_805)
      throw new CrmAuthError(404, "805 quote not found.");
    const { data: mirror, error: mirrorError } = await db
      .from("crm_quotes")
      .select("id")
      .eq("external_source", "mts_805_bookkeeping")
      .eq("external_id", `quote:${id}`)
      .maybeSingle();
    check(mirrorError);
    if (!mirror && !open)
      throw new CrmAuthError(
        409,
        "Open the conversation to prepare this quote.",
      );
    quoteId = mirror?.id || (await prepareSalesQuoteForCommunication(db, id));
  }
  const { data: quote, error } = await db
    .from("crm_quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  check(error);
  if (
    !quote ||
    (quote.meta?.account_id && quote.meta.account_id !== ACCOUNT_805)
  )
    throw new CrmAuthError(404, "805 quote not found.");
  return quote as CrmQuote;
}
async function assertContactable(db: SupabaseClient, quote: CrmQuote) {
  if (
    quote.status !== "sent" ||
    quote.signed_at ||
    quote.customer_signature ||
    quote.archived_at
  )
    return "This quote is no longer an unsigned sent quote.";
  if (quote.quote_group_id) {
    const { data, error } = await db
      .from("crm_quotes")
      .select("id,status,signed_at")
      .eq("quote_group_id", quote.quote_group_id);
    check(error);
    if (
      data?.some(
        (q) =>
          q.signed_at ||
          [
            "sold",
            "approved",
            "ordered",
            "received",
            "installed",
            "invoiced",
            "paid",
          ].includes(q.status),
      )
    )
      return "A quote in this group has already sold.";
  }
  return null;
}
async function photoList(
  db: SupabaseClient,
  quoteId: string,
): Promise<HubPhoto[]> {
  const { data, error } = await db
    .from("crm_quote_hub_photos")
    .select("*")
    .eq("quote_id", quoteId)
    .order("created_at");
  check(error, "The photo library could not be loaded.");
  return [
    ...HUB_PHOTOS,
    ...(await Promise.all(
      (data || []).map(async (p) => {
        const result = await db.storage
          .from("quote-hub-photos")
          .createSignedUrl(p.storage_path, 3600);
        check(result.error);
        return { id: p.id, title: p.title, url: result.data!.signedUrl };
      }),
    )),
  ];
}
export async function loadHubConversation(
  db: SupabaseClient,
  quote: CrmQuote,
): Promise<HubConversation> {
  const [pub, result, photos, blocked] = await Promise.all([
    quote.share_token ? loadPublicQuoteByToken(db, quote.share_token) : null,
    db
      .from("crm_quote_hub_messages")
      .select("*")
      .eq("quote_id", quote.id)
      .order("created_at", { ascending: true }),
    photoList(db, quote.id),
    assertContactable(db, quote),
  ]);
  check(
    result.error,
    "The communication hub database migration is required before conversations can load.",
  );
  let name = pub?.customerName || quote.customer_name || "",
    email = pub?.customerEmail || quote.customer_email;
  if ((!name || !email) && quote.job_id) {
    const { data: job, error } = await db
      .from("crm_jobs")
      .select("customer_name,email")
      .eq("id", quote.job_id)
      .maybeSingle();
    check(error);
    name ||= job?.customer_name || "";
    email ||= job?.email || null;
  }
  return {
    quoteId: quote.id,
    name: name || "Customer",
    email,
    quoteNumber: quote.quote_number || "Quote",
    sentAt: quote.sent_at,
    total: pub?.total ?? quote.quote_total,
    url: quote.share_token
      ? `${base()}/quote/${encodeURIComponent(quote.share_token)}`
      : null,
    canSend: !blocked && !!email && EMAIL.test(email) && !!pub,
    blockedReason:
      blocked ||
      (!email || !EMAIL.test(email)
        ? "Add a valid customer email in the quote editor."
        : !pub
          ? "Send the original quote from its editor to create its customer link."
          : null),
    basis: pub
      ? {
          subtotal: pub.subtotal,
          total: pub.total,
          adjustments: pub.adjustments,
          sourceAdjustment: pub.sourceTotalAdjustment,
          allPriced: pub.allPriced,
        }
      : null,
    messages: result.data as HubMessage[],
    photos,
  };
}
export async function saveHubDraft(
  db: SupabaseClient,
  quote: CrmQuote,
  actor: string,
  input: unknown,
) {
  let draft: HubDraft;
  try {
    draft = validateHubDraft(input);
  } catch (error) {
    return userError(error);
  }
  const { data: existing, error: readError } = await db
    .from("crm_quote_hub_messages")
    .select("id")
    .eq("quote_id", quote.id)
    .eq("actor_email", actor)
    .eq("action", draft.action)
    .eq("status", "draft")
    .maybeSingle();
  check(readError);
  const values = {
    quote_id: quote.id,
    actor_email: actor,
    action: draft.action,
    status: "draft",
    subject: draft.subject,
    body: draft.body,
    payload: { draft },
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await db
        .from("crm_quote_hub_messages")
        .update(values)
        .eq("id", existing.id)
    : await db.from("crm_quote_hub_messages").insert(values);
  check(error);
  return { ok: true };
}
export async function addHubNote(
  db: SupabaseClient,
  quote: CrmQuote,
  actor: string,
  body: unknown,
) {
  if (typeof body !== "string" || !body.trim() || body.length > 4000)
    throw new CrmAuthError(400, "Enter a note of up to 4,000 characters.");
  const { error } = await db
    .from("crm_quote_hub_messages")
    .insert({
      quote_id: quote.id,
      actor_email: actor,
      action: "note",
      status: "note",
      body: body.trim(),
    });
  check(error);
  return { ok: true };
}
export async function prepareHubEmail(
  db: SupabaseClient,
  quote: CrmQuote,
  actor: string,
  input: unknown,
) {
  let draft: HubDraft;
  try {
    draft = validateHubDraft(input);
  } catch (error) {
    return userError(error);
  }
  const state = await loadHubConversation(db, quote);
  if (!state.canSend)
    throw new CrmAuthError(
      409,
      state.blockedReason || "This quote cannot be contacted.",
    );
  if (draft.photoIds.some((id) => !state.photos.some((p) => p.id === id)))
    throw new CrmAuthError(
      400,
      "A selected photo is not available for this quote.",
    );
  // Read and validate attachments before creating a reviewed message, so a broken
  // file cannot create an offer or produce a partially composed customer email.
  await hubAttachments(db, quote.id, draft.photoIds);
  let offer = null;
  try {
    if (draft.action === "savings")
      offer = hubOffer(state.basis!, draft.percent);
  } catch (error) {
    return userError(error);
  }
  if (
    state.messages.some((m) => m.status === "sending" || m.status === "unknown")
  )
    throw new CrmAuthError(
      409,
      "Check delivery of the pending email before preparing another message.",
    );
  const id = randomUUID(),
    offerId = offer ? randomUUID() : undefined,
    offerToken = offer ? randomUUID() : undefined;
  const url = offer ? `${base()}/quote/${offerToken}` : state.url!;
  const { data: fingerprint, error } = await db.rpc("quote_hub_fingerprint", {
    p_quote_id: quote.id,
  });
  check(error);
  const incoming = [...state.messages]
    .reverse()
    .find((m) => m.status === "received" && m.payload.rfcMessageId);
  // The quote reference is visible in the preview and permits exact reply matching.
  const suffix = `[${state.quoteNumber}]`;
  if (!draft.subject.includes(suffix))
    draft = { ...draft, subject: `${draft.subject} ${suffix}` };
  const mail = hubEmail(draft, offer, url, draft.photoIds);
  const message = {
    id,
    quote_id: quote.id,
    actor_email: actor,
    action: draft.action,
    status: "prepared",
    recipient: state.email,
    subject: draft.subject,
    body: draft.body,
    payload: {
      draft,
      offer,
      photoIds: draft.photoIds,
      fingerprint,
      offerId,
      offerToken,
      url,
      html: mail.html,
      rfcMessageId: `<${id}@805shutters.com>`,
      replyToMessageId: incoming?.payload.rfcMessageId,
    },
  };
  const { data, error: insertError } = await db
    .from("crm_quote_hub_messages")
    .insert(message)
    .select("*")
    .single();
  check(insertError);
  return data as HubMessage;
}
async function hubAttachments(
  db: SupabaseClient,
  quoteId: string,
  ids: string[],
): Promise<HubAttachment[]> {
  const attachments: HubAttachment[] = [];
  for (const id of ids) {
    const builtin = HUB_PHOTOS.find((p) => p.id === id);
    if (builtin) {
      attachments.push({
        content: await readFile(
          path.join(process.cwd(), "public", builtin.url),
        ),
        contentType: "image/jpeg",
        filename: id + ".jpg",
      });
      continue;
    }
    if (!UUID.test(id)) throw new CrmAuthError(400, "Invalid photo.");
    const { data: photo, error } = await db
      .from("crm_quote_hub_photos")
      .select("*")
      .eq("id", id)
      .eq("quote_id", quoteId)
      .maybeSingle();
    check(error);
    if (!photo)
      throw new CrmAuthError(400, "Photo is not available for this quote.");
    const downloaded = await db.storage
      .from("quote-hub-photos")
      .download(photo.storage_path);
    check(downloaded.error);
    if (!downloaded.data)
      throw new CrmAuthError(502, "Photo could not be loaded.");
    attachments.push({
      content: Buffer.from(await downloaded.data.arrayBuffer()),
      contentType: photo.content_type,
      filename: photo.title,
    });
  }
  if (attachments.reduce((n, a) => n + a.content.length, 0) > 8 * 1024 * 1024)
    throw new CrmAuthError(400, "Choose photos totaling less than 8 MB.");
  return attachments;
}
export async function sendHubEmail(
  db: SupabaseClient,
  quote: CrmQuote,
  actor: string,
  messageId: unknown,
) {
  if (typeof messageId !== "string" || !UUID.test(messageId))
    throw new CrmAuthError(400, "Preview the email first.");
  const { data: review, error } = await db
    .from("crm_quote_hub_messages")
    .select("*")
    .eq("id", messageId)
    .eq("quote_id", quote.id)
    .eq("actor_email", actor)
    .maybeSingle();
  check(error);
  if (!review) throw new CrmAuthError(404, "Reviewed email not found.");
  const message = review as HubMessage;
  if (message.status === "sent")
    return { status: "sent", messageId: message.id };
  assertHubDeliveryConfigured();
  const retry = message.status === "sending" || message.status === "unknown";
  if (!retry && message.status !== "prepared")
    throw new CrmAuthError(409, "Preview a new email before sending.");
  const current = await loadHubConversation(db, quote);
  if (!current.canSend || current.email !== message.recipient)
    throw new CrmAuthError(
      409,
      current.blockedReason || "Customer email changed. Preview again.",
    );
  const attachments = await hubAttachments(
    db,
    quote.id,
    message.payload.photoIds || [],
  );
  const draft = message.payload.draft!;
  const mail = hubEmail(
    draft,
    message.payload.offer || null,
    message.payload.url!,
    message.payload.photoIds || [],
  );
  if (!retry) {
    const claim = await db.rpc("claim_quote_hub_message", {
      p_message_id: message.id,
    });
    if (claim.error) throw new CrmAuthError(409, claim.error.message);
    if (!claim.data?.claimed)
      throw new CrmAuthError(
        409,
        "This email is already being processed. Refresh the conversation.",
      );
  }
  try {
    const providerId = await deliverHubEmail({
      id: message.id,
      createdAt: message.created_at,
      to: message.recipient!,
      subject: message.subject,
      ...mail,
      rfcMessageId: message.payload.rfcMessageId!,
      replyToMessageId: message.payload.replyToMessageId,
      attachments,
    });
    const result = await db.rpc("finish_quote_hub_message", {
      p_message_id: message.id,
      p_provider_id: providerId,
    });
    check(result.error);
    return { status: "sent", messageId: message.id };
  } catch (error) {
    const result = await db
      .from("crm_quote_hub_messages")
      .update({
        status: error instanceof HubDeliveryRejected ? "failed" : "unknown",
        payload: {
          ...message.payload,
          error:
            error instanceof Error ? error.message : "Delivery not confirmed.",
        },
      })
      .eq("id", message.id)
      .in("status", ["sending", "unknown"]);
    check(
      result.error,
      "Email delivery and history need reconciliation. Check the email provider before sending another message.",
    );
    if (error instanceof HubDeliveryRejected)
      throw new CrmAuthError(502, error.message);
    throw new CrmAuthError(
      502,
      "Email delivery is not confirmed. Use Check delivery in the conversation; do not send a replacement yet.",
    );
  }
}
export function hubReplyMatches(
  message: HubGmailMessage,
  email: string,
  quoteNumber: string,
  rfcIds: string[],
) {
  const from =
    hubGmailHeader(message, "From").match(/<([^<>]+)>/)?.[1] ||
    hubGmailHeader(message, "From").trim();
  if (from.toLowerCase() !== email.toLowerCase()) return false;
  const refs =
    hubGmailHeader(message, "In-Reply-To") +
    " " +
    hubGmailHeader(message, "References");
  return (
    rfcIds.some((id) => refs.split(/\s+/).includes(id)) ||
    (quoteNumber !== "Quote" &&
      hubGmailHeader(message, "Subject").includes(`[${quoteNumber}]`))
  );
}
export async function syncHubReplies(db: SupabaseClient, quote: CrmQuote) {
  const state = await loadHubConversation(db, quote);
  if (!state.email || !EMAIL.test(state.email))
    throw new CrmAuthError(
      400,
      "Add a valid customer email in the quote editor.",
    );
  const token = await hubGmailToken();
  const refs = state.messages.flatMap((m) =>
    m.payload.rfcMessageId ? [m.payload.rfcMessageId] : [],
  );
  const after = Math.floor(
    new Date(quote.sent_at || quote.created_at).getTime() / 1000,
  );
  let page: string | undefined,
    count = 0,
    scanned = 0;
  do {
    const params = new URLSearchParams({
      q: `from:${state.email} after:${Number.isFinite(after) ? after : 0}`,
      maxResults: "100",
    });
    if (page) params.set("pageToken", page);
    const data = await hubGmail<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(token, "messages?" + params);
    for (const item of data.messages || []) {
      scanned++;
      if (state.messages.some((m) => m.provider_id === item.id)) continue;
      const message = await hubGmail<HubGmailMessage>(
        token,
        `messages/${encodeURIComponent(item.id)}?format=full`,
      );
      if (!hubReplyMatches(message, state.email, state.quoteNumber, refs))
        continue;
      const payload = { rfcMessageId: hubGmailHeader(message, "Message-ID") };
      const { error } = await db
        .from("crm_quote_hub_messages")
        .upsert(
          {
            quote_id: quote.id,
            action: "reply",
            status: "received",
            subject: hubGmailHeader(message, "Subject"),
            body:
              hubGmailText(message.payload).slice(0, 20000) ||
              "(Reply contains no readable text. Open it in 805 Gmail.)",
            actor_email: state.email,
            recipient: HUB_FROM,
            provider_id: message.id,
            payload,
            created_at: new Date(
              Number(message.internalDate) || Date.now(),
            ).toISOString(),
          },
          { onConflict: "provider_id", ignoreDuplicates: true },
        );
      check(error);
      count++;
    }
    page = data.nextPageToken;
  } while (page && scanned < 300);
  if (count) {
    const { error } = await db.rpc("mark_quote_hub_managed", {
      p_quote_id: quote.id,
    });
    check(error);
  }
  return { count, more: !!page };
}
export async function uploadHubPhoto(
  db: SupabaseClient,
  quote: CrmQuote,
  file: File,
) {
  if (!file.size || file.size > 2 * 1024 * 1024)
    throw new CrmAuthError(
      400,
      "Choose a JPG, PNG, or WebP image smaller than 2 MB.",
    );
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? "image/jpeg"
      : bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP"
          ? "image/webp"
          : null;
  if (!mime)
    throw new CrmAuthError(
      400,
      "Only JPG, PNG, and WebP photos are supported.",
    );
  const id = randomUUID(),
    storagePath = `${quote.id}/${id}`;
  const stored = await db.storage
    .from("quote-hub-photos")
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  check(stored.error);
  const { error } = await db
    .from("crm_quote_hub_photos")
    .insert({
      id,
      quote_id: quote.id,
      title: file.name.slice(0, 120),
      storage_path: storagePath,
      content_type: mime,
    });
  if (error) {
    await db.storage.from("quote-hub-photos").remove([storagePath]);
    check(error);
  }
  return { id };
}
