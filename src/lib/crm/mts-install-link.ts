import type { MtsInstallLink, MtsInstallLinkInput, MtsInstallMatchBasis, MtsInstallMatchStatus, MtsInstallRecordReferences } from "./types";

export const MTS_INSTALL_LINK_FIELDS = [
  "mts_job_id",
  "mts_job_number",
  "scheduled_install_date",
  "install_status",
  "verified_completion_date",
  "open_issues",
  "charge_amount",
  "charge_basis",
  "record_references",
  "match_basis",
  "match_status",
] as const;

export const MTS_INSTALL_REFERENCE_FIELDS = [
  "mts_job_ref",
  "mts_invoice_number",
  "bill_805_ref",
  "contract_number",
  "work_order",
  "purchase_order",
] as const;

const MATCH_REFERENCE_KEY: Record<MtsInstallMatchBasis, (typeof MTS_INSTALL_REFERENCE_FIELDS)[number]> = {
  job_ref: "mts_job_ref",
  contract_number: "contract_number",
  work_order: "work_order",
  purchase_order: "purchase_order",
};

export const MTS_INSTALL_MATCH_BASIS_LABEL: Record<MtsInstallMatchBasis, string> = {
  job_ref: "MTS job ref",
  contract_number: "contract number",
  work_order: "work order",
  purchase_order: "purchase order",
};

export const MTS_INSTALL_REFERENCE_LABEL: Record<(typeof MTS_INSTALL_REFERENCE_FIELDS)[number], string> = {
  mts_job_ref: "MTS job ref",
  mts_invoice_number: "MTS invoice number",
  bill_805_ref: "805 bill ref",
  contract_number: "Contract number",
  work_order: "Work order",
  purchase_order: "PO number",
};

export class MtsInstallLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MtsInstallLinkError";
  }
}

function reject(message: string): never {
  throw new MtsInstallLinkError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") reject(`${field} must be short text`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > max) reject(`${field} is too long`);
  return text;
}

function readDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) reject(`${field} must be a calendar date`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    reject(`${field} must be a calendar date`);
  }
  return value;
}

function readIssues(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  const list = typeof value === "string" ? [value] : value;
  if (!Array.isArray(list)) reject("open_issues must be short text or a list of short text");
  if (list.length > 40) reject("open_issues list is too long");
  const issues: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") reject("open_issues must be short text or a list of short text");
    const text = item.trim();
    if (!text) continue;
    if (text.length > 240) reject("open_issues text is too long");
    issues.push(text);
  }
  return issues;
}

function readReferences(value: unknown): MtsInstallRecordReferences {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) reject("record_references must be an object");
  const allowed = new Set<string>(MTS_INSTALL_REFERENCE_FIELDS);
  const references: MtsInstallRecordReferences = {};
  for (const key of Object.keys(value).sort()) {
    if (!allowed.has(key)) reject(`MTS install link field is not allowed: ${key}`);
    const text = readText(value[key], "record_references", 120);
    if (text) references[key as keyof MtsInstallRecordReferences] = text;
  }
  return references;
}

function readAmount(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) reject("charge_amount must be a number");
  if (value < 0 || value > 9999999999.99) reject("charge_amount is out of range");
  return Math.round(value * 100) / 100;
}

