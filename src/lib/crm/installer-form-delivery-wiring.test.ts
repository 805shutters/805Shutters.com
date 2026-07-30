import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("installer form sold-path delivery", () => {
  const installerForms = source("./installer-forms.ts");
  const publicQuote = source("./public-quote.ts");
  const salesQuoteSend = source("./sales-quote-send.ts");
  const installerClient = source("../../app/installer-form/[token]/InstallerFormClient.tsx");

  it("uses one form and one provider idempotency key per sold quote", () => {
    expect(installerForms).toContain('.eq("quote_id", quoteId)');
    expect(installerForms).toContain("return deliverInstallerForm(supabase, prepared)");
    expect(installerForms).toContain("installer form already delivered");
    expect(installerForms).toContain("`805-installer-form-${balancePreparedForm.id}-${handoff.sha256.slice(0, 24)}`");
    expect(installerForms).toContain("installation handoff already delivered");
  });

  it("persists an observable success or failure before returning", () => {
    expect(installerForms).toContain("refreshInstallerCustomerBalance");
    expect(installerForms.indexOf("refreshInstallerCustomerBalance")).toBeLessThan(
      installerForms.indexOf("buildInstallerFormPdf(balancePreparedForm"),
    );
    expect(installerForms).toContain("REMAINING CUSTOMER BALANCE:");
    expect(installerForms).toContain('status: workflowStatus');
    expect(installerForms).toContain('? "sent"');
    expect(installerForms).toContain(': "email_failed"');
    expect(installerForms).toContain("email_error: email.error || email.skipped || null");
    expect(installerForms).toContain("if (deliveryError)");
    expect(installerForms).toContain("INSTALLATION_HANDOFF_META_KEY");
  });

  it("wires both new and already-signed public acceptance plus in-home sold", () => {
    expect(publicQuote.match(/createAndSendInstallerForm\(supabase,/g)).toHaveLength(2);
    expect(publicQuote).toContain("quote_signed_retry");
    expect(salesQuoteSend).toContain("const installerForm = await createAndSendInstallerForm");
  });

  it("retries the handoff from submitted Technical Measure completion", () => {
    const technicalMeasures = source("./technical-measures.ts");
    expect(technicalMeasures).toContain(
      'const { createAndSendInstallerForm } = await import("@/lib/crm/installer-forms")',
    );
    expect(technicalMeasures).toContain("installation_duration_minutes");
    expect(technicalMeasures).toContain("submitted_by_source_profile_id");
  });

  it("keeps the token workflow editable and customer pricing out of the public client", () => {
    expect(installerForms).toContain('"cod_original" | "cod_adjusted" | "cod_withheld"');
    expect(installerForms).toContain("report_history");
    expect(installerClient).toContain("Save report update");
    expect(installerClient).not.toContain("form.cod_original");
    expect(installerClient).not.toContain("codAdjusted");
    expect(installerClient).not.toContain("codWithheld");
  });
});
