import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildNoMeasureInstallationHandoff,
  buildTechnicalMeasureInstallationHandoff,
  canonicalInstallationHandoffJson,
  installationHandoffPackageFromDeliveryState,
  installationHandoffDeliveryState,
  normalizeInstallationDurationMinutes,
  normalizePhysicalOpeningCount,
  pendingInstallationHandoffDeliveryState,
} from "./installation-handoff";

const input = {
  sourceCustomerId: "10000000-0000-4000-8000-000000000001",
  sourceJobId: "10000000-0000-4000-8000-000000000002",
  sourceDocumentId: "10000000-0000-4000-8000-000000000003",
  submittedAt: "2026-07-30T14:15:00.000-07:00",
  submittedBySourceProfileId: "10000000-0000-4000-8000-000000000004",
  durationMinutes: 105,
} as const;

describe("805 to MTS installation handoff", () => {
  it("builds deterministic canonical bytes, version, filenames, and SHA-256", () => {
    const first = buildTechnicalMeasureInstallationHandoff(input);
    const retry = buildTechnicalMeasureInstallationHandoff(input);

    expect(retry).toEqual(first);
    expect(first.payload.sourceVersion).toBe(
      "technical_measure:10000000-0000-4000-8000-000000000003:2026-07-30T14:15:00.000-07:00",
    );
    expect(first.canonicalJson).toBe(canonicalInstallationHandoffJson(first.payload));
    expect(first.canonicalJson).not.toContain("\n");
    expect(first.sha256).toBe(
      createHash("sha256").update(Buffer.from(first.canonicalJson, "utf8")).digest("hex"),
    );
    expect(first.jsonFilename).toBe(
      "805-mts-installation-handoff-10000000-0000-4000-8000-000000000003.json",
    );
  });

  it("uses exact source IDs and rejects invalid or ambiguous authority", () => {
    expect(() =>
      buildTechnicalMeasureInstallationHandoff({
        ...input,
        sourceCustomerId: "Jane Customer",
      }),
    ).toThrow("sourceCustomerId must be an exact UUID");
    expect(() =>
      buildTechnicalMeasureInstallationHandoff({
        ...input,
        submittedAt: "2026-07-30T14:15:00",
      }),
    ).toThrow("explicit offset");
    expect(() => normalizeInstallationDurationMinutes(95)).toThrow("15-minute increments");
    expect(() => normalizeInstallationDurationMinutes(495)).toThrow("15–480");
    expect(() => normalizePhysicalOpeningCount(0)).toThrow("positive integer");
  });

  it("keeps the persisted retry state bound to the canonical version and hash", () => {
    const handoff = buildTechnicalMeasureInstallationHandoff(input);
    const state = pendingInstallationHandoffDeliveryState(handoff);

    expect(installationHandoffDeliveryState(state)).toEqual(state);
    expect(state).toMatchObject({
      source_sha256: handoff.sha256,
      source_version: handoff.payload.sourceVersion,
      status: "pending_delivery",
    });
    expect(installationHandoffPackageFromDeliveryState(state)).toEqual(handoff);
    expect(
      installationHandoffDeliveryState({ ...state, source_sha256: "not-a-digest" }),
    ).toBeNull();
  });

  it("builds the strict no-measure variant without MTS-local verification fields", () => {
    const handoff = buildNoMeasureInstallationHandoff({
      ...input,
      distinctPhysicalWindowOpenings: 3,
      hasDrapery: true,
    });

    expect(handoff.payload).toEqual({
      schemaVersion: "805-mts-installation-handoff-v1",
      handoffKind: "no_measure",
      sourceSystem: "805_crm",
      sourceCustomerId: input.sourceCustomerId,
      sourceJobId: input.sourceJobId,
      sourceDocumentId: input.sourceDocumentId,
      sourceVersion:
        "no_measure:10000000-0000-4000-8000-000000000003:2026-07-30T14:15:00.000-07:00",
      submittedAt: input.submittedAt,
      submittedBySourceProfileId: input.submittedBySourceProfileId,
      distinctPhysicalWindowOpenings: 3,
      hasDrapery: true,
    });
    expect(handoff.canonicalJson).not.toContain("verifiedByProfileId");
    expect(() =>
      buildNoMeasureInstallationHandoff({
        ...input,
        distinctPhysicalWindowOpenings: 3,
        hasDrapery: "no",
      }),
    ).toThrow("hasDrapery must be a boolean");
  });
});
