import { notFound } from 'next/navigation';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { QuoteLineItemCard } from '@/components/quote/QuoteLineItemCard';
import { anatomyProductIndex, anatomyPreviewProduct } from '@/lib/quote/contract-anatomy-catalog';
import { anatomyExampleSelections } from '@/lib/quote/anatomy-examples';
import type { CatalogueSelection } from '@/lib/quote/anatomy-catalogue-selection';

export default async function ContractCollection({searchParams}: {searchParams:Promise<{page?:string}>}) {
  if(process.env.NODE_ENV!=='development') notFound();
  const scope:CatalogueSelection=JSON.parse(await readFile(path.join(process.cwd(),'artifacts/visual-contract/catalogue-selection.json'),'utf8')).selection;
  const products=anatomyProductIndex().filter(p=>scope[p.id]);
  const pages=Math.ceil(products.length/6);
  const query=await searchParams;
  const page=Math.min(pages,Math.max(1,Number(query.page)||1));
  return <main style={{background:'#f5f5f0',padding:'24px 12px',minHeight:'100vh',color:'#252821'}}>
    <header style={{maxWidth:1100,margin:'0 auto 24px'}}>
      <a href="/quote/anatomy-preview/">Back to product configurator</a>
      <h1>Customer contract collection</h1>
      <p><a href="/quote/anatomy-preview/contracts/document/">View a complete sample customer contract</a></p>
      <p>All {products.length} selected products use the approved labels. These are catalogue examples; customer contracts use the saved order selections and prices.</p>
      <nav aria-label="Contract collection pages" style={{display:'flex',flexWrap:'wrap',gap:12}}>{Array.from({length:pages},(_,i)=><a key={i} href={`?page=${i+1}`} aria-current={page===i+1?'page':undefined}>Page {i+1}</a>)}</nav>
    </header>
    <div style={{display:'grid',gap:24,maxWidth:1100,margin:'auto'}}>{products.slice((page-1)*6,page*6).map((summary,i)=>{
      const p=anatomyPreviewProduct(summary.id)!;
      const selected=anatomyExampleSelections(p);
      const options=[`Manufacturer: ${p.manufacturer}`,...p.groups.flatMap(g=>g.choices.find(c=>c.id===selected[g.id])?.options||[])];
      return <section key={p.id} aria-label={p.name}><p>{p.name}</p><QuoteLineItemCard lineNumber={(page-1)*6+i+1} room="Example room" productType={p.name} options={options} dimensions={'70" × 45"'} price="Example" priceLabel="Catalogue illustration" quantity={1}/></section>;
    })}</div>
  </main>;
}
