import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import {
  ProcessInstallationInvoiceResult,
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

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const payload = await request.json().catch(() => ({}));
    const maxResults = typeof payload.maxResults === "number" ? payload.maxResults : undefined;

    const [installationInvoices, orderCogs] = await Promise.allSettled([
      processInstallationInvoiceInbox(supabase, {
        actorEmail: email,
        maxResults
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
