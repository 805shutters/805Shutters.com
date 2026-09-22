import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/notify/email";
import { loadTechnicalMeasureForm, type TechnicalMeasureForm } from "./technical-measures";

export const TECHNICAL_MEASURE_OFFICE = "805@805shutters.com";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function buildTechnicalMeasureOfficeEmail(form: TechnicalMeasureForm) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.805shutters.com").replace(/\/$/, "");
  const contract = form.contractUrl ? new URL(form.contractUrl, origin).href : "Unavailable";
  const subject = `Technical measure ${form.status === "submitted" ? "completed" : "draft"} — ${form.customer_snapshot.name} — ${form.quote_snapshot.quoteNumber || form.id}`;
  const text = [
    subject,
    `Status: ${form.status}`,
    `Contract: ${contract}`,
    `Measure: ${origin}/crm/technical-measures/${encodeURIComponent(form.id)}/`,
    `Contract total: $${form.baseline_total.toFixed(2)}`,
    `Installation duration: ${form.meta.installation_duration_minutes || "Not selected"} minutes`,
    "",
    "Saved field measurements (inches). These do not replace the original contract dimensions.",
    ...form.lines.map((line, index) => {
      const values = line.current_values;
      return [
        `${index + 1}. ${values.room} — Opening ${values.opening_label || "Not selected"}`,
        `Width: ${values.width_in ?? "Not entered"}; Height: ${values.height_in ?? "Not entered"}; Quantity: ${values.quantity}`,
        `Width confirmed: ${Boolean(values.width_confirmed)}; Height confirmed: ${Boolean(values.height_confirmed)}; Opening complete: ${Boolean(values.measure_complete)}`,
        `Product: ${values.product_id}; Program: ${values.program_id || "Not selected"}; Fabric: ${values.fabric || "Not selected"}`,
        ...Object.entries(values.details).map(([key, value]) => `${key}: ${String(value ?? "")}`),
        `Notes: ${values.notes || "None"}`,
        "",
      ].join("\n");
    }),
  ].join("\n");
  return {
    from: "805 Shutters <805@805shutters.com>",
    to: TECHNICAL_MEASURE_OFFICE,
    subject,
    text,
    html: `<pre style="font:14px/1.5 Arial,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    idempotencyKey: `805-measure-office-${createHash("sha256").update(text).digest("hex")}`,
  };
}

/** Always reload persisted values; never email measurements supplied by the browser. */
export async function deliverTechnicalMeasureOfficeEmail(supabase: SupabaseClient, formId: string) {
  const form = await loadTechnicalMeasureForm(supabase, formId);
  return sendEmail(buildTechnicalMeasureOfficeEmail(form));
}
