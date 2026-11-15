import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { customerContractTerms } from "./customer-contract-terms";
import { CUSTOMER_SIGNED_CONTRACT_SUBJECT } from "./customer-signed-contract-email";
import {
  INTERNAL_SIGNED_CONTRACT_COPY_RECIPIENT,
  internalSignedContractCopyRecipients,
  internalSignedContractCopySubject,
  processInternalSignedContractCopyOutbox,
  type FrozenInternalSignedContractCopy,
  type InternalSignedContractCopyClaim,
  type InternalSignedContractCopyDependencies,
} from "./internal-signed-contract-copy";

vi.mock("./signed-contract-pdf", () => ({
  buildSignedContractPdf: vi.fn(async () => Buffer.from("%PDF-1.4\ninternal signed contract copy\n")),
}));

const db = new PGlite();
const customerMigration = readFileSync("supabase/migrations/20260916214940_customer_signed_contract_email_outbox.sql", "utf8");
const internalMigration = readFileSync("supabase/migrations/20261104120000_internal_signed_contract_copy.sql", "utf8");
const RECIPIENT_ENV = "INTERNAL_SIGNED_CONTRACT_COPY_EMAIL";
const originalRecipient = process.env[RECIPIENT_ENV];

beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.crm_jobs(
      id uuid primary key, customer_name text not null, email text, meta jsonb not null default '{}'::jsonb
    );
    create table public.crm_quotes(
      id uuid primary key, job_id uuid not null references public.crm_jobs(id), quote_number text,
      status text not null default 'draft', signed_at timestamptz, archived_at timestamptz,
      customer_email text, customer_signature text, meta jsonb not null default '{}'::jsonb
    );
    create table public.crm_customer_contracts(
      id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(), customer_id uuid, job_id uuid references public.crm_jobs(id),
      quote_id uuid references public.crm_quotes(id), bookkeeping_entry_id uuid, title text not null,
      contract_url text, share_token text, status text, signed_at timestamptz, total_amount numeric not null default 0,
      meta jsonb not null default '{}'::jsonb, external_source text, external_id text
    );
    ${customerMigration}
    ${internalMigration}
  `);
});

beforeEach(async () => {
  delete process.env[RECIPIENT_ENV];
  vi.clearAllMocks();
  await db.exec("truncate crm_internal_signed_contract_copy_outbox, crm_customer_signed_contract_email_outbox, crm_customer_contracts, crm_quotes, crm_jobs cascade");
});

afterAll(() => {
  if (originalRecipient === undefined) delete process.env[RECIPIENT_ENV];
  else process.env[RECIPIENT_ENV] = originalRecipient;
  return db.close();
});

function recipientList(message: { to?: unknown; cc?: unknown; bcc?: unknown; recipients?: unknown }) {
  return [message.to, message.cc, message.bcc, message.recipients].flatMap((value) => {
    if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase());
    if (value == null || value === "") return [];
    return [String(value).trim().toLowerCase()];
  });
}

function snapshot(quoteId: string, signedAt: string, quoteNumber: string, customerEmail = "jane@example.com") {
  return {
    schema: "805_signed_quote_contract_v1",
    signedAt,
    customerPrintedName: "Jane Customer",
    customerSignature: "Jane Customer",
    customerName: "Jane Customer",
    customerAddress: "123 Main Street, Camarillo, CA",
    customerPhone: "805-555-0101",
    customerEmail,
    customerEmailDelivery: "enabled",
    business: { name: "805 Shutters", phone: "805-806-9344", website: "805shutters.com", email: "805@805shutters.com" },
    quote: { id: quoteId, quoteNumber },
    lines: [{
      showDesignOptions: false,
      lineItemId: "line-1",
      room: "Living Room",
      productName: "Roller Shade",
      styleName: "Garden - Ecru",
      options: ["Mount: Inside mount"],
      unitPrice: 1200,
      quantity: 1,
      lineTotal: 1200,
      discountPercent: 0,
      designOptions: [],
    }],
    totals: { subtotal: 1200, fees: [], discount: 0, tax: 0, sourceTotalAdjustment: 0, depositDue: 600, balanceDue: 600, total: 1200 },
    hasOnyxShutters: false,
    terms: customerContractTerms(false),
  };
}

async function insertJobAndQuote(input: { quoteNumber: string; signedAt?: string | null; status?: string; customerEmail?: string }) {
  const jobId = randomUUID();
  const quoteId = randomUUID();
  const customerEmail = input.customerEmail || "jane@example.com";
  await db.query("insert into crm_jobs(id, customer_name, email) values ($1, $2, $3)", [jobId, "Jane Customer", customerEmail]);
  await db.query(
    "insert into crm_quotes(id, job_id, status, quote_number, signed_at, customer_email, customer_signature) values ($1, $2, $3, $4, $5, $6, $7)",
    [quoteId, jobId, input.status || "sold", input.quoteNumber, input.signedAt ?? null, customerEmail, "Jane Customer"],
  );
  return { jobId, quoteId, customerEmail };
}

async function insertSigned(quoteNumber: string, customerEmail = "jane@example.com") {
  const signedAt = new Date(Date.now() + 60_000).toISOString();
  const { jobId, quoteId } = await insertJobAndQuote({ quoteNumber, signedAt, customerEmail });
  const contractId = randomUUID();
  await db.query(
    "insert into crm_customer_contracts(id, job_id, quote_id, title, status, signed_at, total_amount, external_source, external_id, meta) values ($1, $2, $3, 'Contract', 'sold', $4, 1200, 'crm_quote', $5, $6)",
    [contractId, jobId, quoteId, signedAt, `contract:${quoteId}`, JSON.stringify({ contract_snapshot: snapshot(quoteId, signedAt, quoteNumber, customerEmail) })],
  );
  return { quoteId, contractId, signedAt, customerEmail };
}

async function customerRows() {
  const result = await db.query<Record<string, unknown>>(
    "select * from crm_customer_signed_contract_email_outbox order by contract_id",
  );
  return result.rows;
}

async function internalRows() {
  const result = await db.query<{ contract_number: string; recipient: string; status: string }>(
    "select contract_number, recipient, status from crm_internal_signed_contract_copy_outbox order by contract_number",
  );
  return result.rows;
}

const PATCH_COLUMNS = new Set([
  "status", "recipient", "payload", "idempotency_key", "failure_stage", "last_error", "available_at",
  "lease_token", "lease_expires_at", "first_send_attempt_at", "provider_message_id", "provider_accepted_at",
]);

async function applyPatch(claim: InternalSignedContractCopyClaim, patch: Record<string, unknown>) {
  const entries = Object.entries(patch).filter(([key, value]) => PATCH_COLUMNS.has(key) && value !== undefined);
  const values = entries.map(([key, value]) => key === "payload" && value && typeof value === "object" ? JSON.stringify(value) : value);
  const assignments = entries.map(([key], index) => key === "payload" ? `payload = $${index + 1}::jsonb` : `${key} = $${index + 1}`);
  const updated = await db.query(
    `update crm_internal_signed_contract_copy_outbox set ${assignments.join(", ")}, updated_at = now() where id = $${entries.length + 1} and lease_token = $${entries.length + 2}`,
    [...values, claim.id, claim.lease_token],
  );
  if (!updated.affectedRows) throw new Error("Internal signed-contract copy lease was lost.");
}

async function drain(send: InternalSignedContractCopyDependencies["send"], now = "2026-11-04T20:00:00.000Z") {
  return processInternalSignedContractCopyOutbox({} as never, {
    limit: 5,
    deadlineMs: 90_000,
    dependencies: {
      claim: async () => (await db.query<{ result: InternalSignedContractCopyClaim | null }>(
        "select internal_signed_contract_copy_claim(null) as result",
      )).rows[0]?.result ?? null,
      update: async (_db, claim, patch) => { await applyPatch(claim, patch as Record<string, unknown>); },
      send,
      now: () => now,
    },
  });
}

function acceptedSend(id: string): InternalSignedContractCopyDependencies["send"] {
  return async () => ({ sent: true, id });
}

describe("internal signed-contract copy", () => {
  it("sends one internal copy per signature and does not change the customer email", async () => {
    await insertJobAndQuote({ quoteNumber: "805-0999", status: "sent" });
    const unsigned = await insertJobAndQuote({ quoteNumber: "805-1000", status: "sent" });
    await db.query(
      "insert into crm_customer_contracts(job_id, quote_id, title, status, external_source, external_id) values ($1, $2, 'Quote file', 'sent', 'crm_quote', $3)",
      [unsigned.jobId, unsigned.quoteId, `contract:${unsigned.quoteId}`],
    );
    const statusOnly = await insertJobAndQuote({ quoteNumber: "805-1001", signedAt: new Date(Date.now() + 60_000).toISOString() });
    await db.query(
      "insert into crm_customer_contracts(job_id, quote_id, title, status, signed_at, external_source, external_id, meta) values ($1, $2, 'Contract', 'sold', $3, 'crm_quote', $4, $5)",
      [statusOnly.jobId, statusOnly.quoteId, new Date(Date.now() + 60_000).toISOString(), `contract:${statusOnly.quoteId}`, JSON.stringify({ source: "crm_quote_status" })],
    );
    expect(await internalRows()).toEqual([]);
    expect(await customerRows()).toEqual([]);

    await insertSigned("805-0201");
    await insertSigned("805-0202");
    expect(await internalRows()).toEqual([
      { contract_number: "805-0201", recipient: INTERNAL_SIGNED_CONTRACT_COPY_RECIPIENT, status: "pending" },
      { contract_number: "805-0202", recipient: INTERNAL_SIGNED_CONTRACT_COPY_RECIPIENT, status: "pending" },
    ]);
    const customerBefore = await customerRows();
    expect(customerBefore).toHaveLength(2);
    expect(customerBefore.map((row) => row.recipient)).toEqual(["jane@example.com", "jane@example.com"]);
    expect(customerBefore.every((row) => row.payload == null)).toBe(true);

    let sent = 0;
    const send = vi.fn<InternalSignedContractCopyDependencies["send"]>(async () => ({ sent: true, id: `internal-provider-${++sent}` }));
    const first = await drain(send);
    expect(first.errors).toEqual([]);
    expect(send).toHaveBeenCalledTimes(2);
    const messages = send.mock.calls.map((call) => call[0]);
    expect(messages.map((message) => message.subject).sort()).toEqual([
      internalSignedContractCopySubject("805-0201", "Jane Customer"),
      internalSignedContractCopySubject("805-0202", "Jane Customer"),
    ]);
    for (const message of messages) {
      const copy = message as FrozenInternalSignedContractCopy & { cc?: unknown; bcc?: unknown; recipients?: unknown };
      expect(recipientList(copy)).toEqual(["wcbot+805@mail.grokbot.com"]);
      expect(recipientList(copy)).not.toContain("jane@example.com");
      expect(copy.cc).toBeUndefined();
      expect(copy.bcc).toBeUndefined();
      expect(copy.recipients).toBeUndefined();
      expect(copy.subject).not.toBe(CUSTOMER_SIGNED_CONTRACT_SUBJECT);
      expect(copy.subject).toMatch(/805-020[12]/);
      expect(copy.text).not.toMatch(/\/quote\//);
      expect(copy.html).not.toMatch(/\/quote\//);
      expect(copy.attachments).toHaveLength(1);
      expect(copy.attachments[0]?.contentType).toBe("application/pdf");
      expect(copy.attachments[0]?.filename).toMatch(/805-020[12]/);
      expect(copy.attachments[0]?.content.startsWith("JVBER")).toBe(true);
    }
    expect(await customerRows()).toEqual(customerBefore);
    expect(CUSTOMER_SIGNED_CONTRACT_SUBJECT).toBe("Thank you for choosing 805 Shutters — your signed contract");

    await db.query("update crm_customer_contracts set meta = meta || '{\"touched\":true}'::jsonb");
    const second = await drain(send);
    expect(second.processed).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(await internalRows()).toEqual([
      { contract_number: "805-0201", recipient: "wcbot+805@mail.grokbot.com", status: "accepted" },
      { contract_number: "805-0202", recipient: "wcbot+805@mail.grokbot.com", status: "accepted" },
    ]);
    expect(await customerRows()).toEqual(customerBefore);
  });

  it("sends the copy only to the internal address, even when other addresses are configured", async () => {
    const previousSignedQuoteEmail = process.env.CRM_SIGNED_QUOTE_EMAIL;
    process.env[RECIPIENT_ENV] = "jane@example.com, other@example.com";
    process.env.CRM_SIGNED_QUOTE_EMAIL = "mike@example.com";
    try {
    expect(internalSignedContractCopyRecipients()).toEqual(["wcbot+805@mail.grokbot.com"]);
    await insertSigned("805-0303");
    const customerBefore = await customerRows();
    expect(customerBefore.map((row) => row.recipient)).toEqual(["jane@example.com"]);
    expect(JSON.stringify(customerBefore)).not.toContain("wcbot+805@mail.grokbot.com");
    const send = vi.fn<InternalSignedContractCopyDependencies["send"]>(acceptedSend("configured-provider"));
    await drain(send);
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]?.[0] as FrozenInternalSignedContractCopy & { cc?: unknown; bcc?: unknown };
    expect(recipientList(message)).toEqual(["wcbot+805@mail.grokbot.com"]);
    expect(recipientList(message)).not.toContain(String(customerBefore[0]?.recipient));
    expect(message.subject).toContain("805-0303");
    await drain(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await customerRows()).toEqual(customerBefore);
    await expect(db.query(
      "update crm_internal_signed_contract_copy_outbox set recipient = $1",
      ["jane@example.com"],
    )).rejects.toThrow();
    await expect(db.query(
      "update crm_internal_signed_contract_copy_outbox set recipient = $1",
      ["wcbot+805@mail.grokbot.com,jane@example.com"],
    )).rejects.toThrow();
    await expect(db.query(
      "update crm_internal_signed_contract_copy_outbox set payload = $1::jsonb, idempotency_key = $2",
      [JSON.stringify({ to: "other@example.com", cc: ["jane@example.com"] }), "not-allowed"],
    )).rejects.toThrow();
    expect(await customerRows()).toEqual(customerBefore);
    } finally {
      if (previousSignedQuoteEmail === undefined) delete process.env.CRM_SIGNED_QUOTE_EMAIL;
      else process.env.CRM_SIGNED_QUOTE_EMAIL = previousSignedQuoteEmail;
    }
  });

  it("does not queue a copy when the customer address is the internal inbox", async () => {
    await insertSigned("805-0304", INTERNAL_SIGNED_CONTRACT_COPY_RECIPIENT);
    expect(await internalRows()).toEqual([]);
    const customer = await customerRows();
    expect(customer.map((row) => row.recipient)).toEqual([INTERNAL_SIGNED_CONTRACT_COPY_RECIPIENT]);
    const send = vi.fn<InternalSignedContractCopyDependencies["send"]>(acceptedSend("should-not-send"));
    const result = await drain(send);
    expect(result.processed).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(await customerRows()).toEqual(customer);
  });

  it("keeps the signed contract and the customer email when the copy cannot be queued", async () => {
    await db.exec(`
      create or replace function public.fail_internal_signed_contract_copy()
      returns trigger language plpgsql as $$ begin raise exception 'forced internal copy failure'; end; $$;
      drop trigger if exists fail_internal_signed_contract_copy on public.crm_internal_signed_contract_copy_outbox;
      create trigger fail_internal_signed_contract_copy
      before insert on public.crm_internal_signed_contract_copy_outbox
      for each row execute function public.fail_internal_signed_contract_copy();
    `);
    try {
      await insertSigned("805-0404");
      const contracts = await db.query<{ id: string }>("select id from crm_customer_contracts");
      expect(contracts.rows).toHaveLength(1);
      const customer = await customerRows();
      expect(customer).toHaveLength(1);
      expect(customer[0]?.recipient).toBe("jane@example.com");
      expect(JSON.stringify(customer)).not.toContain("wcbot+805@mail.grokbot.com");
      expect(await internalRows()).toEqual([]);
    } finally {
      await db.exec(`
        drop trigger if exists fail_internal_signed_contract_copy on public.crm_internal_signed_contract_copy_outbox;
        drop function if exists public.fail_internal_signed_contract_copy();
      `);
    }
  });

  it("keeps the customer email when sending the copy fails", async () => {
    await insertSigned("805-0505");
    const customerBefore = await customerRows();
    const result = await drain(async () => { throw new Error("provider down"); }, new Date().toISOString());
    expect(result.errors).toEqual(["provider down"]);
    expect(await customerRows()).toEqual(customerBefore);
    expect(await internalRows()).toEqual([
      { contract_number: "805-0505", recipient: "wcbot+805@mail.grokbot.com", status: "uncertain" },
    ]);
  });
});
