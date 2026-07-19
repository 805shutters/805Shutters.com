import { createHmac, timingSafeEqual } from "crypto";

export type MetaFieldDatum = { name?: string; values?: unknown[] };

export type MappedMetaLead = {
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  notes: string | null;
};

const FIELD_ALIASES: Record<string, keyof MappedMetaLead> = {
  full_name: "name",
  name: "name",
  first_name: "name",
  phone_number: "phone",
  phone: "phone",
  email: "email",
  city: "city",
};

/** Map Meta Instant Form field_data to our lead shape; unknown questions become notes. */
export function mapMetaFieldData(fieldData: MetaFieldDatum[] | null | undefined): MappedMetaLead {
  const lead: MappedMetaLead = { name: null, phone: null, email: null, city: null, notes: null };
  const extras: string[] = [];
  let lastName: string | null = null;

  for (const field of fieldData || []) {
    const key = String(field.name || "").toLowerCase();
    const value = String(field.values?.[0] ?? "").trim();
    if (!value) continue;
    if (key === "last_name") {
      lastName = value;
    } else if (key in FIELD_ALIASES) {
      const target = FIELD_ALIASES[key];
      if (!lead[target]) lead[target] = value;
    } else {
      extras.push(`${field.name}: ${value}`);
    }
  }

  if (lastName) lead.name = [lead.name, lastName].filter(Boolean).join(" ");
  if (extras.length) lead.notes = extras.join("\n");
  return lead;
}

/** Constant-time check of Meta's X-Hub-Signature-256 header against the raw body. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = header.slice("sha256=".length);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
}
