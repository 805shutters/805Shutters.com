import { sendEmail, type EmailResult } from "@/lib/notify/email";
import { paymentPersonLabel } from "@/lib/crm/partner-payments";
import type { CrmPaymentPerson } from "@/lib/crm/types";

export const partnerPaymentReceiptRecipients: Record<CrmPaymentPerson, string> = {
  ken: "khill31@msn.com",
  jessica: "jessica@805shutters.com",
  mike: "805@805shutters.com"
};

type PartnerPaymentReceiptAllocation = {
  customerName: string;
  quoteNumber?: string | null;
  closedAt?: string | null;
  amount: number;
  total?: number | null;
  jobId?: string | null;
  itemKey?: string | null;
};

type PartnerPaymentReceiptInput = {
  paymentId: string;
  person: CrmPaymentPerson;
  paidOn: string | null;
  amount: number;
  note?: string | null;
  createdByEmail?: string | null;
  allocations: PartnerPaymentReceiptAllocation[];
};

type PdfPage = {
  commands: string[];
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 54;
const PAGE_BOTTOM = 54;

function money(value: unknown) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function shortDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function fileDate(value: string | null | undefined) {
  const raw = value?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return raw.replace(/[^0-9-]/g, "");
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^\x20-\x7E]/g, " ");
}

