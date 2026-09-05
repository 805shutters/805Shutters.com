import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { ACCOUNT_IDS } from "@mts/lib/accounts";

export const MOBILE_QUOTE_PHOTO_BUCKET = "mobile-quote-photos";
export const MOBILE_QUOTE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const SIGNED_URL_SECONDS = 15 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type PhotoRow = {
  photo_id: string; account_id: string; quote_id: string; line_item_id: string;
  created_by: string; object_path: string; mime_type: string; byte_size: number;
  sha256: string; uploaded_at: string | null; created_at: string;
};
export type MobileQuotePhoto = Readonly<{
  photoId: string; quoteId: string; lineItemId: string; mimeType: string;
  size: number; sha256: string; uploadedAt: string; url: string;
}>;

function uuid(value: unknown, label: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) throw new CrmAuthError(400, `${label} must be a valid UUID.`);
  return value.trim().toLowerCase();
}

export function detectMobileQuotePhotoMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export function validateMobileQuotePhotoFile(file: File) {
  if (!MIME_TYPES.has(file.type)) throw new CrmAuthError(415, "Photo MIME type must be JPEG, PNG, or WebP.");
  if (file.size < 1 || file.size > MOBILE_QUOTE_PHOTO_MAX_BYTES) throw new CrmAuthError(413, "Photo must contain 1-2,097,152 bytes.");
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength !== file.size || detectMobileQuotePhotoMime(bytes) !== file.type) throw new CrmAuthError(415, "Photo bytes do not match the declared image MIME type.");
    return { bytes, mimeType: file.type };
  });
}

const databaseFailure = (message: string) => new CrmAuthError(502, message);

async function requireQuote(supabase: SupabaseClient, quoteId: string, actorId: string, ownerOnly: boolean) {
  let query = supabase
    .from("sales_quotes")
    .select("id,account_id,created_by,status,quote_v2_backend")
    .eq("id", quoteId)
    .eq("account_id", ACCOUNT_IDS.SHUTTERS_805)
    .is("deleted_at", null);
  if (ownerOnly) query = query.eq("created_by", actorId);
  const result = await query.maybeSingle();
  if (result.error) throw databaseFailure("The photo quote could not be verified.");
  if (!result.data) throw new CrmAuthError(404, "The 805 quote was not found or is not accessible.");
  if (ownerOnly && (result.data.status !== "draft" || result.data.quote_v2_backend !== true)) throw new CrmAuthError(409, "Photos can only be added to an owned authoritative V2 draft.");
}

async function requireLine(supabase: SupabaseClient, quoteId: string, lineItemId: string) {
  const result = await supabase.from("sales_quote_line_items").select("id").eq("id", lineItemId).eq("quote_id", quoteId).maybeSingle();
  if (result.error) throw databaseFailure("The photo window could not be verified.");
  if (!result.data) throw new CrmAuthError(404, "The line item does not belong to this quote.");
}

async function loadPhoto(supabase: SupabaseClient, photoId: string): Promise<PhotoRow | null> {
  const result = await supabase.from("mobile_quote_photos").select("*").eq("photo_id", photoId).maybeSingle();
  if (result.error) throw databaseFailure("Photo retry state could not be loaded.");
  return (result.data as PhotoRow | null) ?? null;
}

function assertSameBinding(row: PhotoRow, expected: Omit<PhotoRow, "uploaded_at" | "created_at">) {
  for (const key of ["account_id", "quote_id", "line_item_id", "created_by", "object_path", "mime_type", "byte_size", "sha256"] as const) {
    if (row[key] !== expected[key]) throw new CrmAuthError(409, "This photoId is already bound to different photo bytes or quote data.");
  }
}

