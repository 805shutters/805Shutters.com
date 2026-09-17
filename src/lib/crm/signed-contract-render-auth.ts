import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]),
  );
  return value;
}

export function contractSnapshotDigest(snapshot: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(snapshot))).digest("hex");
}

export function contractRenderAuthorization(id: string, digest: string, expires: number, secret: string) {
  return createHmac("sha256", secret).update(`contract-pdf-v2:${id}:${digest}:${expires}`).digest("hex");
}

export function verifyContractRenderAuthorization(input: {
  id: string; digest: string; expires: number; proof: string; secret: string; now?: number;
}) {
  const now = input.now ?? Date.now();
  if (!input.secret || !/^[a-f0-9]{64}$/.test(input.digest) || !/^[a-f0-9]{64}$/.test(input.proof)
    || !Number.isFinite(input.expires) || input.expires < now || input.expires > now + 300_000) return false;
  return timingSafeEqual(Buffer.from(input.proof, "hex"), Buffer.from(
    contractRenderAuthorization(input.id, input.digest, input.expires, input.secret), "hex",
  ));
}
