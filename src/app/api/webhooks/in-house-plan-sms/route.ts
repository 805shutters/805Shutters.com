import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { verifyPlanSmsSignature } from "@/lib/crm/in-house-plan-delivery";
export async function POST(request: NextRequest) {
  const values = Object.fromEntries(new URLSearchParams(await request.text()));
  const url = `${(process.env.NEXT_PUBLIC_SITE_URL || "https://www.805shutters.com").replace(/\/$/, "")}/api/webhooks/in-house-plan-sms/?notification=${encodeURIComponent(request.nextUrl.searchParams.get("notification") || "")}`;
  if (
    !verifyPlanSmsSignature(
      url,
      values,
      request.headers.get("x-twilio-signature"),
    )
  )
    return new NextResponse("Invalid signature", { status: 401 });
  const db = getSupabaseServiceClient();
  if (!db) return new NextResponse("Unavailable", { status: 503 });
  const id = request.nextUrl.searchParams.get("notification");
  const { data, error } = await db
    .from("crm_in_house_plan_notifications")
    .select("id,status,provider_id")
    .eq("id", id)
    .in("channel", ["sms", "owner"])
    .maybeSingle();
  if (error || !data) return new NextResponse("Retry", { status: 503 });
  if (data.provider_id && data.provider_id !== values.MessageSid)
    return new NextResponse("Wrong message", { status: 409 });
  const status =
    values.MessageStatus === "delivered"
      ? "delivered"
      : ["failed", "undelivered"].includes(values.MessageStatus)
        ? "failed"
        : null;
  if (status && data.status !== "delivered") {
    const saved = await db
      .from("crm_in_house_plan_notifications")
      .update({
        status,
        provider_id: values.MessageSid,
        error:
          values.ErrorCode === "21610"
            ? "Recipient opted out of text messages"
            : status === "failed"
              ? `Twilio ${values.ErrorCode || values.MessageStatus}`
              : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .neq("status", "delivered");
    if (saved.error) return new NextResponse("Retry", { status: 503 });
  }
  return new NextResponse("OK");
}
