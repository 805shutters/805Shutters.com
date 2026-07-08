import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import {
  type InstallationInvoiceTarget,
  type ProcessInstallationInvoiceResult,
  processInstallationInvoiceInbox
} from "@/lib/crm/installation-invoices";
import { ProcessOrderCogsResult, processOrderCogsInbox } from "@/lib/crm/order-cogs";

export const runtime = "nodejs";

type ProcessorRun<T> =
  | {
      ok: true;
      result: T;
    }
  | {
      ok: false;
      error: string;
    };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Email processor failed.";
}

function processorRun<T>(settled: PromiseSettledResult<T>): ProcessorRun<T> {
  if (settled.status === "fulfilled") return { ok: true, result: settled.value };
  return { ok: false, error: errorMessage(settled.reason) };
}

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
    const maxResults = typeof payload.maxResults === "number" ? payload.maxResults : undefined;
    const target = installationTargetFromPayload(payload);

    const [installationInvoices, orderCogs] = await Promise.allSettled([
      processInstallationInvoiceInbox(supabase, {
        actorEmail: email,
        maxResults,
        target
      }),
      processOrderCogsInbox(supabase, {
        actorEmail: email,
        maxResults
      })
    ]);

    const response = {
      installationInvoices: processorRun<ProcessInstallationInvoiceResult>(installationInvoices),
      orderCogs: processorRun<ProcessOrderCogsResult>(orderCogs)
    };

    const status = response.installationInvoices.ok || response.orderCogs.ok ? 200 : 502;
    return NextResponse.json(response, { status });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
