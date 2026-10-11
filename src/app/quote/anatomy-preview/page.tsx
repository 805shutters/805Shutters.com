import { notFound } from 'next/navigation';
import { anatomyProductIndex } from '@/lib/quote/contract-anatomy-catalog';
import { AnatomyPreview } from './AnatomyPreview';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CatalogueSelection } from '@/lib/quote/anatomy-catalogue-selection';
export default async function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  let scope:CatalogueSelection|undefined;
  try { scope=JSON.parse(await readFile(path.join(process.cwd(),'artifacts/visual-contract/catalogue-selection.json'),'utf8')).selection; }
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const products=anatomyProductIndex().filter(p=>!scope||scope[p.id]);
  return products.length?<AnatomyPreview products={products} scope={scope}/>:<main><h1>No products selected</h1><a href="/quote/anatomy-preview/catalogue/">Choose products</a></main>;
}
