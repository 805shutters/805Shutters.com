import { NextRequest, NextResponse } from "next/server";
import { type InstallationInvoiceTarget, processInstallationInvoiceInbox } from "@/lib/crm/installation-invoices";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function installationTargetFromPayload(payload: Record<string, unknown>): InstallationInvoiceTarget | null {
  const rawTarget = payload.installationTarget;
  if (!rawTarget || typeof rawTarget !== "object" || Array.isArray(rawTarget)) return null;

  const target = rawTarget as Record<string, unknown>;
  const installationTarget: InstallationInvoiceTarget = {
    customerName: stringValue(target.customerName),
    jobId: stringValue(target.jobId),
    quoteId: stringValue(target.quoteId),
    existingInstallationAmount: numberValue(target.existingInstallationAmount)
  };

  if (
    !installationTarget.customerName &&
    !installationTarget.jobId &&
    !installationTarget.quoteId &&
    installationTarget.existingInstallationAmount === null
  ) {
    return null;
  }

  return installationTarget;
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const payload = payloadRecord(await request.json().catch(() => ({})));
    const result = await processInstallationInvoiceInbox(supabase, {
      actorEmail: email,
      maxResults: typeof payload.maxResults === "number" ? payload.maxResults : undefined,
      query: typeof payload.query === "string" && payload.query.trim() ? payload.query.trim() : undefined,
      messageIds: Array.isArray(payload.messageIds)
        ? payload.messageIds.filter((id: unknown): id is string => typeof id === "string")
        : undefined,
      target: installationTargetFromPayload(payload)
    });

    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
