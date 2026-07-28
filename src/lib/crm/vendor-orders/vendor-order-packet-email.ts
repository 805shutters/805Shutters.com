import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

function pdfSafe(value: unknown) {
  return String(value ?? "").replace(/[^\x20-\x7E]/g, "-");
}

function wrapPdfText(
  value: unknown,
  font: { widthOfTextAtSize(text: string, size: number): number },
  size: number,
  maxWidth: number,
) {
  const words = pdfSafe(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function buildPacketPdf(input: {
  customerName: string;
  quoteNumber: string;
  manufacturer: string;
  productName: string;
  sourceLabel: string;
  customer: Record<string, unknown>;
  lines: Record<string, unknown>[];
}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.07, 0.07, 0.07);
  const muted = rgb(0.36, 0.35, 0.33);
  const rule = rgb(0.76, 0.75, 0.71);
  const wash = rgb(0.95, 0.94, 0.91);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;

  const addHeader = (page: ReturnType<typeof pdf.addPage>, eyebrow: string, title: string) => {
    page.drawRectangle({ x: margin, y: pageHeight - 50, width: pageWidth - margin * 2, height: 5, color: ink });
    page.drawText(pdfSafe(eyebrow).toUpperCase(), { x: margin, y: pageHeight - 76, size: 9, font: bold, color: muted });
    const titleLines = wrapPdfText(title, bold, 23, pageWidth - margin * 2);
    titleLines.forEach((line, index) => {
      page.drawText(line, { x: margin, y: pageHeight - 105 - index * 26, size: 23, font: bold, color: ink });
    });
    return pageHeight - 124 - Math.max(0, titleLines.length - 1) * 26;
  };

  const drawRows = (
    page: ReturnType<typeof pdf.addPage>,
    rows: Array<[string, unknown]>,
    startY: number,
  ) => {
    let y = startY;
    for (const [label, value] of rows) {
      const valueLines = wrapPdfText(value, regular, 10, 332);
      const height = Math.max(28, 12 + valueLines.length * 12);
      page.drawRectangle({ x: margin, y: y - height, width: 142, height, color: wash, borderColor: rule, borderWidth: 0.6 });
      page.drawRectangle({ x: margin + 142, y: y - height, width: 374, height, borderColor: rule, borderWidth: 0.6 });
      page.drawText(pdfSafe(label).toUpperCase(), { x: margin + 8, y: y - 18, size: 8, font: bold, color: muted });
      valueLines.forEach((line, index) => {
        page.drawText(line, { x: margin + 152, y: y - 18 - index * 12, size: 10, font: regular, color: ink });
      });
      y -= height;
    }
    return y;
  };

  const drawFooter = (page: ReturnType<typeof pdf.addPage>, pageNumber: number) => {
    page.drawText("805 Shutters - Agentic Order Form", { x: margin, y: 30, size: 8, font: regular, color: muted });
    page.drawText(`Page ${pageNumber}`, { x: pageWidth - margin - 32, y: 30, size: 8, font: regular, color: muted });
  };

  const cover = pdf.addPage([pageWidth, pageHeight]);
  let y = addHeader(cover, "805 Shutters - Agentic Order Form", `${input.customerName} - ${input.manufacturer}`);
  y = drawRows(cover, [
    ["Customer", input.customerName],
    ["Contract / quote", input.quoteNumber],
    ["Manufacturer", input.manufacturer],
    ["Product", input.productName],
    ["Source", input.sourceLabel],
    ["Line items", input.lines.length || 1],
    ["Phone", input.customer.phone],
    ["Email", input.customer.email],
    ["Project address", input.customer.address || input.customer.city],
  ], y - 8);
  drawFooter(cover, 1);

  input.lines.forEach((line, index) => {
    const page = pdf.addPage([pageWidth, pageHeight]);
    const lineTitle = String(line.productName || line.room || `Line ${index + 1}`);
    const startY = addHeader(
      page,
      `${input.manufacturer} - Line ${index + 1} of ${input.lines.length}`,
      lineTitle,
    );
    drawRows(page, printableValues(line.sourceValues || line.values || line), startY - 8);
    drawFooter(page, index + 2);
  });

  return Buffer.from(await pdf.save()).toString("base64");
}

export async function buildVendorOrderPacketEmail(task: VendorOrderEmailTask) {
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
    order: payload,
  };
  const productName = stringArray(task.product_names).join(", ") || task.product_type;
  const baseName = `${slug(customerName)}-${slug(manufacturer)}-Agentic-Order-Form`;
  const subject = `${customerName} - Agentic Order Form`;
  const text = `Manufacturers: ${manufacturer}`;
  const html = `<p>Manufacturers: ${escapeHtml(manufacturer)}</p>`;
  const pdfContent = await buildPacketPdf({
    customerName,
    quoteNumber,
    manufacturer,
    productName,
    sourceLabel,
    customer,
    lines: payloadLines,
  });

  return {
    recipient: CODEX_ORDER_RECIPIENT,
    subject,
    text,
    html,
    idempotencyKey: `vendor-order-packet-${task.id}-${task.source_revision}`.slice(0, 255),
    attachments: [
      {
        filename: `${baseName}.pdf`,
        content: pdfContent,
        contentType: "application/pdf",
      },
    ],
    packet,
  };
}
