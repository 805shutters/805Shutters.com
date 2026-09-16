import { describe, expect, it, vi } from "vitest";
import { PDFParse } from "pdf-parse";
import { customerContractTerms } from "./customer-contract-terms";
import {
  CUSTOMER_SIGNED_CONTRACT_FROM,
  CUSTOMER_SIGNED_CONTRACT_SUBJECT,
  buildCustomerSignedContractEmail,
  buildSignedContractPdf,
  processCustomerSignedContractEmailOutbox,
  type CustomerContractEmailClaim,
  type CustomerContractEmailDependencies,
  type FrozenCustomerContractEmail,
} from "./customer-signed-contract-email";
import type { SignedContractSnapshot } from "./public-quote";

const snapshot: SignedContractSnapshot = {
  schema: "805_signed_quote_contract_v1",
  signedAt: "2026-09-16T19:00:00.000Z",
  customerPrintedName: "José Customer",
  customerSignature: "José Customer",
  customerName: "José Customer",
  customerAddress: "123 Main Street, Camarillo, CA",
  customerPhone: "805-555-0101",
  customerEmail: "jose@example.com",
  customerEmailDelivery: "enabled",
  business: { name: "805 Shutters", phone: "805-806-9344", website: "805shutters.com", email: "805@805shutters.com" },
  quote: { id: "10000000-0000-4000-8000-000000000001", quoteNumber: "805-0201" },
  lines: [{
    lineItemId: "line-1",
    room: "Living Room",
    productName: "Roller Shade",
    styleName: "Garden - Ecru",
    options: ["Mount: Inside mount", "Control side: Left"],
    unitPrice: 1200,
    quantity: 2,
    lineTotal: 2400,
    discountPercent: 10,
    designOptions: [{ id: "unselected", label: "Alternative", productName: "Unpurchased Roman Shade", styleName: "", options: [], unitPrice: 500, lineTotal: 500, priceReady: true }],
  }],
  totals: { subtotal: 2400, fees: [{ name: "Installation", amount: 100 }], discount: 240, tax: 180, sourceTotalAdjustment: 0, depositDue: 1220, balanceDue: 1220, total: 2440 },
  hasOnyxShutters: true,
  terms: customerContractTerms(true),
};

function claim(overrides: Partial<CustomerContractEmailClaim> = {}): CustomerContractEmailClaim {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    contract_id: "30000000-0000-4000-8000-000000000001",
    quote_id: snapshot.quote.id,
    status: "processing",
    recipient: snapshot.customerEmail!,
    signed_snapshot: snapshot,
    customer_signature: snapshot.customerSignature,
    contract_signed_at: snapshot.signedAt,
    payload: null,
    idempotency_key: null,
    lease_token: "40000000-0000-4000-8000-000000000001",
    first_send_attempt_at: null,
    provider_message_id: null,
    provider_accepted_at: null,
    ...overrides,
  };
}

function frozenPayload(): FrozenCustomerContractEmail {
  const mail = buildCustomerSignedContractEmail(snapshot.customerName);
  return {
    ...mail,
    to: snapshot.customerEmail!,
    from: CUSTOMER_SIGNED_CONTRACT_FROM,
    attachments: [{ filename: "contract.pdf", content: "JVBERi0xLjQ=", contentType: "application/pdf" }],
    idempotencyKey: "805-signed-contract-30000000-0000-4000-8000-000000000001-customer-signed-contract-v1",
  };
}

function harness(input: { claims?: CustomerContractEmailClaim[]; send?: CustomerContractEmailDependencies["send"] } = {}) {
  const queue = [...(input.claims || [claim({ payload: frozenPayload(), idempotency_key: frozenPayload().idempotencyKey })])];
  const updates: Array<Record<string, unknown>> = [];
  const send = input.send || vi.fn(async () => ({ sent: true, id: "resend-provider-id" }));
  const dependencies: Partial<CustomerContractEmailDependencies> = {
    claim: vi.fn(async () => queue.shift() || null),
    update: vi.fn(async (_db, _claim, patch) => { updates.push(patch); }),
    send,
    health: vi.fn(async () => ({ pending: 0, processing: 0, retry: 0, uncertain: 0, accepted: 1, blocked: 0, total: 1, errors: [] })),
    now: vi.fn(() => "2026-09-16T20:00:00.000Z"),
  };
  return { dependencies, updates, send };
}