function pdfEscape(value: unknown) {
  return cleanText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function fit(value: unknown, limit: number) {
  const text = cleanText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function textCommand(text: string, x: number, y: number, size = 10, font = "F1") {
  return `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(text)}) Tj ET`;
}

function ruleCommand(y: number, x1 = PAGE_MARGIN, x2 = PAGE_WIDTH - PAGE_MARGIN) {
  return `0.6 w ${x1} ${y} m ${x2} ${y} l S`;
}

export function buildPartnerPaymentReceiptPdf(input: PartnerPaymentReceiptInput) {
  const pages: PdfPage[] = [{ commands: [] }];
  let currentPage = pages[0];
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  const addPage = () => {
    currentPage = { commands: [] };
    pages.push(currentPage);
    y = PAGE_HEIGHT - PAGE_MARGIN;
    addText("805 Shutters Partner Payment Receipt", PAGE_MARGIN, y, 12, "F2");
    y -= 20;
    addRule();
    y -= 18;
  };

  const ensure = (height: number) => {
    if (y - height >= PAGE_BOTTOM) return;
    addPage();
  };

  const addText = (text: string, x = PAGE_MARGIN, lineY = y, size = 10, font = "F1") => {
    currentPage.commands.push(textCommand(text, x, lineY, size, font));
  };

  const addRule = () => {
    currentPage.commands.push(ruleCommand(y));
  };

  const personName = paymentPersonLabel(input.person);
  addText("805 Shutters", PAGE_MARGIN, y, 11, "F2");
  addText("Partner Payment Receipt", PAGE_MARGIN, y - 28, 22, "F2");
  y -= 50;
  addRule();
  y -= 24;

  addText(`Paid to: ${personName}`, PAGE_MARGIN, y, 11, "F2");
  addText(`Email: ${partnerPaymentReceiptRecipients[input.person]}`, 315, y, 10);
  y -= 18;
  addText(`Payment date: ${shortDate(input.paidOn)}`, PAGE_MARGIN, y, 10);
  addText(`Total paid: ${money(input.amount)}`, 315, y, 11, "F2");
  y -= 18;
  addText(`Payment ID: ${input.paymentId}`, PAGE_MARGIN, y, 9);
  if (input.createdByEmail) addText(`Recorded by: ${input.createdByEmail}`, 315, y, 9);
  y -= 18;
  if (input.note) {
    addText(`Note: ${fit(input.note, 92)}`, PAGE_MARGIN, y, 9);
    y -= 18;
  }

  y -= 10;
  addText("Job breakdown", PAGE_MARGIN, y, 13, "F2");
  y -= 16;
  addRule();
  y -= 14;
  addText("Job", PAGE_MARGIN, y, 9, "F2");
  addText("Closed", 266, y, 9, "F2");
  addText("Job total", 345, y, 9, "F2");
  addText("Paid", 470, y, 9, "F2");
  y -= 12;
  addRule();
  y -= 14;

  for (const allocation of input.allocations) {
    ensure(34);
    const jobLabel = fit([allocation.customerName, allocation.quoteNumber].filter(Boolean).join(" - "), 38);
    addText(jobLabel, PAGE_MARGIN, y, 9);
    addText(shortDate(allocation.closedAt), 266, y, 9);
    addText(allocation.total == null ? "-" : money(allocation.total), 345, y, 9);
    addText(money(allocation.amount), 470, y, 9, "F2");
    y -= 14;
    if (allocation.jobId) {
      addText(`Job ID: ${allocation.jobId}`, PAGE_MARGIN, y, 7);
      y -= 10;
    }
    y -= 4;
  }

  ensure(34);
  addRule();
  y -= 18;
  addText(`Total paid: ${money(input.amount)}`, 365, y, 12, "F2");

  const generatedAt = shortDate(new Date().toISOString());
  pages.forEach((page, index) => {
    page.commands.push(textCommand(`Generated ${generatedAt}`, PAGE_MARGIN, 30, 8, "F1"));
    page.commands.push(textCommand(`Page ${index + 1} of ${pages.length}`, PAGE_WIDTH - 110, 30, 8, "F1"));
  });

  return createPdf(pages);
}

function createPdf(pages: PdfPage[]) {
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 5 + index * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const stream = page.commands.join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    if (!objects[index]) continue;
    offsets[index] = Buffer.byteLength(pdf, "latin1");
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index] || 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

function escapeHtml(value: unknown) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function allocationRowsHtml(allocations: PartnerPaymentReceiptAllocation[]) {
  return allocations
    .map(
      (allocation) => `<tr>
        <td style="padding:8px;border-bottom:1px solid #dddddd"><strong>${escapeHtml(allocation.customerName)}</strong>${allocation.quoteNumber ? `<br><span style="color:#555555">${escapeHtml(allocation.quoteNumber)}</span>` : ""}</td>
        <td style="padding:8px;border-bottom:1px solid #dddddd">${escapeHtml(shortDate(allocation.closedAt))}</td>
        <td style="padding:8px;border-bottom:1px solid #dddddd;text-align:right">${allocation.total == null ? "-" : money(allocation.total)}</td>
        <td style="padding:8px;border-bottom:1px solid #dddddd;text-align:right"><strong>${money(allocation.amount)}</strong></td>
      </tr>`
    )
    .join("");
}

export function buildPartnerPaymentReceiptEmail(input: PartnerPaymentReceiptInput) {
  const personName = paymentPersonLabel(input.person);
  const subject = `805 Shutters payment record - ${personName} - ${money(input.amount)}`;
  const text = [
    `${personName} payment recorded`,
    `Total paid: ${money(input.amount)}`,
    `Payment date: ${shortDate(input.paidOn)}`,
    input.note ? `Note: ${input.note}` : null,
    "",
    "Job breakdown:",
    ...input.allocations.map(
      (allocation) =>
        `- ${allocation.customerName}${allocation.quoteNumber ? ` (${allocation.quoteNumber})` : ""}: ${money(allocation.amount)}`
    ),
    "",
    "A PDF copy of this payment record is attached."
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111111;max-width:760px;margin:0 auto;padding:24px">
    <h1 style="font-size:22px;margin:0 0 8px 0">805 Shutters payment record</h1>
    <p style="font-size:14px;margin:0 0 18px 0;color:#333333">A partner payment was recorded for <strong>${escapeHtml(personName)}</strong>. The PDF receipt is attached for your records.</p>
    <div style="border:1px solid #111111;padding:14px 16px;margin:0 0 18px 0">
      <div style="font-size:12px;text-transform:uppercase;color:#555555">Total paid</div>
      <div style="font-size:28px;font-weight:700">${money(input.amount)}</div>
      <div style="font-size:13px;color:#333333;margin-top:4px">Payment date: ${escapeHtml(shortDate(input.paidOn))}</div>
      ${input.note ? `<div style="font-size:13px;color:#333333;margin-top:4px">Note: ${escapeHtml(input.note)}</div>` : ""}
    </div>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr>
          <th align="left" style="padding:8px;border-bottom:2px solid #111111">Job</th>
          <th align="left" style="padding:8px;border-bottom:2px solid #111111">Closed</th>
          <th align="right" style="padding:8px;border-bottom:2px solid #111111">Job total</th>
          <th align="right" style="padding:8px;border-bottom:2px solid #111111">Paid</th>
        </tr>
      </thead>
      <tbody>${allocationRowsHtml(input.allocations)}</tbody>
    </table>
  </div>`;
  return { subject, text, html };
}

export async function sendPartnerPaymentReceiptEmail(input: PartnerPaymentReceiptInput): Promise<
  EmailResult & { to: string; filename: string }
> {
  const to = partnerPaymentReceiptRecipients[input.person];
  const pdf = buildPartnerPaymentReceiptPdf(input);
  const email = buildPartnerPaymentReceiptEmail(input);
  const filename = `805-shutters-${input.person}-payment-${fileDate(input.paidOn)}-${input.paymentId.slice(0, 8)}.pdf`;
  const result = await sendEmail({
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: [
      {
        filename,
        content: pdf.toString("base64"),
        contentType: "application/pdf"
      }
    ]
  });
  return { ...result, to, filename };
}

export function partnerPaymentReceiptAllocationFromRow(row: Record<string, unknown>): PartnerPaymentReceiptAllocation {
  const meta = row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : {};
  return {
    customerName: cleanText(row.customer_name || "Unknown customer"),
    quoteNumber: typeof meta.quoteNumber === "string" ? meta.quoteNumber : null,
    closedAt: typeof row.closed_at === "string" ? row.closed_at : null,
    amount: Number(row.amount) || 0,
    total: typeof meta.total === "number" ? meta.total : Number(meta.total) || null,
    jobId: typeof row.job_id === "string" ? row.job_id : null,
    itemKey: typeof row.item_key === "string" ? row.item_key : null
  };
}
