import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function manufacturerRevision(value: unknown, manufacturer: string) {
  const revision = object(value);
  if (!manufacturer) return revision;
  const manifest = object(revision.manifest);
  const pages = Array.isArray(manifest.lineItemPages) ? manifest.lineItemPages : [];
  const lineItemPages = pages.filter((page) => {
    const routingKey = String(object(page).routingKey || "").toLowerCase();
    return routingKey.startsWith(`${manufacturer}:`);
  });
  return {
    ...revision,
    manifest: {
      ...manifest,
      lineItemPages,
      releaseStatus: lineItemPages.length > 0
        && lineItemPages.every((page) => object(page).status === "ready")
        ? "ready"
        : "order_review_required",
    },
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ quoteId: string }> },
) {
  try {
    const { supabase } = await requireCrmUser(request);
    const { quoteId } = await context.params;
    const manufacturer = (request.nextUrl.searchParams.get("manufacturer") || "").trim().toLowerCase();
    if (manufacturer && !["norman", "onyx", "lotus", "polar"].includes(manufacturer)) {
      throw new CrmAuthError(400, "The manufacturer packet filter is invalid.");
    }
    const { data, error } = await supabase
      .from("crm_customer_contracts")
      .select("id,title,status,updated_at,meta")
      .eq("external_source", "manufacturer_order_manifest")
      .eq("external_id", `manufacturer-order-manifest:${quoteId}`)
      .maybeSingle();
    if (error) throw new CrmAuthError(502, "The agentic ordering packet could not be loaded.");
    if (!data) throw new CrmAuthError(404, "The agentic ordering packet was not found.");
    const meta = data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
      ? data.meta as Record<string, unknown>
      : {};
    const packet = manufacturerRevision(meta.current_manifest, manufacturer);
    const packetPages = object(packet.manifest).lineItemPages;
    if (manufacturer && (!Array.isArray(packetPages) || packetPages.length === 0)) {
      throw new CrmAuthError(404, "The manufacturer packet was not found.");
    }
    return NextResponse.json({
      packet,
      history: Array.isArray(meta.manifest_history)
        ? meta.manifest_history.map((revision) => manufacturerRevision(revision, manufacturer))
        : [],
      manufacturer: manufacturer || null,
      artifact: {
        id: data.id,
        title: data.title,
        status: data.status,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