describe("signed customer contract email", () => {
  it("uses the approved message, Jessica signature, and 805 sender", () => {
    const mail = buildCustomerSignedContractEmail("Jane Customer");
    expect(mail.subject).toBe("Thank you for choosing 805 Shutters — your signed contract");
    expect(mail.text).toContain("Hi Jane,");
    expect(mail.text).toContain("Attached is a copy of your signed contract for your records. We’ll be in touch");
    expect(mail.text).toContain("If you have any questions, simply reply to this email—we’re happy to help.");
    expect(mail.text).toMatch(/Jessica\n805 Shutters\n805@805shutters\.com\n805shutters\.com$/);
    expect(CUSTOMER_SIGNED_CONTRACT_FROM).toBe("805 Shutters <805@805shutters.com>");
  });

  it("renders the immutable selected line, totals, terms, accented signature, and no optional alternative", async () => {
    const pdf = await buildSignedContractPdf(snapshot);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const parser = new PDFParse({ data: pdf });
    const result = await parser.getText();
    await parser.destroy();
    expect(result.text).toContain("José Customer");
    expect(result.text).toContain("Roller Shade");
    expect(result.text).toContain("$2,440.00");
    expect(result.text).toContain("Payment at Installation");
    expect(result.text).toContain("Limited lifetime warranty on shutter mechanisms");
    expect(result.text).not.toContain("Unpurchased Roman Shade");
  });

  it("records provider acceptance once and never calls two workers for one claim", async () => {
    const h = harness();
    await Promise.all([
      processCustomerSignedContractEmailOutbox({} as never, { dependencies: h.dependencies, limit: 1 }),
      processCustomerSignedContractEmailOutbox({} as never, { dependencies: h.dependencies, limit: 1 }),
    ]);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.updates.at(-1)).toMatchObject({
      status: "accepted",
      provider_message_id: "resend-provider-id",
      provider_accepted_at: "2026-09-16T20:00:00.000Z",
    });
  });

  it("replays the exact frozen payload after an uncertain outcome", async () => {
    const payload = frozenPayload();
    const send = vi.fn(async () => ({ sent: true, id: "same-provider-send" }));
    const h = harness({ claims: [claim({ payload, idempotency_key: payload.idempotencyKey, first_send_attempt_at: "2026-09-16T19:30:00.000Z" })], send });
    await processCustomerSignedContractEmailOutbox({} as never, { dependencies: h.dependencies, limit: 1 });
    expect(send).toHaveBeenCalledWith(payload, expect.any(Number));
    expect(h.updates.at(-1)).toMatchObject({ status: "accepted", provider_message_id: "same-provider-send" });
  });

  it("durably blocks a malformed data-URL signature before sending", async () => {
    const malformed = { ...snapshot, customerSignature: "data:image/png;base64,AAAA" };
    const h = harness({ claims: [claim({ signed_snapshot: malformed, customer_signature: malformed.customerSignature, payload: null })] });
    const result = await processCustomerSignedContractEmailOutbox({} as never, { dependencies: h.dependencies, limit: 1 });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.updates.at(-1)).toMatchObject({ status: "blocked", failure_stage: "prepare" });
    expect(result.errors).toContain("The immutable signed contract snapshot is incomplete.");
  });

  it("keeps a provider failure durable and retryable", async () => {
    const h = harness({ send: vi.fn(async () => ({ sent: false, error: "provider rejected" })) });
    await processCustomerSignedContractEmailOutbox({} as never, { dependencies: h.dependencies, limit: 1 });
    expect(h.updates.at(-1)).toMatchObject({ status: "retry", failure_stage: "send", last_error: "provider rejected" });
  });

  it("finalizes existing provider acceptance without calling the provider again", async () => {
    const payload = frozenPayload();
    const h = harness({ claims: [claim({
      payload,
      idempotency_key: payload.idempotencyKey,
      provider_message_id: "already-accepted",
      provider_accepted_at: "2026-09-16T19:59:00.000Z",
    })] });
    await processCustomerSignedContractEmailOutbox({} as never, { dependencies: h.dependencies, limit: 1 });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.updates.at(-1)).toMatchObject({
      status: "accepted",
      provider_message_id: "already-accepted",
      provider_accepted_at: "2026-09-16T19:59:00.000Z",
    });
  });

  it("recovers provider acceptance when the first persistence attempt fails", async () => {
    const h = harness();
    let acceptedWrites = 0;
    h.dependencies.update = vi.fn(async (_db, _claim, patch) => {
      if (patch.status === "accepted" && ++acceptedWrites === 1) throw new Error("database connection reset");
      h.updates.push(patch);
    });
    const result = await processCustomerSignedContractEmailOutbox({} as never, { dependencies: h.dependencies, limit: 1 });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.updates.at(-1)).toMatchObject({
      status: "accepted",
      provider_message_id: "resend-provider-id",
      provider_accepted_at: "2026-09-16T20:00:00.000Z",
      failure_stage: "persist",
    });
    expect(result.errors).toContain("database connection reset");
  });
});
