type VendorOrderEmailTask = {
  id: string;
  manufacturer: string;
  product_type: string;
  source_kind: string;
  source_revision: string;
  customer_snapshot: unknown;
  quote_snapshot: unknown;
  routing_keys: unknown;
  product_names: unknown;
  line_count: number;
  portal_url: string | null;
  order_packet_url: string | null;
  payload: unknown;
};

const CODEX_ORDER_RECIPIENT = "805@805shutters.com";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slug(value: unknown) {
  return String(value || "order")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "order";
}

function printableValues(value: unknown): Array<[string, string]> {
  const source = object(value);
  const details = object(source.details);
  return Object.entries({ ...source, ...details })
    .filter(([key, item]) => key !== "details" && item !== null && item !== "" && item !== undefined)
    .map(([key, item]) => [
      key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      Array.isArray(item) || (item && typeof item === "object") ? JSON.stringify(item) : String(item),
    ]);
}

export function buildVendorOrderPacketEmail(task: VendorOrderEmailTask) {
  const customer = object(task.customer_snapshot);
  const quote = object(task.quote_snapshot);
  const payload = object(task.payload);
  const payloadLines = Array.isArray(payload.lines) ? payload.lines.map(object) : [];
  const customerName = String(customer.name || payload.customerName || "Customer");
  const quoteNumber = String(quote.quoteNumber || payload.quoteNumber || "").trim();
  const manufacturer = String(task.manufacturer || payload.manufacturer || "Manufacturer");
  const sourceLabel = task.source_kind === "submitted_technical_measure"
    ? "Submitted technical measure"
    : "Signed contract";
  const prompt = `Enter the attached ${manufacturer} order packet using my logged-in Chrome. Prepare the manufacturer order as a draft, audit every line, and stop before checkout, submission, payment, or final confirmation.`;
  const packet = {
    schemaVersion: "codex-order-packet.v1",
    safety: "draft_entry_only_review_before_submission",
    generatedAt: new Date().toISOString(),
    taskId: task.id,
    manufacturer,
    productType: task.product_type,
    source: {
      kind: task.source_kind,
      revision: task.source_revision,
    },
    customer,
    quote,
    routingKeys: stringArray(task.routing_keys),
    productNames: stringArray(task.product_names),
    lineCount: Math.max(1, Number(task.line_count) || payloadLines.length || 1),
    portalUrl: task.portal_url,
    orderPacketUrl: task.order_packet_url,
    codexPrompt: prompt,
    order: payload,
  };
  const coverRows: Array<[string, unknown]> = [
    ["Customer", customerName],
    ["Quote / PO", quoteNumber],
    ["Manufacturer", manufacturer],
    ["Product", stringArray(task.product_names).join(", ") || task.product_type],
    ["Source of truth", sourceLabel],
    ["Line items", packet.lineCount],
    ["Portal", task.portal_url],
  ];
  const lineSections = payloadLines.map((line, index) => {
    const values = printableValues(line.sourceValues || line.values || line);
    return `<section class="line">
      <header><span>LINE ${index + 1} OF ${payloadLines.length}</span><h2>${escapeHtml(line.productName || line.room || `Line ${index + 1}`)}</h2><b>${escapeHtml(line.routingKey || manufacturer)}</b></header>
      <table>${values.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table>
    </section>`;
  }).join("");
  const htmlAttachment = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <title>${escapeHtml(manufacturer)} Codex Order Packet - ${escapeHtml(customerName)}</title>
    <style>
      :root{font-family:Arial,sans-serif;color:#111;background:#ecebe7}body{margin:0;padding:20px}.page,.line{box-sizing:border-box;max-width:980px;margin:0 auto 20px;background:#fff;border:1px solid #bdbbb4;padding:24px}.page{border-top:10px solid #111}.eyebrow,header span{font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#666}h1,h2{margin:5px 0 18px}.prompt{border:2px solid #111;padding:14px;font-weight:700;white-space:pre-wrap}header{border-bottom:4px solid #111;margin-bottom:12px}header b{display:block;margin:0 0 12px;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #c9c7c0;padding:9px;text-align:left;vertical-align:top}th{width:31%;font-size:12px;text-transform:uppercase;background:#f3f2ee}@media print{body{padding:0;background:#fff}.page,.line{min-height:100vh;margin:0;border:0;page-break-after:always}.line:last-child{page-break-after:auto}}
    </style></head><body>
    <section class="page"><p class="eyebrow">805 Shutters · Codex Order Packet</p><h1>${escapeHtml(manufacturer)} Order</h1>
      <table>${coverRows.filter(([, value]) => value).map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table>
      <h2>Instruction for Codex</h2><div class="prompt">${escapeHtml(prompt)}</div>
    </section>${lineSections}</body></html>`;
  const baseName = `${slug(quoteNumber || customerName)}-${slug(manufacturer)}-Codex-Order-Packet`;
  const subject = `Codex order packet: ${customerName} · ${manufacturer}${quoteNumber ? ` · ${quoteNumber}` : ""}`;
  const text = `The complete ${manufacturer} order packet for ${customerName} is attached.\n\nSource: ${sourceLabel}\nLine items: ${packet.lineCount}\n${quoteNumber ? `Quote / PO: ${quoteNumber}\n` : ""}\nCodex instruction:\n${prompt}\n\nAttachments:\n- ${baseName}.html\n- ${baseName}.json\n\nThis packet is for draft entry and review only. It does not authorize manufacturer submission or payment.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:680px;margin:0 auto;padding:24px">
    <p style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#666">805 Shutters · Codex Order Packet</p>
    <h1 style="font-size:25px;margin:6px 0 16px">${escapeHtml(customerName)} · ${escapeHtml(manufacturer)}</h1>
    <p>The complete manufacturer-specific order packet is attached in a readable document and structured JSON.</p>
    <table style="width:100%;border-collapse:collapse;margin:18px 0">
      ${coverRows.filter(([, value]) => value).map(([label, value]) => `<tr><th style="text-align:left;border-top:1px solid #ddd;padding:9px;width:34%">${escapeHtml(label)}</th><td style="border-top:1px solid #ddd;padding:9px">${escapeHtml(value)}</td></tr>`).join("")}
    </table>
    <h2 style="font-size:18px">Paste this instruction into Codex</h2>
    <div style="border:2px solid #111;padding:14px;font-weight:700">${escapeHtml(prompt)}</div>
    <p style="font-size:12px;color:#555;margin-top:20px">Draft entry and review only. This email does not authorize checkout, submission, payment, or final confirmation.</p>
  </div>`;

  return {
    recipient: CODEX_ORDER_RECIPIENT,
    subject,
    text,
    html,
    idempotencyKey: `vendor-order-packet-${task.id}-${task.source_revision}`.slice(0, 255),
    attachments: [
      {
        filename: `${baseName}.html`,
        content: Buffer.from(htmlAttachment, "utf8").toString("base64"),
        contentType: "text/html; charset=utf-8",
      },
      {
        filename: `${baseName}.json`,
        content: Buffer.from(JSON.stringify(packet, null, 2), "utf8").toString("base64"),
        contentType: "application/json",
      },
    ],
    packet,
  };
}
