import { toE164 } from "@/lib/notify/twilio";

export type MobileCustomerScope = "active" | "archived";
export type MobileCustomerResult = {
  id: string; jobId: string; quoteId: string | null;
  name: string; phone: string | null; email: string | null; address: string | null;
  deposit: number; balance: number; contractTotal: number;
};

type JobRow = { id:string; customer_name?:string|null; phone?:string|null; email?:string|null; address?:string|null; city?:string|null; state?:string|null; zip?:string|null; estimated_total?:number|null; deposit_paid?:number|null; meta?:Record<string,unknown>|null };
type QuoteRow = { id:string; job_id:string; status?:string|null; quote_total?:number|null; deposit_required?:number|null; customer_phone?:string|null; customer_email?:string|null };
type PaymentRow = { quote_id:string; amount?:number|null; payment_label?:string|null };
type CreditRow = { to_quote_id?:string|null; from_quote_id?:string|null; amount?:number|null };

function sum(rows:Array<{amount?:number|null}>) { return rows.reduce((total,row)=>total+(Number(row.amount)||0),0); }
function paymentAmounts(total:number,depositRequired:number,payments:PaymentRow[],creditsIn:CreditRow[],creditsOut:CreditRow[]) {
  const paid=sum(payments),depositPaid=sum(payments.filter(payment=>String(payment.payment_label||"").toLowerCase().includes("deposit")));
  const outstanding=Math.max(total-paid-sum(creditsIn)+sum(creditsOut),0);
  const deposit=Math.min(Math.max(depositRequired-depositPaid,0),outstanding);
  return {deposit,balance:Math.max(outstanding-deposit,0)};
}

export function mobileCustomerMatchesLetter(name:string|null|undefined,letter:string|null|undefined) {
  const normalized=String(letter||"").trim().toUpperCase();
  if(!/^[A-Z]$/.test(normalized)) return false;
  const parts=String(name||"").trim().split(/\s+/).filter(Boolean);
  return Boolean(parts[0]?.toUpperCase().startsWith(normalized)||parts.at(-1)?.toUpperCase().startsWith(normalized));
}

export function mobilePhoneTarget(phone: string | null | undefined) {
  const value = toE164(phone);
  return value ? `tel:${value}` : null;
}

export function mobileMapTarget(address: string | null | undefined) {
  const value = String(address || "").trim();
  return value ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}` : null;
}

export function projectMobileCustomers(input:{jobs:JobRow[];quotes:QuoteRow[];payments?:PaymentRow[];credits?:CreditRow[];scope:MobileCustomerScope}) {
  const payments = input.payments || [], credits = input.credits || [];
  const quoteResults = input.quotes.filter(q => (q.status === "archived") === (input.scope === "archived")).flatMap(q => {
    const job = input.jobs.find(j => j.id === q.job_id);
    if (!job || job.meta?.deleted_at) return [];
    const amounts = paymentAmounts(Number(q.quote_total)||0,Number(q.deposit_required)||0,payments.filter(p=>p.quote_id===q.id),credits.filter(c=>c.to_quote_id===q.id),credits.filter(c=>c.from_quote_id===q.id));
    const address = [job.address,job.city,job.state,job.zip].filter(Boolean).join(", ") || null;
    return [{id:q.id,jobId:job.id,quoteId:q.id,name:String(job.customer_name||"Customer"),phone:q.customer_phone||job.phone||null,email:q.customer_email||job.email||null,address,deposit:amounts.deposit,balance:amounts.balance,contractTotal:Number(q.quote_total)||0} satisfies MobileCustomerResult];
  });
  if (input.scope === "archived") return quoteResults;
  const quotedJobIds = new Set(input.quotes.map(quote => quote.job_id));
  const jobResults = input.jobs.filter(job => !quotedJobIds.has(job.id) && !job.meta?.deleted_at).map(job => {
    const contractTotal = Number(job.estimated_total) || 0;
    const deposit = Number(job.deposit_paid) || 0;
    return {id:`job:${job.id}`,jobId:job.id,quoteId:null,name:String(job.customer_name||"Customer"),phone:job.phone||null,email:job.email||null,address:[job.address,job.city,job.state,job.zip].filter(Boolean).join(", ")||null,deposit,balance:Math.max(contractTotal-deposit,0),contractTotal} satisfies MobileCustomerResult;
  });
  return [...quoteResults, ...jobResults];
}
