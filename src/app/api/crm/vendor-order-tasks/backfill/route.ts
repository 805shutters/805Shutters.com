import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { backfillSubmittedVendorOrderPreparation } from "@/lib/crm/technical-measures";
import type { AgenticOrderManifest } from "@/lib/crm/vendor-orders/manufacturer-order-form-registry";
import {
  buildSignedContractVendorOrderPreparations,
  persistVendorOrderPreparations,
} from "@/lib/crm/vendor-orders/manufacturer-order-task-store";

export const runtime = "nodejs";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user, displayName } = await requireCrmUser(request);
    const actor = { email, userId: user.id, displayName };
    const { data: forms, error: formsError } = await supabase
      .from("crm_technical_measure_forms")
      .select("id")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(500);
    if (formsError) throw new CrmAuthError(502, "Submitted measures could not be loaded for backfill.");

    let measuresBackfilled = 0;
    const errors: string[] = [];
    for (const row of forms || []) {
      try {
        await backfillSubmittedVendorOrderPreparation(supabase, row.id, actor);
        measuresBackfilled += 1;
      } catch (error) {
        errors.push(`Measure ${row.id}: ${error instanceof Error ? error.message : "backfill failed"}`);
      }
    }

    const { data: artifacts, error: artifactsError } = await supabase
      .from("crm_customer_contracts")
      .select("id,customer_id,job_id,quote_id,meta")
      .eq("external_source", "manufacturer_order_manifest")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (artifactsError) throw new CrmAuthError(502, "Signed-contract order packets could not be loaded for backfill.");
    const jobIds = Array.from(new Set((artifacts || []).map((row) => row.job_id).filter(Boolean)));
    const { data: jobs } = jobIds.length
      ? await supabase.from("crm_jobs").select("id,customer_name,phone,email,address,city").in("id", jobIds)
      : { data: [] };
    const jobById = new Map((jobs || []).map((job) => [job.id, job]));

    let contractsBackfilled = 0;
    for (const artifact of artifacts || []) {
      try {
        const current = object(object(artifact.meta).current_manifest);
        const manifest = object(current.manifest) as unknown as AgenticOrderManifest;
        if (manifest.coverPage?.measureStatus !== "no_measure" || !artifact.job_id || !artifact.quote_id) continue;
        const job = object(jobById.get(artifact.job_id));
        const generatedAt = String(current.generatedAt || new Date().toISOString());
        const context = {
          sourceKind: "signed_contract" as const,
          sourceId: String(current.sourceId || `contract:${artifact.quote_id}`),
          sourceRevision: String(current.revisionId || `signed_contract:${artifact.quote_id}:${generatedAt}`),
          technicalMeasureFormId: null,
          jobId: artifact.job_id,
          quoteId: artifact.quote_id,
          customerSnapshot: {
            id: artifact.customer_id,
            name: String(current.customerName || job.customer_name || "Customer"),
            phone: typeof job.phone === "string" ? job.phone : null,
            email: typeof job.email === "string" ? job.email : null,
            address: typeof job.address === "string" ? job.address : null,
            city: typeof job.city === "string" ? job.city : null,
          },
          quoteSnapshot: {
            quoteNumber: typeof current.quoteNumber === "string" ? current.quoteNumber : null,
            signedAt: generatedAt,
          },
        };
        const preparations = buildSignedContractVendorOrderPreparations({ manifest, context, requestedBy: user.id });
        await persistVendorOrderPreparations(supabase, context, preparations);
        contractsBackfilled += 1;
      } catch (error) {
        errors.push(`Contract packet ${artifact.id}: ${error instanceof Error ? error.message : "backfill failed"}`);
      }
    }

    return NextResponse.json({
      measuresBackfilled,
      contractsBackfilled,
      errorCount: errors.length,
      errors: errors.slice(0, 25),
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
