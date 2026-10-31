import type { CrmBookkeepingRow, CrmPartnerPaymentHistoryAllocation } from './types';
import { partnerPaymentItemKeyForRow } from './partner-payments';

export type KenPayoffAlias = { alias_key: string; canonical_key: string; entitlement: number; blocked_reason: string | null };
export type KenPayoffIdentityReview = { itemKey: string; customerName: string; quoteNumber: string | null; canonicalKey: string | null; status: 'duplicate' | 'blocked'; reason: string };
const cents = (value: number) => Math.round(value * 100) / 100;
const keyFor = (row: CrmBookkeepingRow) => partnerPaymentItemKeyForRow('ken', row);

/** Pure fixture/offline resolver. Production always supplies the persisted registry. */
function derivedAliases(rows: CrmBookkeepingRow[]): KenPayoffAlias[] {
  const aliases: KenPayoffAlias[] = [];
  for (const row of rows) {
    const contracts = [...new Set(rows.filter(r => r.jobId && r.jobId === row.jobId && r.quoteId).map(r => r.quoteId!))];
    const contract = row.quoteId || (contracts.length === 1 ? contracts[0] : null);
    const contractRow = contract ? rows.find(r => r.quoteId === contract) : undefined;
    const reason = !row.quoteId && contracts.length > 1 ? 'Multiple contracts on this job; link the exact contract before paying Ken.'
      : !row.quoteId && contractRow && cents(row.total) !== cents(contractRow.total) ? 'Manual record conflicts with the linked job contract total.' : null;
    const canonical = contract ? `quote:${contract}` : row.jobId ? `job:${row.jobId}` : `entry:${row.id}`;
    const keys = [keyFor(row), ...(row.quoteId ? [`quote:${row.quoteId}`, ...(row.quoteIdAliases || []).flatMap(id => [`quote:${id}`, `ken:crm_quote:${id}`])] : [`entry:${row.id}`])];
    for (const alias_key of keys) aliases.push({ alias_key, canonical_key: canonical, entitlement: cents((contractRow?.total ?? row.total) * .1), blocked_reason: reason });
  }
  return aliases;
}

export function kenPayoffIdentity(rows: CrmBookkeepingRow[], registry?: KenPayoffAlias[]) {
  const aliases = registry ?? derivedAliases(rows);
  const byAlias = new Map<string, KenPayoffAlias>();
  for (const alias of aliases) {
    const existing = byAlias.get(alias.alias_key);
    byAlias.set(alias.alias_key, existing && existing.canonical_key !== alias.canonical_key ? { ...existing, blocked_reason: 'Source identity belongs to multiple contracts.' } : alias);
  }
  const review: KenPayoffIdentityReview[] = [];
  const groups = new Map<string, { row: CrmBookkeepingRow; canonicalKey: string; aliasKeys: string[]; entitlement: number; members: CrmBookkeepingRow[] }>();
  const blocked = new Map<string, string>();
  for (const alias of byAlias.values()) if (alias.blocked_reason) blocked.set(alias.canonical_key, alias.blocked_reason);
  for (const row of rows.filter(r => r.total > 0)) {
    const alias = byAlias.get(keyFor(row));
    if (!alias) {
      review.push({ itemKey: keyFor(row), customerName: row.customerName, quoteNumber: row.quoteNumber, canonicalKey: null, status: 'blocked', reason: 'Payoff identity is unavailable. Reload after reconciliation.' });
      continue;
    }
    let group = groups.get(alias.canonical_key);
    if (!group) {
      group = { row, canonicalKey: alias.canonical_key, aliasKeys: [...byAlias.values()].filter(a => a.canonical_key === alias.canonical_key).map(a => a.alias_key), entitlement: Number(alias.entitlement), members: [] };
      groups.set(alias.canonical_key, group);
    }
    group.members.push(row);
    if (Number(alias.entitlement) !== group.entitlement) blocked.set(alias.canonical_key, 'Conflicting contract entitlements.');
  }
  for (const group of groups.values()) {
    group.members.sort((a,b) => Number(b.source === 'crm_quote') - Number(a.source === 'crm_quote') || Number(Boolean(b.quoteId)) - Number(Boolean(a.quoteId)) || a.id.localeCompare(b.id));
    group.row = group.members[0];
    const reason = blocked.get(group.canonicalKey);
    for (const row of group.members) {
      if (reason || row !== group.row) review.push({ itemKey: keyFor(row), customerName: row.customerName, quoteNumber: row.quoteNumber, canonicalKey: group.canonicalKey, status: reason ? 'blocked' : 'duplicate', reason: reason || `Already represented by ${group.row.quoteNumber || 'the canonical job record'}; excluded from Ken payoff.` });
    }
  }
  const resolve = (a: Pick<CrmPartnerPaymentHistoryAllocation, 'itemKey' | 'quoteId' | 'bookkeepingEntryId'> & { jobId?: string | null }) => {
    const keys = [a.itemKey, a.quoteId ? `quote:${a.quoteId}` : null, a.bookkeepingEntryId ? `entry:${a.bookkeepingEntryId}` : null].filter((k): k is string => Boolean(k));
    const matched = keys.map(k => byAlias.get(k));
    const group = matched[0] ? groups.get(matched[0].canonical_key) : undefined;
    if (a.jobId && group && !group.members.some(row => row.jobId === a.jobId)) return null;
    return matched.length && matched.every(m => m && !m.blocked_reason) && new Set(matched.map(m => m!.canonical_key)).size === 1 ? matched[0]!.canonical_key : null;
  };
  const related = (a: Pick<CrmPartnerPaymentHistoryAllocation, 'itemKey' | 'quoteId' | 'bookkeepingEntryId'>, canonicalKey: string) =>
    [a.itemKey, a.quoteId ? `quote:${a.quoteId}` : '', a.bookkeepingEntryId ? `entry:${a.bookkeepingEntryId}` : ''].some(k => byAlias.get(k)?.canonical_key === canonicalKey);
  const hasKnownContractIdentity = (a: Pick<CrmPartnerPaymentHistoryAllocation, 'itemKey' | 'quoteId' | 'bookkeepingEntryId'>) =>
    [a.itemKey, `quote:${a.quoteId}`, `entry:${a.bookkeepingEntryId}`].some(k => byAlias.get(k)?.canonical_key.startsWith('quote:'));
  return { hasKnownContractIdentity, groups: [...groups.values()].filter(g => !blocked.has(g.canonicalKey)), review, resolve, related };
}
