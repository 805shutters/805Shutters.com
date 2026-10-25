import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { getContactsAccess } from "@/lib/crm/google-contacts-auth";
import { buildContactCandidates, matchGoogleContact, mergeGoogleContact, normalizeContactPhone, type ContactCandidate, type ContactSource, type GooglePerson } from "@/lib/crm/google-contacts-model";

const FIELDS = "names,phoneNumbers,emailAddresses,addresses,userDefined,metadata";
type SyncRow = { customer_key: string; google_resource_name: string | null; status: string; exception_code: string | null; attempts: number; create_attempted_at: string | null; requested_at: string; next_attempt_at: string; source_refs: string[]; processed_request_at: string | null };
function storageError(error: unknown) { if (error) throw new CrmAuthError(503, "Google Contacts sync storage is unavailable."); }

async function allRows(supabase: SupabaseClient, table: string, columns: string) {
  const rows: Record<string, unknown>[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase.from(table).select(columns).order("id").range(start, start + 499);
    storageError(error);
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (!data || data.length < 500) return rows;
  }
}
export async function loadContactCandidates(supabase: SupabaseClient) {
  const [customers, jobs, quotes, ledger] = await Promise.all([
    allRows(supabase, "crm_customers", "id,display_name,phone,email,address,city,meta"),
    allRows(supabase, "crm_jobs", "id,customer_name,phone,email,address,city,meta"),
    allRows(supabase, "crm_quotes", "id,job_id,customer_printed_name,customer_phone,customer_email,customer_address,meta"),
    allRows(supabase, "crm_quote_bookkeeping_entries", "id,customer_name,meta")
  ]);
  const jobMap = new Map(jobs.map(j => [j.id, j]));
  const str = (value: unknown) => typeof value === "string" ? value : null;
  const deleted = (row: Record<string, unknown>) => Boolean((row.meta as Record<string, unknown> | null)?.deleted_at);
  const sources: ContactSource[] = [
    ...customers.map(c => ({ ref: `customer:${c.id}`, name: str(c.display_name), phone: str(c.phone), email: str(c.email), address: str(c.address), city: str(c.city), deleted: deleted(c) })),
    ...jobs.map(j => ({ ref: `job:${j.id}`, name: str(j.customer_name), phone: str(j.phone), email: str(j.email), address: str(j.address), city: str(j.city), deleted: deleted(j) })),
    ...quotes.map(q => { const j = jobMap.get(q.job_id); return { ref: `quote:${q.id}`, name: str(j?.customer_name) || str(q.customer_printed_name), phone: str(q.customer_phone) || str(j?.phone), email: str(q.customer_email) || str(j?.email), address: str(q.customer_address) || str(j?.address), deleted: deleted(q) || Boolean(j && deleted(j)) }; }),
    ...ledger.map(l => ({ ref: `bookkeeping:${l.id}`, name: str(l.customer_name), deleted: deleted(l) }))
  ];
  // Never resurrect a deleted customer through a related job or quote.
  const deletedNames = new Set(customers.filter(deleted).map(c => String(c.display_name).trim().toLowerCase().replace(/[^a-z0-9]+/g," ").trim()));
  return buildContactCandidates(sources.filter(s => !deletedNames.has((s.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g," ").trim())));
}

