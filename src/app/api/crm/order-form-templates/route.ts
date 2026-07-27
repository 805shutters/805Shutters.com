import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import {
  manufacturerOrderFormRegistry,
  technicalMeasureTemplateRelativePath,
} from "@/lib/crm/vendor-orders/manufacturer-order-form-registry";

export const runtime = "nodejs";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const registry = manufacturerOrderFormRegistry();
    const templates = Object.values(registry.manufacturers)
      .flat()
      .map((entry) => ({
        ...entry,
        template_version: 1,
        docx_url: `/order-form-templates/${entry.template_docx}`,
        pdf_url: `/order-form-templates/${entry.template_docx.replace(/\.docx$/i, ".pdf")}`,
        schema_url: `/order-form-templates/${entry.schema}`,
        measure_docx_url: `/technical-measure-templates/${technicalMeasureTemplateRelativePath(entry, "docx")}`,
        measure_pdf_url: `/technical-measure-templates/${technicalMeasureTemplateRelativePath(entry, "pdf")}`,
      }))
      .sort((left, right) =>
        left.manufacturer.localeCompare(right.manufacturer)
        || left.product_name.localeCompare(right.product_name));

    const { data: packetRows } = await supabase
      .from("crm_customer_contracts")
      .select("id,title,status,updated_at,quote_id,customer_id,contract_url,meta")
      .eq("external_source", "manufacturer_order_manifest")
      .order("updated_at", { ascending: false })
      .limit(50);

    const packets = (packetRows || []).map((row) => {
      const meta = object(row.meta);
      const current = object(meta.current_manifest);
      const manifest = object(current.manifest);
      const pages = Array.isArray(manifest.lineItemPages) ? manifest.lineItemPages : [];
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        updated_at: row.updated_at,
        quote_id: row.quote_id,
        customer_id: row.customer_id,
        contract_url: row.contract_url,
        customer_name: typeof current.customerName === "string" ? current.customerName : null,
        quote_number: typeof current.quoteNumber === "string" ? current.quoteNumber : null,
        authoritative_source: typeof current.sourceKind === "string" ? current.sourceKind : null,
        line_item_pages: pages.length,
      };
    });

    return NextResponse.json({
      registry_version: 1,
      packet_rule: "One customer cover page plus one dedicated manufacturer/product page per contract line item.",
      line_pairing_rule: "Each exact manufacturer/product routing key owns one technical-measure document and one ordering document. Contract values seed both; submitted technical-measure values override the linked line before order release.",
      measure_template_count: templates.length,
      templates,
      packets,
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
