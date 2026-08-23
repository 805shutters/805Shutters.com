import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("installer form sold-path delivery", () => {
  const installerForms = source("./installer-forms.ts");
  const soldInvariant = source("./sold-installer-delivery.ts");
  const publicQuote = source("./public-quote.ts");
  const salesQuoteSend = source("./sales-quote-send.ts");
  const quoteBuilder = source("./quote-builder.ts");
  const backend = source("./backend.ts");
  const squarePayments = source("./square-payments.ts");
  const installationInvoices = source("./installation-invoices.ts");
  const vendorOrderTask = source("../../app/api/crm/vendor-order-tasks/[id]/route.ts");
  const modernAdvanceHook = source("../../mts-quote/hooks/useAdvanceQuoteStatus.ts");
  const legacyAdvanceHook = source("../../mts-quote-v1/hooks/useAdvanceQuoteStatus.ts");
  const modernStatusPill = source("../../mts-quote/components/crm/quote-builder/QuoteStatusPill.tsx");
  const legacyStatusPill = source("../../mts-quote-v1/components/crm/quote-builder/QuoteStatusPill.tsx");
  const historicalBackfill = source("./historical-francis-parnell-backfill.ts");
  const mtsSync = source("../../app/api/crm/admin/mts-805-sync/route.ts");
  const bookkeepingImport = source("../../../scripts/import_mts_bookkeeping_to_805.mjs");
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
    expect(installerForms).toContain("The confirmed installer delivery state could not be reconciled");
  });

  it("routes every supported sold transition through one installer-delivery invariant", () => {
    expect(soldInvariant).toContain("export async function ensureSoldQuoteInstallerDelivery");
    expect(soldInvariant).toContain("return createAndSendInstallerForm(supabase, quote.id)");
    expect(publicQuote.match(/ensureSoldQuoteInstallerDelivery\(supabase,/g)).toHaveLength(2);
    expect(publicQuote).toContain("quote_signed_retry");
    expect(salesQuoteSend).toContain("const installerForm = await ensureSoldQuoteInstallerDelivery");
    expect(salesQuoteSend).toContain("{ deferInstallerDelivery: true }");
    expect(salesQuoteSend.indexOf("{ deferInstallerDelivery: true }")).toBeLessThan(
      salesQuoteSend.indexOf("await syncTechnicalMeasureDecisionForSoldCrmQuote"),
    );
    expect(salesQuoteSend.indexOf("await syncTechnicalMeasureDecisionForSoldCrmQuote")).toBeLessThan(
      salesQuoteSend.indexOf("const installerForm = await ensureSoldQuoteInstallerDelivery"),
    );
    expect(quoteBuilder).toContain("await ensureSoldQuoteInstallerDelivery(supabase, updatedQuote)");
    expect(backend.match(/await ensureSoldQuoteInstallerDelivery\(supabase,/g)?.length).toBeGreaterThanOrEqual(2);
    expect(squarePayments.match(/await ensureSoldQuoteInstallerDelivery\(supabase,/g)?.length).toBeGreaterThanOrEqual(4);
    expect(installationInvoices.match(/await ensureSoldQuoteInstallerDelivery\(supabase,/g)).toHaveLength(2);
    expect(vendorOrderTask).toContain("await advanceQuoteStatus(");
    expect(vendorOrderTask).not.toContain('supabase.from("crm_quotes").update({ status: "ordered"');
  });

  it("treats installer delivery as mandatory after contract signing even when other notifications are suppressed", () => {
    const invariant = publicQuote.indexOf(
      "Installer delivery is a signed-contract invariant",
    );
    const delivery = publicQuote.indexOf(
      "await ensureSoldQuoteInstallerDelivery(supabase, signedQuote)",
      invariant,
    );
    const signedReturn = publicQuote.indexOf(
      "return { ok: true, alreadySigned: false",
      delivery,
    );
    const tail = publicQuote.slice(invariant, signedReturn);

    expect(invariant).toBeGreaterThan(-1);
    expect(delivery).toBeGreaterThan(invariant);
    expect(signedReturn).toBeGreaterThan(delivery);
    expect(tail).not.toContain("if (input.notify !== false)");
  });

  it("prevents the client status pills from bypassing the sold workflow", () => {
    for (const hook of [modernAdvanceHook, legacyAdvanceHook]) {
      expect(hook).toContain('if (target === "sold")');
      expect(hook.indexOf('if (target === "sold")')).toBeLessThan(
        hook.indexOf('.update(patch)'),
      );
    }
    for (const pill of [modernStatusPill, legacyStatusPill]) {
      expect(pill).toContain('nextStatus !== "sold"');
    }
  });

  it("blocks job-only sold creation and requires a linked sale for job lifecycle updates", () => {
    expect(backend).toContain("if (saleOwnerSyncJobStatuses.has(status))");
    expect(backend).toContain("const enteringSaleStage = targetIsSaleStage && !existingIsSaleStage");
    expect(backend).toContain("const retryingSold = patch.status === \"sold\" && existing.status === \"sold\"");
    expect(backend).toContain("A job can only enter a sold lifecycle status through a linked sold quote");
    expect(backend).toContain("Create and price the quote first, then use the signed-contract or Mark as Sold workflow");
  });

  it("keeps explicit historical and MTS-origin imports non-operational", () => {
    expect(historicalBackfill).toContain("historical_recordkeeping_only");
    expect(historicalBackfill).toContain("no_installer_form: true");
    expect(historicalBackfill).toContain("no_external_notification: true");
    expect(historicalBackfill).not.toContain("ensureSoldQuoteInstallerDelivery");
    expect(mtsSync).not.toContain("ensureSoldQuoteInstallerDelivery");
    expect(bookkeepingImport).not.toContain("ensureSoldQuoteInstallerDelivery");
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