export class GoogleContactsApi {
  constructor(private accessToken: string) {}
  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await fetch(`https://people.googleapis.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new CrmAuthError(502, `google_contacts_http_${response.status}`);
    return response.json() as Promise<T>;
  }
  async list() {
    const people: GooglePerson[] = [];
    let pageToken = "";
    do {
      const params = new URLSearchParams({ personFields: FIELDS, pageSize: "1000", sources: "READ_SOURCE_TYPE_CONTACT", ...(pageToken ? { pageToken } : {}) });
      const data = await this.request<{ connections?: GooglePerson[]; nextPageToken?: string }>(`people/me/connections?${params}`);
      people.push(...(data.connections || []));
      pageToken = data.nextPageToken || "";
    } while (pageToken);
    return people;
  }
  get(resource: string) { return this.request<GooglePerson>(`${resource}?personFields=${FIELDS}&sources=READ_SOURCE_TYPE_CONTACT`); }
  create(candidate: ContactCandidate) { return this.request<GooglePerson>(`people:createContact?personFields=${FIELDS}`, "POST", mergeGoogleContact(candidate)); }
  update(candidate: ContactCandidate, existing: GooglePerson) {
    // Fetch a current etag and retain every existing value in each updated field.
    return this.request<GooglePerson>(`${existing.resourceName}:updateContact?updatePersonFields=phoneNumbers,emailAddresses,addresses,userDefined&personFields=${FIELDS}`, "PATCH", mergeGoogleContact(candidate, existing));
  }
}
export async function syncRows(supabase: SupabaseClient): Promise<SyncRow[]> {
  // customer_key rather than id is the queue's stable primary key.
  const rows: SyncRow[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase.from("crm_google_contacts_sync").select("*").order("customer_key").range(start,start+499);
    storageError(error); rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}

export async function contactsDryRun(supabase: SupabaseClient, options: { crmOnly?: boolean } = {}) {
  const candidates = await loadContactCandidates(supabase);
  const counts = { total: candidates.length, eligible: 0, alreadyMatched: 0, wouldCreate: 0, missingData: 0, ambiguous: 0, failed: 0, uncertain: 0, destinationChecked: false };
  let people: GooglePerson[] = [], rows: SyncRow[] = [];
  if (!options.crmOnly) {
    people = await new GoogleContactsApi(await getContactsAccess(supabase)).list();
    rows = await syncRows(supabase);
    counts.destinationChecked = true;
  }
  const details = candidates.map(c => {
    const row = rows.find(r => r.customer_key === c.key);
    let code = c.issue;
    if (code?.startsWith("missing")) counts.missingData++;
    else if (code) counts.ambiguous++;
    else {
      counts.eligible++;
      if (options.crmOnly) code = "destination_not_checked";
      else {
        const match = matchGoogleContact(c, people, row?.google_resource_name);
        if (match.kind === "ambiguous") { counts.ambiguous++; code = match.reason; }
        else if (match.kind === "matched") { counts.alreadyMatched++; code = "matched"; }
        else if (row?.create_attempted_at) { counts.uncertain++; code = "create_outcome_unknown"; }
        else { counts.wouldCreate++; code = "would_create"; }
      }
    }
    if (row?.status === "failed") counts.failed++;
    return { customerKey: c.key, sourceRefs: c.refs, code };
  });
  // Details contain customer identities: only the Mike-only API may return them.
  return { counts, details };
}

export async function enqueueContactsBackfill(supabase: SupabaseClient) {
  const candidates = await loadContactCandidates(supabase);
  for (let i = 0; i < candidates.length; i += 200) {
    // ignoreDuplicates preserves verified mappings and uncertain creation outcomes.
    const { error } = await supabase.from("crm_google_contacts_sync").upsert(candidates.slice(i,i+200).map(c => ({ customer_key: c.key, source_refs: c.refs })), { onConflict: "customer_key", ignoreDuplicates: true });
    storageError(error);
  }
  // Resume source exceptions only after their cause is resolved. Preserve all
  // mappings/create intent, destination conflicts, and concurrent edit requests.
  const resolvedSourceCodes = new Set(["shared_crm_phone", "conflicting_crm_phones", "missing_name", "missing_or_invalid_phone"]);
  const eligibleKeys = new Set(candidates.filter(c => !c.issue).map(c => c.key));
  for (const row of await syncRows(supabase)) {
    if (!["ambiguous", "missing_data"].includes(row.status) || !resolvedSourceCodes.has(row.exception_code || "") || !eligibleKeys.has(row.customer_key)) continue;
    const now = new Date().toISOString();
    const { error } = await supabase.from("crm_google_contacts_sync").update({ status: "pending", exception_code: null, requested_at: now, next_attempt_at: now, updated_at: now })
      .eq("customer_key", row.customer_key).eq("status", row.status).eq("requested_at", row.requested_at);
    storageError(error);
  }
  return { queuedPopulation: candidates.length };
}

export async function processContactsQueue(supabase: SupabaseClient, limit = 10) {
  const lockId = randomUUID();
  const { data: locked, error: lockError } = await supabase.rpc("crm_google_contacts_lock", { lock_id: lockId });
  storageError(lockError);
  if (!locked) return { processed: 0, busyOrDisconnected: true };
  let processed = 0;
  const stopAt = Date.now() + 220000;
  try {
    const api = new GoogleContactsApi(await getContactsAccess(supabase));
    const [people, candidates, rows] = await Promise.all([api.list(), loadContactCandidates(supabase), syncRows(supabase)]);
    const byKey = new Map(candidates.map(c => [c.key,c]));
    for (const row of rows.filter(r => ["pending","failed","uncertain"].includes(r.status) && Date.parse(r.next_attempt_at) <= Date.now()).slice(0,limit)) {
      if (Date.now() > stopAt) break;
      const candidate = byKey.get(row.customer_key) || candidates.find(c => c.refs.some(ref => row.source_refs.includes(ref)));
      const save = async (patch: Record<string, unknown>) => {
        // A sale/customer edit received during this pass keeps its newer request pending.
        const { error } = await supabase.from("crm_google_contacts_sync").update({ ...patch, updated_at: new Date().toISOString() }).eq("customer_key",row.customer_key);
        storageError(error);
      };
      const finish = async (patch: Record<string, unknown>) => {
        const { error } = await supabase.from("crm_google_contacts_sync").update({ ...patch, processed_request_at: row.requested_at, updated_at: new Date().toISOString() }).eq("customer_key",row.customer_key).eq("requested_at",row.requested_at);
        storageError(error);
      };
      try {
        if (!candidate) { await finish({ status: "removed", exception_code: "source_deleted_or_renamed" }); continue; }
        await save({ source_refs: candidate.refs, attempts: row.attempts + 1 });
        if (candidate.issue) { await finish({ status: candidate.issue.startsWith("missing") ? "missing_data" : "ambiguous", exception_code: candidate.issue }); continue; }
        // Connection lists may lag recent writes. Read a durable mapping directly.
        if (row.google_resource_name && !people.some(p => p.resourceName === row.google_resource_name)) people.push(await api.get(row.google_resource_name));
        const match = matchGoogleContact(candidate, people, row.google_resource_name);
        if (match.kind === "ambiguous") { await finish({ status: "ambiguous", exception_code: match.reason }); continue; }
        if (match.kind === "create" && row.create_attempted_at) {
          // A timed-out create is never retried blindly. The durable marker can
          // recover it on subsequent passes; absence is not proof of no creation.
          await finish({ status: "uncertain", exception_code: "create_outcome_unknown", next_attempt_at: new Date(Date.now()+900000).toISOString() }); continue;
        }
        let person: GooglePerson;
        if (match.kind === "matched") {
          person = await api.get(match.person.resourceName!);
          await save({ google_resource_name: person.resourceName });
          person = await api.update(candidate, person);
        } else {
          // Persist BEFORE any request. Even a worker crash cannot cause a second create.
          await save({ create_attempted_at: new Date().toISOString() });
          person = await api.create(candidate);
        }
        if (!person.resourceName) throw new Error("missing_resource");
        await save({ google_resource_name: person.resourceName });
        const verified = await api.get(person.resourceName);
        if (!verified.userDefined?.some(m => m.key === "805 CRM customer" && m.value === candidate.key)
          || !verified.phoneNumbers?.some(p => normalizeContactPhone(p.canonicalForm || p.value) === candidate.phone)) throw new Error("verification_failed");
        const index = people.findIndex(p => p.resourceName === verified.resourceName);
        if (index >= 0) people[index] = verified; else people.push(verified);
        await finish({ status: "synced", exception_code: null, synced_at: new Date().toISOString() });
        processed++;
      } catch (error) {
        // Never persist Google response bodies, tokens, or arbitrary upstream errors.
        const code = error instanceof CrmAuthError && /^google_contacts_http_\d+$/.test(error.message) ? error.message : "sync_or_verification_failed";
        await finish({ status: "failed", exception_code: code, next_attempt_at: new Date(Date.now()+Math.min(86400000,60000*2**Math.min(row.attempts,10))).toISOString() });
      }
    }
    return { processed, busyOrDisconnected: false };
  } finally {
    const { error } = await supabase.from("crm_google_contacts_connection").update({ lease_id: null, lease_until: null }).eq("id",true).eq("lease_id",lockId);
    storageError(error);
  }
}
