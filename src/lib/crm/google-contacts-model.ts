// Pure reconciliation rules. Never match two people using a phone or a name alone.
export type ContactSource = {
  ref: string; name: string | null; phone?: string | null; email?: string | null;
  address?: string | null; city?: string | null; deleted?: boolean;
};
export type ContactCandidate = {
  key: string; name: string; phone: string | null; emails: string[]; addresses: string[];
  refs: string[]; issue: string | null;
};
export type GooglePerson = {
  resourceName?: string; etag?: string; metadata?: { sources?: { type?: string; id?: string; etag?: string }[]; deleted?: boolean };
  names?: { displayName?: string; unstructuredName?: string }[];
  phoneNumbers?: { value?: string; canonicalForm?: string; type?: string }[];
  emailAddresses?: { value?: string; type?: string }[];
  addresses?: { formattedValue?: string; type?: string }[];
  userDefined?: { key: string; value: string }[];
};
export const CONTACT_MARKER = "805 CRM customer";
export const CONTACT_SOURCE_MARKER = "805 CRM source";
export const contactNameKey = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function normalizeContactPhone(input: string | null | undefined): string | null {
  const raw = (input || "").trim().replace(/(?:ext\.?|x|#)\s*\d+$/i, "").trim();
  if (!raw || /[^\d+().\s-]/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && /^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && /^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return `+${digits}`;
  if (raw.startsWith("+") && /^[2-9]\d{7,14}$/.test(digits)) return `+${digits}`;
  return null;
}

export function buildContactCandidates(sources: ContactSource[]): ContactCandidate[] {
  const groups = new Map<string, ContactSource[]>();
  for (const source of sources.filter(s => !s.deleted)) {
    const key = contactNameKey(source.name || "") || `missing:${source.ref}`;
    groups.set(key, [...(groups.get(key) || []), source]);
  }
  const candidates = [...groups].map(([key, rows]): ContactCandidate => {
    const phones = [...new Set(rows.map(s => normalizeContactPhone(s.phone)).filter((s): s is string => !!s))];
    const name = rows.find(s => s.name?.trim())?.name?.trim() || "";
    return { key, name, phone: phones[0] || null,
      emails: [...new Set(rows.flatMap(s => s.email?.trim() ? [s.email.trim().toLowerCase()] : []))],
      addresses: [...new Set(rows.flatMap(s => s.address?.trim() ? [[s.address.trim(), s.city?.trim()].filter(Boolean).join(", ")] : []))],
      refs: rows.map(s => s.ref),
      issue: !name || key.startsWith("missing:") ? "missing_name" : phones.length > 1 ? "conflicting_crm_phones" : !phones.length ? "missing_or_invalid_phone" : null };
  });
  const phoneOwners = new Map<string, string[]>();
  for (const c of candidates) if (c.phone) phoneOwners.set(c.phone, [...(phoneOwners.get(c.phone) || []), c.key]);
  for (const c of candidates) if (!c.issue && c.phone && phoneOwners.get(c.phone)!.length > 1) c.issue = "shared_crm_phone";
  return candidates.sort((a,b) => a.key.localeCompare(b.key));
}

export function matchGoogleContact(candidate: ContactCandidate, people: GooglePerson[], mappedResource?: string | null) {
  const live = people.filter(p => !p.metadata?.deleted);
  const marked = live.filter(p => p.userDefined?.some(m => (m.key === CONTACT_MARKER && m.value === candidate.key) || (m.key === CONTACT_SOURCE_MARKER && candidate.refs.includes(m.value))));
  if (marked.length > 1) return { kind: "ambiguous" as const, reason: "duplicate_crm_marker" };
  if (marked.length === 1) return { kind: "matched" as const, person: marked[0] };
  if (mappedResource) {
    const mapped = live.find(p => p.resourceName === mappedResource);
    return mapped ? { kind: "matched" as const, person: mapped } : { kind: "ambiguous" as const, reason: "mapped_contact_missing" };
  }
  const possible = live.filter(p => p.names?.some(n => contactNameKey(n.displayName || n.unstructuredName || "") === candidate.key)
    || p.phoneNumbers?.some(n => normalizeContactPhone(n.canonicalForm || n.value) === candidate.phone)
    || p.emailAddresses?.some(e => candidate.emails.includes((e.value || "").toLowerCase())));
  const exact = possible.filter(p => p.names?.some(n => contactNameKey(n.displayName || n.unstructuredName || "") === candidate.key)
    && p.phoneNumbers?.some(n => normalizeContactPhone(n.canonicalForm || n.value) === candidate.phone));
  // Any competing partial match is an exception, including a different name using this phone.
  if (possible.length === 1 && exact.length === 1) return { kind: "matched" as const, person: exact[0] };
  if (possible.length) return { kind: "ambiguous" as const, reason: "existing_contact_identity_conflict" };
  return { kind: "create" as const };
}

export function mergeGoogleContact(candidate: ContactCandidate, person?: GooglePerson): GooglePerson {
  const markers = person?.userDefined || [];
  const phones = [...(person?.phoneNumbers || [])];
  if (!phones.some(p => normalizeContactPhone(p.canonicalForm || p.value) === candidate.phone)) phones.push({ value: candidate.phone!, type: "other" });
  const emails = [...(person?.emailAddresses || [])];
  for (const email of candidate.emails) if (!emails.some(e => e.value?.toLowerCase() === email)) emails.push({ value: email, type: "other" });
  const addresses = [...(person?.addresses || [])];
  for (const address of candidate.addresses) if (!addresses.some(a => a.formattedValue === address)) addresses.push({ formattedValue: address, type: "other" });
  return {
    ...(person?.resourceName ? { resourceName: person.resourceName, etag: person.etag, metadata: person.metadata } : {}),
    // Existing personal details are additive only; the CRM record is never changed by Google.
    names: person?.names?.length ? person.names : [{ unstructuredName: candidate.name }],
    phoneNumbers: phones, emailAddresses: emails, addresses,
    userDefined: [...markers.filter(m => !((m.key === CONTACT_MARKER && m.value === candidate.key) || (m.key === CONTACT_SOURCE_MARKER && candidate.refs.includes(m.value)))), { key: CONTACT_MARKER, value: candidate.key }, ...candidate.refs.map(value => ({ key: CONTACT_SOURCE_MARKER, value }))]
  };
}
