import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import { sendEmail } from "@/lib/notify/email";
import { buildVendorOrderPacketEmail } from "@/lib/crm/vendor-orders/vendor-order-packet-email";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const { data: task, error } = await supabase
      .from("crm_vendor_order_drafts")
      .select("id,crm_job_id,crm_quote_id,manufacturer,product_type,status,source_kind,source_revision,customer_snapshot,quote_snapshot,routing_keys,product_names,line_count,portal_url,order_packet_url,payload")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new CrmAuthError(502, "The manufacturer order packet could not be loaded.");
    if (!task) throw new CrmAuthError(404, "The manufacturer order packet was not found.");
    if (!["needs_input", "queued", "processing", "review_ready", "failed"].includes(String(task.status))) {
      throw new CrmAuthError(409, "This manufacturer order packet is no longer active.");
    }

    const message = await buildVendorOrderPacketEmail(task);
    const result = await sendEmail({
      to: message.recipient,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments,
      idempotencyKey: message.idempotencyKey,
    });
    if (!result.sent) {
      throw new CrmAuthError(502, result.error || result.skipped || "The Codex order packet email could not be sent.");
    }

    await recordCrmActivity(supabase, { email, userId: user.id }, {
      entityType: "job",
      entityId: task.crm_job_id,
      action: "vendor_order.packet_emailed",
      metadata: {
        taskId: task.id,
        quoteId: task.crm_quote_id,
        manufacturer: task.manufacturer,
        recipient: message.recipient,
        messageId: result.id || null,
        attachmentNames: message.attachments.map((attachment) => attachment.filename),
      },
    });
    return NextResponse.json({
      sent: true,
      recipient: message.recipient,
      messageId: result.id || null,
      attachments: message.attachments.map((attachment) => attachment.filename),
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
