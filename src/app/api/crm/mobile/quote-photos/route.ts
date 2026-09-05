import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import {
  MOBILE_QUOTE_PHOTO_MAX_BYTES,
  listMobileQuotePhotos,
  uploadMobileQuotePhoto,
} from "@/lib/crm/mobile-quote-photos";

export const runtime = "nodejs";

const MAX_MULTIPART_BYTES = MOBILE_QUOTE_PHOTO_MAX_BYTES + 128 * 1024;

function oneText(form: FormData, name: string): string {
  const values = form.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new CrmAuthError(400, `${name} must be supplied exactly once.`);
  }
  return values[0];
}

function oneFile(form: FormData): File {
  const values = form.getAll("file");
  const value = values[0];
  if (
    values.length !== 1 ||
    !value ||
    typeof value === "string" ||
    typeof value.arrayBuffer !== "function"
  ) {
    throw new CrmAuthError(400, "file must be supplied exactly once.");
  }
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
      throw new CrmAuthError(413, "Photo multipart request is too large.");
    }
    const { supabase, user } = await requireCrmUser(request);
    const form = await request.formData().catch(() => {
      throw new CrmAuthError(400, "A valid multipart photo request is required.");
    });
    const allowed = new Set(["quoteId", "lineItemId", "photoId", "file"]);
    const unexpected = [...form.keys()].filter((key) => !allowed.has(key));
    if (unexpected.length) throw new CrmAuthError(400, `Photo request rejected field: ${unexpected[0]}.`);
    const result = await uploadMobileQuotePhoto(supabase, user.id, {
      quoteId: oneText(form, "quoteId"),
      lineItemId: oneText(form, "lineItemId"),
      photoId: oneText(form, "photoId"),
      file: oneFile(form),
    });
    return NextResponse.json(result, {
      status: result.idempotent ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    const quoteId = request.nextUrl.searchParams.get("quoteId") || "";
    const lineItemId = request.nextUrl.searchParams.get("lineItemId");
    const photos = await listMobileQuotePhotos(supabase, user.id, { quoteId, lineItemId });
    return NextResponse.json({ photos }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
