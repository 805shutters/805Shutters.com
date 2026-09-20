'use client';
import { sundanceCellularAccessories, sundanceCellularAccessoryKey, sundanceCellularOptionEvidence } from '@/lib/quote/sundance/cellular-option-schedules';
export function SundanceCellularAccessories({ options, widthInches, onChange }: { options: Record<string, unknown>; widthInches: number; onChange: (key: string, value: string) => void }) {
  const system = String(options.sundance_cellular_system ?? '');
  const choices = sundanceCellularAccessories.filter(a => (a.systems as readonly string[]).includes(system));
  const evidence = sundanceCellularOptionEvidence(options, widthInches);
  return <>
    {choices.length > 0 && <div className="space-y-2"><p className="text-sm font-medium">Motor accessories allocated to this line</p>{choices.map(accessory => <label className="block text-sm" key={accessory.key}>{accessory.label}<input type="number" min="0" step="1" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" aria-label={`Sundance cellular ${accessory.label} quantity`} value={String(options[sundanceCellularAccessoryKey(accessory.key)] ?? '')} onChange={e => onChange(sundanceCellularAccessoryKey(accessory.key), e.target.value)} /></label>)}<p className="text-sm text-amber-900">Allocate shared controls and power accessories once. Required quantities, motor compatibility and order-wide sharing need review before approving the manual price.</p></div>}
    <details className="text-sm"><summary className="cursor-pointer">Published cellular option evidence</summary><ul>{evidence.entries.map((e,index) => <li key={`${e.label}-${index}`}>{e.label}: {e.quantity} × ${e.unitPrice.toFixed(2)} {e.basis} (PDF {e.page}{e.matchedWidth ? `, width band ${e.matchedWidth} inches` : ''})</li>)}</ul><p>Retail options subtotal: ${evidence.retailSubtotal.toFixed(2)}. Net options subtotal: ${evidence.netSubtotal.toFixed(2)}. These are separate source amounts, not a customer price. Base fabrics, account terms, tax and unresolved order charges are excluded.</p>{evidence.unresolved.map(message => <p className="text-amber-900" key={message}>{message}</p>)}</details>
  </>;
}
