import { describe, expect, it } from "vitest";
import { contractRenderAuthorization, contractSnapshotDigest, verifyContractRenderAuthorization } from "./signed-contract-render-auth";

describe("private contract print access", () => {
  const secret = "local-test-only";
  const digest = contractSnapshotDigest({ quote: { id: "one" }, lines: [1, 2] });
  const request = { id: "outbox-one", digest, expires: 120_000, secret, now: 100_000 };
  const proof = contractRenderAuthorization(request.id, digest, request.expires, secret);
  it("survives Postgres JSON key reordering, but detects content or line order changes", () => {
    expect(contractSnapshotDigest({ lines: [1, 2], quote: { id: "one" } })).toBe(digest);
    expect(contractSnapshotDigest({ lines: [2, 1], quote: { id: "one" } })).not.toBe(digest);
  });
  it("accepts only the exact record, content, expiry and server secret", () => {
    expect(verifyContractRenderAuthorization({ ...request, proof })).toBe(true);
    for (const change of [{ id: "other" }, { digest: "0".repeat(64) }, { now: 120_001 },
      { expires: 130_000 }, { secret: "" }, { proof: "" }, { proof: "bad" }]) {
      expect(verifyContractRenderAuthorization({ ...request, proof, ...change })).toBe(false);
    }
  });
});
