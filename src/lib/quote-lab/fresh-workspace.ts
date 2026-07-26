import type { SalesQuote } from "@mts/types/quote";
import type { PersistedQuoteLabState } from "./test-database";

const RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FreshQuoteLabWorkspace = {
  runId: string;
  quoteNumber: string;
  createdAt: string;
  state: PersistedQuoteLabState;
};

export function createFreshQuoteLabWorkspace(
  runId: string,
  createdAt = new Date().toISOString(),
): FreshQuoteLabWorkspace {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new TypeError("A server-generated UUID is required for a fresh Quote Lab run.");
  }
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new TypeError("A valid creation timestamp is required for a fresh Quote Lab run.");
  }

  const quoteNumber = `V2-${runId}`;
  const quote: SalesQuote = {
    id: "quote-lab-exact",
    quote_number: quoteNumber,
    account_id: "805-shutters",
    status: "draft",
    customer_name: "Fresh V2 Test Quote",
    customer_email: null,
    customer_phone: null,
    customer_address: null,
    appointment_date: null,
    installer_notes: JSON.stringify({
      __quoteBuilderNote: `Fresh isolated V2 test run ${runId} — production writes are disabled.`,
      __quoteLabRunId: runId,
    }),
    product_cost: 0,
    total_amount: 0,
    profit_amount: 0,
    deposit_paid: 0,
    balance_paid: 0,
    payment_method: null,
    customer_signature: null,
    customer_printed_name: null,
    signed_at: null,
    share_token: `quote-lab-only-${runId}`,
    created_by: null,
    sales_owner: "mike",
    sales_owner_auth_user_id: null,
    sales_owner_set_at: null,
    created_job_id: null,
    quote_group_id: `quote-lab-group-${runId}`,
    quote_letter: "A",
    sent_at: null,
    ordered_at: null,
    received_at: null,
    installed_at: null,
    archived_at: null,
    sent_via: null,
    manufacturer_order_ref: null,
    manufacturer_cost: 0,
    manufacturer_name: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  return {
    runId,
    quoteNumber,
    createdAt,
    state: {
      quotes: [quote],
      lineItems: [],
      designs: [],
      selectedVariantByLine: {},
    },
  };
}
