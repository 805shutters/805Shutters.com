import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import {
  activateCommercialCampaign,
  createCommercialCampaign,
  loadCommercialCampaigns,
  pauseCommercialCampaign,
  previewCommercialCampaign,
  runCommercialCampaigns,
  updateCommercialCampaign
} from "@/lib/crm/commercial-campaigns";
import { syncCommercialReplies } from "@/lib/crm/commercial-replies";

export const runtime = "nodejs";

function campaignId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    return NextResponse.json({ campaigns: await loadCommercialCampaigns(supabase) });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = typeof payload.action === "string" ? payload.action : "";
    const id = campaignId(payload.id);

    if (action === "create") return NextResponse.json({ campaign: await createCommercialCampaign(supabase, payload, email) });
    if (!id) return NextResponse.json({ message: "Commercial campaign ID is required." }, { status: 400 });
    if (action === "update") return NextResponse.json({ campaign: await updateCommercialCampaign(supabase, id, payload) });
    if (action === "preview") return NextResponse.json({ preview: await previewCommercialCampaign(supabase, id) });
    if (action === "activate") return NextResponse.json(await activateCommercialCampaign(supabase, id));
    if (action === "pause") return NextResponse.json({ campaign: await pauseCommercialCampaign(supabase, id) });
    if (action === "run") {
      if (payload.confirmSend !== true) return NextResponse.json({ message: "Review the campaign and confirm before running due messages now." }, { status: 400 });
      let allowFollowUps = false;
      let replySync: Record<string, unknown> = { skipped: true };
      try {
        replySync = await syncCommercialReplies(supabase, email);
        allowFollowUps = true;
      } catch (error) {
        replySync = { skipped: true, error: error instanceof Error ? error.message : "Reply sync failed." };
      }
      return NextResponse.json({ replySync, ...(await runCommercialCampaigns(supabase, { campaignId: id, allowFollowUps })) });
    }

    return NextResponse.json({ message: "Unknown commercial campaign action." }, { status: 400 });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
