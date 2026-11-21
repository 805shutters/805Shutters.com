import { NextRequest } from "next/server";
import { CrmAuthError } from "@/lib/crm/auth";
import type { CustomerSelection, QuoteFrontDoorSpec } from "@/lib/crm/quote-front-door";

export async function readFrontDoorBody(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CrmAuthError(400, "Request body must be an object.");
  }
  return body as Record<string, unknown>;
}

export function textField(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function specField(value: unknown): QuoteFrontDoorSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const answers = record.answers && typeof record.answers === "object" && !Array.isArray(record.answers)
    ? record.answers as Record<string, unknown>
    : undefined;
  const previous = record.previous && typeof record.previous === "object" && !Array.isArray(record.previous)
    ? record.previous as Record<string, unknown>
    : null;
  const multiplier = typeof record.multiplier === "string" || typeof record.multiplier === "number" ? record.multiplier : null;
  return {
    answers,
    catalog_version: typeof record.catalog_version === "string" ? record.catalog_version : null,
    previous: previous
      ? {
          manufacturer: typeof previous.manufacturer === "string" ? previous.manufacturer : undefined,
          category: typeof previous.category === "string" ? previous.category : undefined,
        }
      : undefined,
    multiplier,
  };
}

export function customerField(value: unknown): CustomerSelection {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    name: typeof record.name === "string" ? record.name : null,
    phone: typeof record.phone === "string" ? record.phone : null,
    address: typeof record.address === "string" ? record.address : null,
    customerId: typeof record.customerId === "string" ? record.customerId : null,
    jobId: typeof record.jobId === "string" ? record.jobId : null,
    candidateId: typeof record.candidateId === "string" ? record.candidateId : null,
    confirmNewCustomer: record.confirmNewCustomer === true,
  };
}
