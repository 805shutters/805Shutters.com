import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSupplierDraftJob, supabaseDraftJobStore } from './supplier-draft-job-store';
import { runDraftJob,type QuoteChargeAmounts,type SupplierDraftAdapter,type CustomerDraftAdapter } from './supplier-draft-orchestrator';

export async function loadQuoteChargeSettings(db:SupabaseClient):Promise<QuoteChargeAmounts|null> {
  const {data,error}=await db.from('crm_quote_charge_settings').select('key,amount');
  if(error||!data)return null;
  const amount=(key:string)=>{
    const row=data.find(item=>item.key===key);
    const value=row?Number(row.amount):Number.NaN;
    return Number.isFinite(value)&&value>=0?value.toFixed(2):null;
  };
  const installationPerUnit=amount('install_per_unit'),shippingPerUnit=amount('ship_per_unit');
  return installationPerUnit&&shippingPerUnit?{installationPerUnit,shippingPerUnit}:null;
}
/** The local implementation has no connected supplier or customer-write adapters.
 * Persist honest blockers rather than leave an apparently processing job stranded.
 * No portal, quote RPC, browser, purchase, send or payment action occurs here.
 * A future authorized integration must replace this with a durable worker registry.
 */
export async function recordUnconnectedDraftRuntime(db:SupabaseClient,id:string,ownerId:string) {
  await loadSupplierDraftJob(db,id,ownerId);
  await runDraftJob(id,{store:supabaseDraftJobStore(db),suppliers:{},customer:undefined,chargeSettings:null});
  return loadSupplierDraftJob(db,id,ownerId);
}

/** Explicit server integration entry point. Routes keep using the disabled path
 * until supplier ports, deployed fee evidence and worker operation are approved.
 * Existing CRM authorization must supply ownerId; this first checks job ownership.
 */
export async function runConfiguredDraftRuntime(
  db:SupabaseClient,id:string,ownerId:string,
  adapters:{suppliers:Record<string,SupplierDraftAdapter|undefined>;customer:CustomerDraftAdapter|undefined},
) {
  await loadSupplierDraftJob(db,id,ownerId);
  await runDraftJob(id,{store:supabaseDraftJobStore(db),...adapters,chargeSettings:await loadQuoteChargeSettings(db)});
  return loadSupplierDraftJob(db,id,ownerId);
}
