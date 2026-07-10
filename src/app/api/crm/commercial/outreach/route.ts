import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { previewCommercialOutreach, sendCommercialOutreach } from "@/lib/crm/commercial-outreach";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const payload = (await request.json()) as {
      accountIds?: string[];
      subjectTemplate?: string;
      bodyTemplate?: string;
      mode?: "preview" | "send";
      confirmSend?: boolean;
    };
    const accountIds = Array.isArray(payload.accountIds) ? payload.accountIds.filter((id): id is string => typeof id === "string") : [];
    const subjectTemplate = payload.subjectTemplate || "";
    const bodyTemplate = payload.bodyTemplate || "";

    if (payload.mode === "send") {
      if (payload.confirmSend !== true) return NextResponse.json({ message: "Review and confirm the personalized batch before sending." }, { status: 400 });
      return NextResponse.json(await sendCommercialOutreach(supabase, { accountIds, subjectTemplate, bodyTemplate, actorEmail: email }));
    }

    return NextResponse.json({ previews: await previewCommercialOutreach(supabase, accountIds, subjectTemplate, bodyTemplate) });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
