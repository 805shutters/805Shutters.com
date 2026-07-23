import { sendTelegramMessage, type TelegramResult } from "@/lib/notify/telegram";

export type NormanOrderReviewAlertInput = {
  formId: string;
  taskId: string;
  customerName?: string | null;
  quoteNumber?: string | null;
  poNumber?: string | null;
  lineCount?: number | null;
  portalDraftId?: string | null;
};

type TelegramSender = (input: { text: string }) => Promise<TelegramResult>;

function clean(value: string | null | undefined, fallback: string) {
  return String(value || "").replace(/\s+/g, " ").trim() || fallback;
}

export function buildNormanOrderReviewTelegram(input: NormanOrderReviewAlertInput) {
  const poNumber = clean(input.poNumber || input.quoteNumber, "PO unavailable");
  const customerName = clean(input.customerName, "Customer unavailable");
  const lineCount = Math.max(0, Math.floor(Number(input.lineCount) || 0));
  const reviewUrl = `https://www.805shutters.com/crm/technical-measures/${encodeURIComponent(input.formId)}`;

  return [
    "✅ 805 ORDER READY TO REVIEW",
    "Manufacturer: Norman",
    `PO: ${poNumber}`,
    `Customer: ${customerName}`,
    `Items entered: ${lineCount}`,
    input.portalDraftId ? `Norman draft: ${clean(input.portalDraftId, "Unavailable")}` : null,
    `Review: ${reviewUrl}`,
    "⚠️ SAVED DRAFT ONLY — THE ORDER HAS NOT BEEN PLACED.",
  ].filter(Boolean).join("\n");
}

export async function sendNormanOrderReviewTelegram(
  input: NormanOrderReviewAlertInput,
  sender: TelegramSender = sendTelegramMessage,
) {
  const text = buildNormanOrderReviewTelegram(input);
  const result = await sender({ text });
  return { text, result };
}
