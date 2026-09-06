import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import { resolveHubQuote, uploadHubPhoto } from "@/lib/crm/quote-hub";
import type { HubSource } from "@/lib/crm/quote-hub-model";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    if (Number(request.headers.get("content-length")) > 2300000)
      throw new CrmAuthError(400, "Choose a photo smaller than 2 MB.");
    const form = await request.formData(),
      file = form.get("file");
    if (!(file instanceof File)) throw new CrmAuthError(400, "Choose a photo.");
    const quote = await resolveHubQuote(
      supabase,
      String(form.get("source")) as HubSource,
      String(form.get("id")),
    );
    return NextResponse.json(await uploadHubPhoto(supabase, quote, file));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
