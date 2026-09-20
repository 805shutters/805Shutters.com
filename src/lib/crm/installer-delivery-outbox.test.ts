import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INSTALLER_FORM_FROM,
  processInstallerDeliveryOutbox,
  type FrozenInstallerEmail,
  type InstallerDeliveryDependencies,
  type InstallerOutboxClaim,
} from "./installer-delivery-outbox";
import type { InstallerFormRow } from "./installer-forms";
import * as installerForms from "./installer-forms";
import * as installerBalance from "./installer-balance";
import { buildTechnicalMeasureInstallationHandoff } from "./installation-handoff";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const form: InstallerFormRow = {
  id: "10000000-0000-4000-8000-000000000003",
  quote_id: "10000000-0000-4000-8000-000000000004",
  job_id: "10000000-0000-4000-8000-000000000002",
  public_token: "token",
  status: "pending_delivery",
  customer_snapshot: { name: "Jane Customer", address: "123 Main", phone: null, email: null, quoteNumber: "805-0200" },
  line_snapshot: [],
  cod_original: 100,
  cod_adjusted: 100,
  cod_withheld: 0,
  issues: [],
  accepted: false,
  signer_name: null,
  signed_at: null,
  meta: {},
};

const payload: FrozenInstallerEmail = {
  to: "mtsagent101@gmail.com",
  from: INSTALLER_FORM_FROM,
  subject: "Installer packet",
  html: "<p>Installer packet</p>",
  text: "Installer packet",
  attachments: [{ filename: "installer.pdf", content: "cGRm", contentType: "application/pdf" }],
  idempotencyKey: "805-installer-form-10000000-0000-4000-8000-000000000003-base-v1-mtsagent101@gmail.com",
};

function claim(overrides: Partial<InstallerOutboxClaim> = {}): InstallerOutboxClaim {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    quote_id: form.quote_id,
    form_id: form.id,
    kind: "base_packet",
    version_key: "base-v1",
    status: "processing",
    payload: null,
    idempotency_key: null,
    lease_token: "30000000-0000-4000-8000-000000000001",
    first_send_attempt_at: null,
    provider_message_id: null,
    sent_at: null,
    ...overrides,
  };
}

function harness(input: {
  claims?: InstallerOutboxClaim[];
  send?: InstallerDeliveryDependencies["send"];
  prepareBase?: InstallerDeliveryDependencies["prepareBase"];
  prepareHandoff?: InstallerDeliveryDependencies["prepareHandoff"];
  discoverHandoff?: InstallerDeliveryDependencies["discoverHandoff"];
  pending?: number;
  blocked?: number;
} = {}) {
  const queue = [...(input.claims || [claim()])];
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const recordFormFailure = vi.fn(async () => undefined);
  const recordAccepted = vi.fn(async (_client, savedForm) => ({ ...savedForm, status: "sent" }));
  const send = input.send || vi.fn(async () => ({ sent: true, id: "resend-accepted-1" }));
  const dependencies: Partial<InstallerDeliveryDependencies> = {
    claim: vi.fn(async () => queue.shift() || null),
    updateOutbox: vi.fn(async (_client, item, patch) => { updates.push({ id: item.id, patch }); }),
    loadForm: vi.fn(async () => form),
    prepareBase: input.prepareBase || vi.fn(async () => ({ form, payload })),
    prepareHandoff: input.prepareHandoff || vi.fn(async () => ({ form, payload: { ...payload, idempotencyKey: "handoff-key" } })),
    discoverHandoff: input.discoverHandoff || vi.fn(async () => undefined),
    recordFormFailure,
    recordAccepted,
    send,
    stats: vi.fn(async () => ({ pending: input.pending || 0, blocked: input.blocked || 0, errors: [] })),
    now: vi.fn(() => "2026-09-15T12:00:00.000Z"),
  };
  return { dependencies, updates, send, recordFormFailure, recordAccepted };
}

const client = {} as never;