/** Normalize a write. Unknown keys, including customer and payroll fields, are rejected. */
export function validateMtsInstallLinkInput(payload: unknown): MtsInstallLinkInput {
  if (!isRecord(payload)) reject("MTS install link payload must be an object");
  const allowed = new Set<string>(MTS_INSTALL_LINK_FIELDS);
  const unexpected = Object.keys(payload).filter((key) => !allowed.has(key)).sort();
  if (unexpected.length) reject(`MTS install link field is not allowed: ${unexpected.join(", ")}`);

  const chargeAmount = readAmount(payload.charge_amount);
  const chargeBasis = readText(payload.charge_basis, "charge_basis", 40);
  if (chargeAmount !== null && chargeBasis !== "estimated" && chargeBasis !== "invoiced") {
    reject("charge_basis must be estimated or invoiced when an install charge amount is set");
  }
  if (chargeAmount === null && chargeBasis) reject("charge_basis requires an install charge amount");

  const matchBasis = readText(payload.match_basis, "match_basis", 40);
  if (matchBasis !== "job_ref" && matchBasis !== "contract_number" && matchBasis !== "work_order" && matchBasis !== "purchase_order") {
    reject("match_basis must be job_ref, contract_number, work_order, or purchase_order");
  }
  const matchStatus = readText(payload.match_status, "match_status", 40);
  if (matchStatus !== "verified" && matchStatus !== "ambiguous") {
    reject("match_status must be verified or ambiguous");
  }
  const recordReferences = readReferences(payload.record_references);
  if (!recordReferences[MATCH_REFERENCE_KEY[matchBasis]]) {
    reject("match_basis requires the verified identifier in record_references");
  }

  return {
    mts_job_id: readText(payload.mts_job_id, "mts_job_id", 80),
    mts_job_number: readText(payload.mts_job_number, "mts_job_number", 80),
    scheduled_install_date: readDate(payload.scheduled_install_date, "scheduled_install_date"),
    install_status: readText(payload.install_status, "install_status", 200),
    verified_completion_date: readDate(payload.verified_completion_date, "verified_completion_date"),
    open_issues: readIssues(payload.open_issues),
    charge_amount: chargeAmount,
    charge_basis: chargeAmount === null ? null : chargeBasis as "estimated" | "invoiced",
    record_references: recordReferences,
    match_basis: matchBasis,
    match_status: matchStatus as MtsInstallMatchStatus,
  };
}

function storedAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

/** Read a stored row for display. Unknown keys are ignored and never returned. */
export function readMtsInstallLink(value: unknown): MtsInstallLink | null {
  if (!isRecord(value)) return null;
  const matchBasis = value.match_basis;
  const matchStatus = value.match_status;
  if (matchBasis !== "job_ref" && matchBasis !== "contract_number" && matchBasis !== "work_order" && matchBasis !== "purchase_order") return null;
  if (matchStatus !== "verified" && matchStatus !== "ambiguous") return null;
  const chargeBasis = value.charge_basis === "estimated" || value.charge_basis === "invoiced" ? value.charge_basis : null;
  const chargeAmount = storedAmount(value.charge_amount);
  if ((chargeAmount === null) !== (chargeBasis === null)) return null;
  const verifiedBy = typeof value.verified_by === "string" ? value.verified_by.trim() : "";
  const lastVerifiedAt = typeof value.last_verified_at === "string" ? value.last_verified_at.trim() : "";
  const jobId = typeof value.job_id === "string" ? value.job_id : "";
  if (!verifiedBy || !lastVerifiedAt || !jobId) return null;
  let input: MtsInstallLinkInput;
  try {
    input = validateMtsInstallLinkInput({
      mts_job_id: value.mts_job_id ?? null,
      mts_job_number: value.mts_job_number ?? null,
      scheduled_install_date: value.scheduled_install_date ?? null,
      install_status: value.install_status ?? null,
      verified_completion_date: value.verified_completion_date ?? null,
      open_issues: value.open_issues ?? [],
      charge_amount: chargeAmount,
      charge_basis: chargeBasis,
      record_references: referenceAllowlist(value.record_references),
      match_basis: matchBasis,
      match_status: matchStatus,
    });
  } catch {
    return null;
  }
  return { ...input, job_id: jobId, last_verified_at: lastVerifiedAt, verified_by: verifiedBy };
}

function referenceAllowlist(value: unknown): MtsInstallRecordReferences {
  if (!isRecord(value)) return {};
  const references: MtsInstallRecordReferences = {};
  for (const key of MTS_INSTALL_REFERENCE_FIELDS) {
    const text = value[key];
    if (typeof text === "string" && text.trim()) references[key] = text.trim();
  }
  return references;
}

export function attachMtsInstallLinks<T extends { id: string }>(jobs: T[], links: unknown[]): Array<T & { mts_install_link: MtsInstallLink | null }> {
  const byJob = new Map<string, MtsInstallLink>();
  for (const link of links) {
    const parsed = readMtsInstallLink(link);
    if (parsed) byJob.set(parsed.job_id, parsed);
  }
  return jobs.map((job) => ({ ...job, mts_install_link: byJob.get(job.id) ?? null }));
}

/** Job meta is not the store for this summary. Strip a stray copy on ordinary job edits. */
export function jobMetaWithoutMtsInstallLink(meta: unknown): Record<string, unknown> {
  if (!isRecord(meta)) return {};
  if (!Object.prototype.hasOwnProperty.call(meta, "mts_install_link")) return meta;
  const next = { ...meta };
  delete next.mts_install_link;
  return next;
}
