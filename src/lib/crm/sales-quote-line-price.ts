import { CrmAuthError } from "./auth";

export function parseLinePriceBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CrmAuthError(400, "A line price is required.");
  const body = value as Record<string, unknown>;
  const allowed = ["lineItemId", "variant", "unitPrice", "expectedRevision", "requestId"];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new CrmAuthError(400, "Unexpected line price fields.");
  for (const key of ["lineItemId", "requestId"]) {
    if (typeof body[key] !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body[key])) throw new CrmAuthError(400, `${key} is invalid.`);
  }
  if (typeof body.variant !== "string" || !body.variant.trim() || body.variant.length > 80) throw new CrmAuthError(400, "Choose a line design.");
  if (typeof body.unitPrice !== "number" || !Number.isFinite(body.unitPrice) || body.unitPrice < 0) throw new CrmAuthError(400, "Enter a price of $0 or more.");
  if (body.expectedRevision != null && (typeof body.expectedRevision !== "number" || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0)) throw new CrmAuthError(400, "Quote revision is invalid.");
  return { lineItemId: body.lineItemId as string, variant: body.variant.trim(),
    unitPrice: Math.round((body.unitPrice + Number.EPSILON) * 100) / 100,
    expectedRevision: body.expectedRevision as number | null ?? null, requestId: body.requestId as string };
}
