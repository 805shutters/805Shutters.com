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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function printableValues(value: unknown) {
  const source = object(value);
  const details = object(source.details);
  return Object.entries({ ...source, ...details })
    .filter(([key, item]) => key !== "details" && item !== null && item !== "" && item !== undefined)
    .map(([key, item]) => [
      key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      Array.isArray(item) || (item && typeof item === "object") ? JSON.stringify(item) : String(item),
    ]);
}

function packetHtml(input: {
  artifactTitle: string;
  manufacturer: string;
  packet: Record<string, unknown>;
  customer: Record<string, unknown>;
}) {
  const manifest = object(input.packet.manifest);
  const pages = Array.isArray(manifest.lineItemPages) ? manifest.lineItemPages : [];
  const customerRows = [
    ["Customer", input.customer.name],
    ["Phone", input.customer.phone],
    ["Email", input.customer.email],
    ["Address", [input.customer.address, input.customer.city].filter(Boolean).join(", ")],
    ["Quote", input.packet.quoteNumber],
  ].filter(([, value]) => value);
  const lineHtml = pages.map((page, index) => {
    const line = object(page);
    const values = printableValues(line.sourceValues);
    const links = [
      ["Technical Measure", line.technicalMeasureTemplatePdfUrl],
      ["Ordering Form", line.templatePdfUrl],
    ].filter(([, url]) => typeof url === "string" && url);
    return `<section class="line">
      <header><span>LINE ${index + 1}</span><h2>${escapeHtml(line.productName || "Manufacturer product")}</h2><b>${escapeHtml(line.routingKey)}</b></header>
      <table>${values.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table>
      <nav>${links.map(([label, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`).join("")}</nav>
    </section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <title>${escapeHtml(input.artifactTitle)}</title>
    <style>
      :root{font-family:Arial,sans-serif;color:#111;background:#f4f3ef}body{margin:0;padding:24px}.cover,.line{max-width:980px;margin:0 auto 20px;background:#fff;border:1px solid #d8d6cf;padding:24px}h1,h2{margin:4px 0 14px;letter-spacing:.04em}.eyebrow,header span{font-size:12px;font-weight:800;letter-spacing:.12em;color:#6d6a62;text-transform:uppercase}.cover table,.line table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;border-top:1px solid #e3e1db;padding:10px}th{width:32%;font-size:12px;text-transform:uppercase;color:#666}.line header{border-bottom:3px solid #111;margin-bottom:12px}.line header b{display:block;margin-bottom:12px;font-size:12px}nav{display:flex;gap:10px;margin-top:16px}a{display:inline-block;background:#111;color:#fff;padding:10px 14px;text-decoration:none;font-weight:700}@media(max-width:600px){body{padding:10px}.cover,.line{padding:16px}th{width:40%}}
    </style></head><body>
    <section class="cover"><p class="eyebrow">805 Shutters · Agentic Order Packet</p><h1>${escapeHtml(input.manufacturer)} Order</h1>
      <table>${customerRows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table>
      <p>Review every line against the signed contract or submitted technical measure before manufacturer submission.</p>
    </section>${lineHtml}</body></html>`;
}

function dimension(value: unknown) {
  const parsed = object(value);
  const whole = Number(parsed.whole);
  const fraction = String(parsed.fraction || "").trim();
  if (!Number.isFinite(whole)) return "";
  return `${whole}${fraction ? ` ${fraction}` : ""}`;
}

function onyxPacketHtml(packetValue: unknown) {
  const packet = object(packetValue);
  const source = object(packet.source);
  const header = object(packet.header);
  const lines = Array.isArray(packet.lines) ? packet.lines.map(object) : [];
  const coverRows = [
    ["Customer", source.customerName],
    ["Phone", source.customerPhone],
    ["Email", source.customerEmail],
    ["Jobsite", source.jobsiteAddress],
    ["Quote / PO", source.quoteNumber || header.poNumber],
    ["Product", packet.productDisplayName],
    ["Onyx material", header.materialCategory || "VERIFY IN LIVE ONYX PORTAL"],
    ["Side mark", header.sideMark],
    ["Order note", header.orderNote],
    ["Job notes", source.jobNotes],
  ].filter(([, value]) => value);
  const fieldLabels: Array<[string, string]> = [
    ["material", "Material"],
    ["shutterType", "Type"],
    ["frameType", "Frame Type"],
    ["widthType", "W/F"],
    ["frameNo", "Frame No."],
    ["color", "Color"],
    ["louver", "Louver"],
    ["hingeColor", "Hinge Color"],
    ["stile", "Stile"],
    ["tiltRod", "Tilt Rod"],
    ["panelConfig", "Folding / Panel"],
    ["windowType", "Window Type"],
    ["dividerRail", "Divider Rail"],
    ["splitTiltRod", "Split Tilt Rod"],
    ["itemNote", "Item Note"],
  ];
  const lineHtml = lines.map((line, index) => {
    const rows: Array<[string, unknown]> = [
      ["Room / Opening", line.room],
      ["Quantity", line.portalLineQuantity || 1],
      ["Width A", dimension(line.widthA)],
      ["Height B", dimension(line.heightB)],
      ...fieldLabels.map(([key, label]) => [label, line[key]] as [string, unknown]),
      ["Divider Position", dimension(line.dividerPosition)],
      ["Split Position", dimension(line.splitPosition)],
      ["Other Options", Array.isArray(line.otherOptions) ? line.otherOptions.join(", ") : line.otherOptions],
    ];
    return `<section class="onyx-page">
      <header><div><span>ONYX SHUTTERS · LINE ${index + 1} OF ${lines.length}</span><h2>${escapeHtml(packet.productDisplayName || "Shutter")}</h2></div><b>${escapeHtml(line.room || `Line ${index + 1}`)}</b></header>
      <table>${rows.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table>
      <footer>Review against the submitted technical measure before entering or submitting this line in Onyx.</footer>
    </section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <title>Onyx Order Packet · ${escapeHtml(source.customerName)}</title>
    <style>
      :root{font-family:Arial,sans-serif;color:#111;background:#ecebe7}body{margin:0;padding:20px}.onyx-page{box-sizing:border-box;max-width:980px;min-height:calc(100vh - 40px);margin:0 auto 20px;background:#fff;border:1px solid #bdbbb4;padding:24px}.cover{border-top:10px solid #111}.eyebrow,header span{font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#666}h1,h2{margin:5px 0 18px}.category{display:inline-block;margin:10px 0 22px;padding:8px 12px;background:#111;color:#fff;font-weight:800;letter-spacing:.08em;text-transform:uppercase}header{display:flex;justify-content:space-between;gap:18px;border-bottom:4px solid #111;margin-bottom:12px}header b{align-self:center;font-size:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #c9c7c0;padding:9px;text-align:left;vertical-align:top}th{width:31%;font-size:12px;text-transform:uppercase;background:#f3f2ee}footer{margin-top:18px;padding-top:12px;border-top:1px solid #aaa;font-size:12px;font-weight:700}@media print{body{padding:0;background:#fff}.onyx-page{min-height:100vh;margin:0;border:0;page-break-after:always}.onyx-page:last-child{page-break-after:auto}}@media(max-width:600px){body{padding:8px}.onyx-page{padding:14px}th{width:40%}}
    </style></head><body>
    <section class="onyx-page cover"><p class="eyebrow">805 Shutters · Agentic Ordering Form</p><h1>Onyx Order</h1><div class="category">${escapeHtml(packet.productDisplayName || "Shutter")}</div>
      <table>${coverRows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table>
      <footer>${escapeHtml(packet.allowedAction || "draft_entry_only")} · Do not submit without final human review.</footer>
    </section>${lineHtml}</body></html>`;
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
    if (!data && manufacturer === "onyx") {
      const { data: onyxArtifacts, error: onyxError } = await supabase
        .from("crm_customer_contracts")
        .select("id,title,status,updated_at,meta")
        .eq("external_source", "manufacturer_order_packet")
        .like("external_id", `onyx-order:${quoteId}:%`)
        .order("title");
      if (onyxError) throw new CrmAuthError(502, "The Onyx ordering packet could not be loaded.");
      if (!onyxArtifacts?.length) throw new CrmAuthError(404, "The Onyx ordering packet was not found.");
      const packets = onyxArtifacts.map((row) => object(object(row.meta).current_packet)).filter((packet) => Object.keys(packet).length);
      if (request.nextUrl.searchParams.get("format") === "html") {
        const combinedPacket = packets.length === 1
          ? packets[0]
          : {
              ...packets[0],
              productDisplayName: "Mixed Onyx Products",
              lines: packets.flatMap((packet) => Array.isArray(packet.lines) ? packet.lines : []),
            };
        return new NextResponse(onyxPacketHtml(combinedPacket), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return NextResponse.json({ packets, manufacturer: "onyx" });
    }
    if (!data) throw new CrmAuthError(404, "The agentic ordering packet was not found.");
    const meta = data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
      ? data.meta as Record<string, unknown>
      : {};
    const packet = manufacturerRevision(meta.current_manifest, manufacturer);
    const packetPages = object(packet.manifest).lineItemPages;
    if (manufacturer && (!Array.isArray(packetPages) || packetPages.length === 0)) {
      throw new CrmAuthError(404, "The manufacturer packet was not found.");
    }
    if (request.nextUrl.searchParams.get("format") === "html") {
      const { data: task } = await supabase
        .from("crm_vendor_order_drafts")
        .select("customer_snapshot")
        .eq("crm_quote_id", quoteId)
        .eq("manufacturer", `${manufacturer.charAt(0).toUpperCase()}${manufacturer.slice(1)}`)
        .in("status", ["needs_input", "queued", "processing", "review_ready"])
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return new NextResponse(packetHtml({
        artifactTitle: String(data.title || "Manufacturer Order Packet"),
        manufacturer: `${manufacturer.charAt(0).toUpperCase()}${manufacturer.slice(1)}`,
        packet,
        customer: object(task?.customer_snapshot),
      }), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
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
