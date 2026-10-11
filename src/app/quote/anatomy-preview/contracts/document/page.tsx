import { notFound } from 'next/navigation';
import { CustomerContractDocument } from '@/app/quote/[token]/CustomerContractDocument';
import { manufacturerBrandingFixture } from '@/lib/crm/customer-quote-branding.test-fixture';

/** Synthetic review data only; no customer record or signing/payment action. */
export default function ContractDocumentReview() {
  if(process.env.NODE_ENV!=='development') notFound();
  return <><div style={{padding:16,background:'#f5f5f0'}}><a href="/quote/anatomy-preview/contracts/">Back to product collection</a><p>Sample contract · layout review only</p></div><CustomerContractDocument quote={manufacturerBrandingFixture()} previewOnly /></>;
}