async function signedPhoto(supabase: SupabaseClient, row: PhotoRow): Promise<MobileQuotePhoto> {
  if (!row.uploaded_at) throw databaseFailure("Photo upload has not completed.");
  const signed = await supabase.storage.from(MOBILE_QUOTE_PHOTO_BUCKET).createSignedUrl(row.object_path, SIGNED_URL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) throw databaseFailure("A private photo URL could not be created.");
  return { photoId: row.photo_id, quoteId: row.quote_id, lineItemId: row.line_item_id, mimeType: row.mime_type, size: row.byte_size, sha256: row.sha256, uploadedAt: row.uploaded_at, url: signed.data.signedUrl };
}

export async function uploadMobileQuotePhoto(supabase: SupabaseClient, actorIdValue: string, input: Readonly<{ quoteId: string; lineItemId: string; photoId: string; file: File }>) {
  const actorId = uuid(actorIdValue, "actorId");
  const quoteId = uuid(input.quoteId, "quoteId");
  const lineItemId = uuid(input.lineItemId, "lineItemId");
  const photoId = uuid(input.photoId, "photoId");
  const { bytes, mimeType } = await validateMobileQuotePhotoFile(input.file);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const objectPath = `${ACCOUNT_IDS.SHUTTERS_805}/${quoteId}/${lineItemId}/${photoId}`;
  const expected = { photo_id: photoId, account_id: ACCOUNT_IDS.SHUTTERS_805, quote_id: quoteId, line_item_id: lineItemId, created_by: actorId, object_path: objectPath, mime_type: mimeType, byte_size: bytes.byteLength, sha256 };
  await requireQuote(supabase, quoteId, actorId, true);
  await requireLine(supabase, quoteId, lineItemId);

  let row = await loadPhoto(supabase, photoId);
  const wasComplete = Boolean(row?.uploaded_at);
  if (row) assertSameBinding(row, expected);
  else {
    const inserted = await supabase.from("mobile_quote_photos").insert(expected).select("*").single();
    if (!inserted.error) row = inserted.data as PhotoRow;
    else if ((inserted.error as { code?: string }).code === "23505") {
      row = await loadPhoto(supabase, photoId);
      if (!row) throw databaseFailure("Photo retry state conflicted but could not be loaded.");
      assertSameBinding(row, expected);
    } else throw databaseFailure("Photo retry state could not be created.");
  }
  if (!row) throw databaseFailure("Photo retry state was not created.");
  if (!row.uploaded_at) {
    const uploaded = await supabase.storage.from(MOBILE_QUOTE_PHOTO_BUCKET).upload(objectPath, bytes, { contentType: mimeType, cacheControl: "0", upsert: true });
    if (uploaded.error) throw databaseFailure("The private photo object could not be uploaded.");
    const completed = await supabase.from("mobile_quote_photos").update({ uploaded_at: new Date().toISOString() }).eq("photo_id", photoId).eq("sha256", sha256).select("*").single();
    if (completed.error || !completed.data) throw databaseFailure("The photo upload completion could not be recorded. Retry safely with the same photoId.");
    row = completed.data as PhotoRow;
  }
  return { photo: await signedPhoto(supabase, row), idempotent: wasComplete } as const;
}

export async function listMobileQuotePhotos(supabase: SupabaseClient, actorIdValue: string, input: Readonly<{ quoteId: string; lineItemId?: string | null }>) {
  const actorId = uuid(actorIdValue, "actorId");
  const quoteId = uuid(input.quoteId, "quoteId");
  const lineItemId = input.lineItemId ? uuid(input.lineItemId, "lineItemId") : null;
  await requireQuote(supabase, quoteId, actorId, false);
  if (lineItemId) await requireLine(supabase, quoteId, lineItemId);
  let query = supabase.from("mobile_quote_photos").select("*").eq("account_id", ACCOUNT_IDS.SHUTTERS_805).eq("quote_id", quoteId).not("uploaded_at", "is", null);
  if (lineItemId) query = query.eq("line_item_id", lineItemId);
  const result = await query.order("created_at", { ascending: true }).order("photo_id", { ascending: true });
  if (result.error) throw databaseFailure("Quote photos could not be loaded.");
  return Promise.all(((result.data ?? []) as PhotoRow[]).map((row) => signedPhoto(supabase, row)));
}