describe("installer delivery outbox runtime", () => {
  it.each(["base_packet", "installation_handoff"] as const)("freezes and submits both recipients with the %s attachments", async (kind) => {
    const handoff = buildTechnicalMeasureInstallationHandoff({
      sourceCustomerId: "10000000-0000-4000-8000-000000000001",
      sourceJobId: form.job_id!,
      sourceDocumentId: form.id,
      submittedAt: "2026-09-19T12:00:00.000Z",
      durationMinutes: 60,
    });
    const balancedForm = { ...form, meta: { customer_balance: installerBalance.calculateInstallerCustomerBalance({
      contractId: form.quote_id,
      contractTotal: 200,
      contractSignedAt: "2026-09-19T12:00:00.000Z",
      payments: [{ amount: 100 }],
      creditsIn: [],
      creditsOut: [],
    }) } };
    vi.spyOn(installerForms, "ensureInstallerForm").mockResolvedValue(form);
    vi.spyOn(installerBalance, "refreshInstallerCustomerBalance").mockResolvedValue(balancedForm);
    vi.spyOn(installerForms, "prepareInstallerFormInstallationHandoff").mockResolvedValue(form);
    vi.spyOn(installerForms, "installerFormHandoffPackage").mockReturnValue(handoff);
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "both-recipients" }) });
    vi.stubGlobal("fetch", fetchMock);
    const h = harness({ claims: [claim({ kind, version_key: kind === "base_packet" ? "base-v1" : handoff.sha256 })] });
    delete h.dependencies.prepareBase;
    delete h.dependencies.prepareHandoff;
    delete h.dependencies.send;

    const formQuery = { select: () => formQuery, eq: () => formQuery, maybeSingle: async () => ({ data: form, error: null }) };
    const database = { from: () => formQuery } as never;
    const result = await processInstallerDeliveryOutbox(database, { dependencies: h.dependencies, limit: 1 });

    expect(result.errors).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request).toMatchObject({
      from: "805 Shutters <805@805shutters.com>",
      to: ["mtsagent101@gmail.com"],
      cc: ["mtsinstallations@gmail.com"],
    });
    expect(request.attachments).toHaveLength(kind === "base_packet" ? 1 : 2);
    expect(request.attachments[0].filename).toMatch(kind === "base_packet" ? /\.pdf$/ : /\.json$/);
    expect(h.updates[0].patch.payload).toMatchObject({ to: "mtsagent101@gmail.com", cc: ["mtsinstallations@gmail.com"] });
    expect(h.updates.at(-1)?.patch).toMatchObject({ status: "sent", provider_message_id: "both-recipients" });
  });

  it("blocks a frozen packet with an unauthorized CC address", async () => {
    const changed = { ...payload, cc: ["other@example.com"] } as unknown as FrozenInstallerEmail;
    const h = harness({ claims: [claim({ payload: changed, idempotency_key: payload.idempotencyKey })] });
    await processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.updates.at(-1)?.patch).toMatchObject({ status: "blocked" });
  });

  it("retries both recipients using the exact frozen payload", async () => {
    const both: FrozenInstallerEmail = { ...payload, cc: ["mtsinstallations@gmail.com"] };
    const h = harness({ claims: [claim({ payload: both, idempotency_key: both.idempotencyKey, first_send_attempt_at: "2026-09-15T11:00:00.000Z" })] });
    await processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 });
    expect(h.send).toHaveBeenCalledExactlyOnceWith(both);
    expect(h.dependencies.prepareBase).not.toHaveBeenCalled();
  });

  it("freezes the base packet before sending and records the accepted provider ID", async () => {
    const h = harness();
    const result = await processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 });
    expect(result).toMatchObject({ processed: 1, pending: 0, blocked: 0, errors: [] });
    expect(h.updates[0].patch).toMatchObject({ payload, idempotency_key: payload.idempotencyKey, form_id: form.id });
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "mtsagent101@gmail.com",
      from: "805 Shutters <805@805shutters.com>",
    }));
    expect(h.recordAccepted).toHaveBeenCalledWith(expect.anything(), form, expect.anything(), expect.objectContaining({ id: "resend-accepted-1" }), expect.any(String));
    expect(h.updates.at(-1)?.patch).toMatchObject({ status: "sent", provider_message_id: "resend-accepted-1" });
  });

  it("persists preparation failure as retryable without attempting email", async () => {
    const h = harness({ prepareBase: vi.fn(async () => { throw new Error("signed contract projection missing"); }) });
    const result = await processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.updates.at(-1)?.patch).toMatchObject({ status: "retry", failure_stage: "balance", last_error: "signed contract projection missing" });
    expect(h.recordFormFailure).toHaveBeenCalledWith(expect.anything(), form, "balance", "signed contract projection missing");
    expect(result.errors).toContain("signed contract projection missing");
  });

  it("reuses the exact frozen payload and idempotency key after an uncertain send", async () => {
    const uncertainSend = vi.fn(async () => ({ sent: false, uncertain: true, error: "connection reset" }));
    const first = harness({ send: uncertainSend });
    await processInstallerDeliveryOutbox(client, { dependencies: first.dependencies, limit: 1 });
    expect(first.updates.at(-1)?.patch).toMatchObject({ status: "uncertain", failure_stage: "send" });

    const replayPayload = structuredClone(payload);
    const replaySend = vi.fn(async () => ({ sent: true, id: "same-resend-send" }));
    const replay = harness({
      claims: [claim({ payload: replayPayload, idempotency_key: payload.idempotencyKey, first_send_attempt_at: "2026-09-15T11:00:00.000Z" })],
      send: replaySend,
      prepareBase: vi.fn(async () => { throw new Error("must not rebuild"); }),
    });
    await processInstallerDeliveryOutbox(client, { dependencies: replay.dependencies, limit: 1 });
    expect(replaySend).toHaveBeenCalledWith(replayPayload);
    expect(replay.dependencies.prepareBase).not.toHaveBeenCalled();
  });

  it("does not race when two workers process the same queue", async () => {
    const h = harness();
    await Promise.all([
      processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 }),
      processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 }),
    ]);
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("sends the base PDF even when optional handoff preparation fails", async () => {
    const h = harness({ discoverHandoff: vi.fn(async () => { throw new Error("technical measure customer lineage missing"); }) });
    const result = await processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.updates.at(-1)?.patch).toMatchObject({ status: "accepted", failure_stage: "handoff" });
    expect(result.errors).toContain("technical measure customer lineage missing");
  });

  it("delivers a newly queued handoff version without rebuilding or resending the base packet", async () => {
    const handoffPayload = { ...payload, subject: "Canonical handoff", idempotencyKey: "handoff-hash-key" };
    const prepareHandoff = vi.fn(async () => ({ form, payload: handoffPayload }));
    const prepareBase = vi.fn(async () => ({ form, payload }));
    const h = harness({
      claims: [claim({ kind: "installation_handoff", version_key: "sha256-version" })],
      prepareBase,
      prepareHandoff,
    });
    await processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 });
    expect(prepareHandoff).toHaveBeenCalledTimes(1);
    expect(prepareBase).not.toHaveBeenCalled();
    expect(h.send).toHaveBeenCalledWith(handoffPayload);
  });

  it("reconciles an already accepted base form without contacting the provider again", async () => {
    const acceptedForm = { ...form, status: "sent", sent_at: "2026-09-15T10:00:00.000Z", email_message_id: "existing-provider-id" };
    const h = harness();
    h.dependencies.loadForm = vi.fn(async () => acceptedForm);
    await processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 });
    expect(h.dependencies.prepareBase).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.updates.at(-1)?.patch).toMatchObject({ status: "sent", provider_message_id: "existing-provider-id" });
  });

  it("does not replay an already sent row when no claim is returned", async () => {
    const h = harness({ claims: [] });
    const result = await processInstallerDeliveryOutbox(client, { dependencies: h.dependencies });
    expect(result.processed).toBe(0);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("durably records provider acceptance before reconciling the form", async () => {
    const recordAccepted = vi.fn(async () => { throw new Error("form persistence unavailable"); });
    const h = harness();
    h.dependencies.recordAccepted = recordAccepted;
    const result = await processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 });
    const acceptedIndex = h.updates.findIndex(({ patch }) => patch.status === "accepted");
    expect(acceptedIndex).toBeGreaterThan(-1);
    expect(h.updates[acceptedIndex].patch).toMatchObject({ provider_message_id: "resend-accepted-1" });
    expect(result.errors).toContain("form persistence unavailable");
  });

  it("recovers the accepted provider ID and time when the first acceptance write fails", async () => {
    const first = harness();
    let rejectedAcceptance = false;
    first.dependencies.updateOutbox = vi.fn(async (_client, item, patch) => {
      first.updates.push({ id: item.id, patch });
      if (patch.status === "accepted" && !rejectedAcceptance) {
        rejectedAcceptance = true;
        throw new Error("acceptance persistence unavailable");
      }
    });

    const firstResult = await processInstallerDeliveryOutbox(client, {
      dependencies: first.dependencies,
      limit: 1,
    });
    const recovery = first.updates.at(-1)?.patch;
    expect(recovery).toMatchObject({
      status: "accepted",
      provider_message_id: "resend-accepted-1",
      sent_at: "2026-09-15T12:00:00.000Z",
      lease_token: null,
      lease_expires_at: null,
    });
    expect(firstResult.errors).toContain("acceptance persistence unavailable");

    const nextSend = vi.fn(async () => ({ sent: true, id: "duplicate-send" }));
    const next = harness({
      claims: [claim({
        payload,
        idempotency_key: payload.idempotencyKey,
        provider_message_id: String(recovery?.provider_message_id),
        sent_at: String(recovery?.sent_at),
      })],
      send: nextSend,
    });
    await processInstallerDeliveryOutbox(client, { dependencies: next.dependencies, limit: 1 });
    expect(nextSend).toHaveBeenCalledTimes(0);
    expect(next.updates.at(-1)?.patch).toMatchObject({
      status: "sent",
      provider_message_id: "resend-accepted-1",
      sent_at: "2026-09-15T12:00:00.000Z",
    });
  });

  it("reconciles an accepted queue row without another provider send", async () => {
    const h = harness({ claims: [claim({
      payload,
      idempotency_key: payload.idempotencyKey,
      provider_message_id: "accepted-before-crash",
      sent_at: "2026-09-15T11:59:00.000Z",
    })] });
    await processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.recordAccepted).toHaveBeenCalledWith(
      expect.anything(), form, expect.anything(),
      expect.objectContaining({ sent: true, id: "accepted-before-crash" }),
      "2026-09-15T11:59:00.000Z",
    );
    expect(h.updates.at(-1)?.patch.status).toBe("sent");
  });

  it("records load failures instead of abandoning a processing lease", async () => {
    const h = harness();
    h.dependencies.loadForm = vi.fn(async () => { throw new Error("form read failed"); });
    const result = await processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 });
    expect(h.updates.at(-1)?.patch).toMatchObject({ status: "retry", failure_stage: "form", last_error: "form read failed" });
    expect(result.errors).toContain("form read failed");
  });

  it("treats thrown provider errors as uncertain send outcomes", async () => {
    const h = harness({ send: vi.fn(async () => { throw new Error("socket timed out"); }) });
    await processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 });
    expect(h.updates.at(-1)?.patch).toMatchObject({ status: "uncertain", failure_stage: "send" });
  });

  it("blocks a tampered frozen payload without contacting the provider", async () => {
    const h = harness({ claims: [claim({ payload: { ...payload, to: "wrong@example.com" } as unknown as FrozenInstallerEmail, idempotency_key: payload.idempotencyKey })] });
    await processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.updates.at(-1)?.patch).toMatchObject({ status: "blocked" });
  });

  it("blocks a tampered frozen idempotency key even when its stored pair matches", async () => {
    const tampered = { ...payload, idempotencyKey: "attacker-controlled-key" };
    const h = harness({ claims: [claim({ payload: tampered, idempotency_key: tampered.idempotencyKey })] });
    await processInstallerDeliveryOutbox(client, { dependencies: h.dependencies, limit: 1 });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.updates.at(-1)?.patch).toMatchObject({ status: "blocked" });
  });

  it("reports pending and blocked work for cron verification", async () => {
    const h = harness({ claims: [], pending: 3, blocked: 2 });
    await expect(processInstallerDeliveryOutbox(client, { dependencies: h.dependencies }))
      .resolves.toMatchObject({ pending: 3, blocked: 2 });
  });
});
