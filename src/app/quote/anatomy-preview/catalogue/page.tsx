import { notFound } from 'next/navigation';
import { anatomyProductIndex } from '@/lib/quote/contract-anatomy-catalog';
import { CatalogueChecklist } from './CatalogueChecklist';
export const metadata={title:'805 · Product render catalogue'};
export default function Page() {
  if(process.env.NODE_ENV!=='development')notFound();
  return <CatalogueChecklist products={anatomyProductIndex()}/>;
}
