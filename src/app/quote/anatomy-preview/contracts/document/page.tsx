import { notFound } from 'next/navigation';
import { CustomerContractDocument } from '@/app/quote/[token]/CustomerContractDocument';
import { manufacturerBrandingFixture } from '@/lib/crm/customer-quote-branding.test-fixture';

/** Synthetic review data only; no customer record or signing/payment action. */
export default async function ContractDocumentReview({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  if(process.env.NODE_ENV!=='development') notFound();
  const { scenario } = await searchParams;
  const quote = manufacturerBrandingFixture();
  if (scenario === 'odd') quote.lines = quote.lines.slice(0, 3);
  if (scenario === 'dense') {
    const line = quote.lines[0];
    line.designOptions[0].options.push('Installation notes: Keep the existing trim. Confirm the mounting clearance at the upper corner and align the shade with the neighboring window. Preserve access to the window handle.');
    line.designOptions.push({ ...line.designOptions[0], id: 'second-design', label: 'B' });
    line.lineTotal *= 2;
  }
  quote.subtotal = quote.total = quote.lines.reduce((sum, line) => sum + line.lineTotal, 0);
  quote.depositDue = quote.balanceDue = quote.total / 2;
  return <><div style={{padding:16,background:'#f5f5f0'}}><a href="/quote/anatomy-preview/contracts/">Back to product collection</a><p>Sample contract · layout review only</p><a href="?scenario=odd">Odd item count</a> · <a href="?scenario=dense">Long notes and multiple designs</a></div><CustomerContractDocument quote={quote} previewOnly /></>;
}
