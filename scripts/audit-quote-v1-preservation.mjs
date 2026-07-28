#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const includeDetails = process.argv.includes("--details");

if (!url || !serviceRoleKey) {
  console.error(
    "Read-only quote audit unavailable: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
  process.exit(2);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function selectAll(table, columns) {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

const v2AuditTables = [
  "sales_quote_v2_price_snapshots",
  "sales_quote_v2_events",
  "sales_quote_v2_customer_send_preparations",
  "sales_quote_v2_legacy_reprice_previews",
  "sales_quote_v2_legacy_reprice_audits",
  "sales_quote_v2_custom_overrides",
  "sales_quote_v2_import_requests",
  "sales_quote_v2_draft_requests",
];

async function countRows(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}

async function run() {
  const [quotes, lines, designs, salesQuotes, sendPreparations, importRequests] = await Promise.all([
    selectAll(
      "crm_quotes",
      "id,quote_number,job_id,status,quote_total,deposit_required,balance_due,customer_email,customer_phone,customer_address,customer_signature,customer_printed_name,signed_at,meta",
    ),
    selectAll("crm_quote_line_items", "id,quote_id,selected_design_id,quantity,width_in,height_in"),
    selectAll("crm_quote_designs", "id,line_item_id,product_id,details,unit_price,price_status"),
    selectAll(
      "sales_quotes",
      "id,quote_number,status,total_amount,deposit_paid,balance_paid,customer_name,customer_email,customer_phone,customer_address,customer_signature,customer_printed_name,signed_at,quote_v2_status,quote_v2_revision",
    ).then((rows) => rows.filter((row) => row.quote_v2_status && row.quote_v2_status !== "legacy")),
    selectAll("sales_quote_v2_customer_send_preparations", "quote_id,crm_quote_id"),
    selectAll("sales_quote_v2_import_requests", "sales_quote_id,crm_quote_id"),
  ]);

  const linesByQuote = new Map();
  for (const line of lines) {
    const group = linesByQuote.get(line.quote_id) || [];
    group.push(line);
    linesByQuote.set(line.quote_id, group);
  }
  const designsByLine = new Map();
  for (const design of designs) {
    const group = designsByLine.get(design.line_item_id) || [];
    group.push(design);
    designsByLine.set(design.line_item_id, group);
  }

  const v2ToCrm = new Map();
  for (const link of [...sendPreparations, ...importRequests.map((row) => ({
    quote_id: row.sales_quote_id,
    crm_quote_id: row.crm_quote_id,
  }))]) {
    v2ToCrm.set(link.quote_id, link.crm_quote_id);
  }
  const crmLinkedFromV2 = new Set(v2ToCrm.values());

  const complete = [];
  const partial = [];
  const absentLegacyConfiguration = [];
  for (const quote of quotes) {
    const quoteLines = linesByQuote.get(quote.id) || [];
    const configuredLines = quoteLines.filter((line) => (designsByLine.get(line.id) || []).length > 0);
    const item = {
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      status: quote.status,
      lineCount: quoteLines.length,
      configuredLineCount: configuredLines.length,
      hasV2PreservationLink: crmLinkedFromV2.has(quote.id),
      preservedFacts: {
        customerContact: Boolean(quote.customer_email || quote.customer_phone || quote.customer_address),
        total: Number(quote.quote_total || 0),
        deposit: Number(quote.deposit_required || 0),
        balance: Number(quote.balance_due || 0),
        signed: Boolean(quote.signed_at || quote.customer_signature || quote.customer_printed_name),
      },
    };
    if (quoteLines.length === 0) absentLegacyConfiguration.push(item);
    else if (configuredLines.length !== quoteLines.length) partial.push(item);
    else complete.push(item);
  }

  const unlinkedV2 = salesQuotes
    .filter((quote) => !v2ToCrm.has(quote.id))
    .map((quote) => ({
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      lifecycle: quote.quote_v2_status,
      revision: quote.quote_v2_revision,
      preservedFacts: {
        customerContact: Boolean(quote.customer_email || quote.customer_phone || quote.customer_address),
        total: Number(quote.total_amount || 0),
        depositPaid: Number(quote.deposit_paid || 0),
        balancePaid: Number(quote.balance_paid || 0),
        signed: Boolean(quote.signed_at || quote.customer_signature || quote.customer_printed_name),
      },
    }));

  const v2RecordCounts = Object.fromEntries(
    await Promise.all(v2AuditTables.map(async (table) => [table, await countRows(table)])),
  );
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "read-only",
    safeguards: [
      "No database writes are performed.",
      "Missing legacy configuration is flagged and never synthesized.",
      "Customer, signature, contract, and total facts are reported independently of configuration.",
    ],
    summary: {
      crmQuotes: quotes.length,
      completeV1Configuration: complete.length,
      partialV1Configuration: partial.length,
      absentLegacyConfiguration: absentLegacyConfiguration.length,
      v2Quotes: salesQuotes.length,
      v2QuotesLinkedToCrm: salesQuotes.length - unlinkedV2.length,
      v2ImportGaps: unlinkedV2.length,
    },
    v2RecordCounts,
  };
  if (includeDetails) {
    report.details = { complete, partial, absentLegacyConfiguration, unlinkedV2 };
  }
  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
