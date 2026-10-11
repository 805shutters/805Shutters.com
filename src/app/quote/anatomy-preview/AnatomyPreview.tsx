'use client';
import { useEffect, useMemo, useState } from 'react';
import { ContractAnatomy, type AnatomyLayout, type AnatomySummaryStyle } from '@/components/quote/ContractAnatomy';
import type { AnatomyPreviewProduct } from '@/lib/quote/contract-anatomy-catalog';
import { contractAnatomy } from '@/lib/quote/contract-anatomy';
import { anatomyExampleSelections } from '@/lib/quote/anatomy-examples';
import { ContractProductIllustration } from '@/components/quote/ContractProductIllustration';
import { optionRenderStudy, productRenderCoverage, renderOptionsFromSelection, renderStudyKey, scopedRenderProduct, type RenderStudyCoverage } from '@/lib/quote/anatomy-render-studies';
import type { CatalogueSelection } from '@/lib/quote/anatomy-catalogue-selection';
import { shutterIllustrationGeometry } from '@/lib/quote/shutter-illustration-geometry';
import { fabricPerformanceLabels } from '@/lib/quote/fabric-performance-labels';
import styles from './preview.module.css';
import type { AnatomyLineRouting } from '@/lib/quote/anatomy-leader-path';
type ProductSummary = Omit<AnatomyPreviewProduct,'groups'>;
const coverageLabels:Record<RenderStudyCoverage,string>={drawing:'Drawing available','named-detail':'Named finish / fabric','needs-artwork':'Drawing needed'};
export function AnatomyPreview({ products, scope }: { products:ProductSummary[]; scope?:CatalogueSelection }) {
  const [id,setId] = useState(products.find(p => p.id === 'roller')?.id || products[0].id);
  const [product,setProduct] = useState<AnatomyPreviewProduct | null>(null);
  const [selected,setSelected] = useState<Record<string,string>>({});
  const [room,setRoom] = useState('Living Room'),[width,setWidth] = useState(70),[height,setHeight] = useState(45);
  const [groupId,setGroupId] = useState(''),[search,setSearch] = useState(''),[error,setError] = useState('');
  const [coverageFilter,setCoverageFilter]=useState('all'),[page,setPage]=useState(0);
  const [layout,setLayout]=useState<AnatomyLayout>('grouped');
  const [lineRouting,setLineRouting]=useState<AnatomyLineRouting>('direct');
  const [summaryStyle,setSummaryStyle]=useState<AnatomySummaryStyle>('recap');
  useEffect(() => {
    const controller = new AbortController();setProduct(null);setSelected({});setGroupId('');setError('');setSearch('');
    fetch(`/api/quote/anatomy-preview?product=${encodeURIComponent(id)}`,{signal:controller.signal}).then(r => {if(!r.ok)throw new Error('Unable to load product choices.');return r.json();}).then((p:AnatomyPreviewProduct) => {const chosen=scopedRenderProduct(p,scope?.[id]);setProduct(chosen);setSelected(anatomyExampleSelections(chosen));setGroupId(chosen.groups.find(g=>/^(lift system|lift \/ control|tilt|tilt type)$/i.test(g.label))?.id || chosen.groups[0]?.id || '');setPage(0);}).catch(e => {if(e.name !== 'AbortError')setError(e.message);});
    return () => controller.abort();
  },[id]);
  const options = useMemo(() => product?renderOptionsFromSelection(product,selected):[],[product,selected]);
  const group = product?.groups.find(g => g.id === groupId);
  const studies=useMemo(()=>product&&group?group.choices.map(choice=>({choice,study:optionRenderStudy(product,group,choice)})):[],[product,group]);
  const choices = studies.filter(({choice,study})=>choice.label.toLowerCase().includes(search.toLowerCase())&&(coverageFilter==='all'||coverageFilter===study.coverage));
  const counts=useMemo(()=>product?productRenderCoverage(product):null,[product]);
  const unresolvedSelections=useMemo(()=>product?product.groups.flatMap(g=>{
    const choice=g.choices.find(c=>c.id===selected[g.id]);
    return choice&&optionRenderStudy(product,g,choice).coverage==='needs-artwork'?[`${g.label}: ${choice.label}`]:[];
  }):[],[product,selected]);
  const model = product ? contractAnatomy(product.name,options) : null;
  function choose(group:string,value:string){setSelected(current => {
    const next={...current};
    const keys=product?.groups.find(g => g.id === group)?.choices.find(c => c.id === value)?.options.map(renderStudyKey) ?? [];
    for (const g of product?.groups ?? []) if(g.id !== group && g.choices.find(c => c.id === next[g.id])?.options.some(o => keys.includes(renderStudyKey(o)))) delete next[g.id];
    return {...next,[group]:value};
  });}
  return <main className={styles.page}>
    <header className={styles.heading}><p>805 · YOUR SELECTED RENDER COLLECTION</p><h1>Your products, option by option.</h1><p>{products.length} selected products. Compare each option below, then combine selections in the contract preview. “Drawing needed” marks an unfinished visual; a generic reference does not count as a finished option render.</p><a href="/quote/anatomy-preview/contracts/">View all customer contract layouts</a> · <a href="/quote/anatomy-preview/catalogue/">Edit your product checklist</a> · <a href="/api/quote/anatomy-preview/coverage" download>Download full coverage report</a></header>
    <details className={styles.gallery}><summary>Browse all {products.length} product renders</summary><div>{products.map(p => <button type="button" key={p.id} aria-pressed={p.id===id} onClick={()=>setId(p.id)}><ContractProductIllustration productType={p.name} options={[`Manufacturer: ${p.manufacturer}`]} size="anatomy" showTemporaryShade={false}/><strong>{p.name}</strong><span>{p.manufacturer} · product reference</span></button>)}</div></details>
    <div className={styles.workspace}>
      <aside className={styles.controls} aria-label="Preview selections">
        <label>Product<select value={id} onChange={e => setId(e.target.value)}>{products.map(p => <option key={p.id} value={p.id}>{p.manufacturer ? `${p.manufacturer} · ` : ''}{p.name}</option>)}</select></label>
        <label>Room name<input value={room} onChange={e => setRoom(e.target.value)} /></label>
        <div className={styles.dimensions}><label>Width (inches)<input type="number" min="1" max="500" step=".125" value={width} onChange={e => setWidth(Number(e.target.value))}/></label><label>Height (inches)<input type="number" min="1" max="500" step=".125" value={height} onChange={e => setHeight(Number(e.target.value))}/></label></div>
        {product && <><p className={styles.counts}>{products.length} products · {product.groups.length} option groups · {product.groups.reduce((n,g) => n+g.choices.length,0).toLocaleString()} choices for this product. Example selections only.</p><button type="button" onClick={() => setSelected({})}>Clear selections</button><p><a href="#option-pictures">Jump to option pictures ↓</a></p><h2>Example configuration</h2>
          {product.groups.map(g => <details className={styles.group} key={g.id} open={!!selected[g.id]}><summary>{g.label}{selected[g.id] ? ' · selected' : ''}</summary><label>{g.label}<select aria-label={`${g.label} — ${g.source}`} value={selected[g.id] || ''} onChange={e => choose(g.id,e.target.value)}><option value="">Not selected</option>{g.choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label><p className={styles.source}>{g.source}</p></details>)}
        </>}
      </aside>
      <section aria-label="Contract render">
        {error ? <p role="alert" className={styles.error}>{error}</p> : !product ? <p role="status">Loading product options…</p> : <>
          <div className={styles.layoutChoices} aria-label="Contract layout choices">{([{id:'grouped',name:'Grouped callouts'},{id:'classic',name:'Original callouts'},{id:'compact',name:'Compact row'},{id:'centered',name:'Centered room'},{id:'bordered',name:'Bordered details'}] as const).map(choice=><button type="button" key={choice.id} aria-pressed={layout===choice.id} onClick={()=>setLayout(choice.id)}>{choice.name}</button>)}</div>
          <div className={styles.layoutChoices} aria-label="Pointer line choices">{([{id:'around',name:'Around product'},{id:'direct',name:'Direct to part'}] as const).map(choice=><button type="button" key={choice.id} aria-pressed={lineRouting===choice.id} onClick={()=>setLineRouting(choice.id)}>{choice.name}</button>)}</div>
          {layout!=='grouped'&&<div className={styles.layoutChoices} aria-label="Selection summary choices">{([{id:'recap',name:'Simple recap'},{id:'current',name:'Current layout'},{id:'numbered',name:'Numbered rows'},{id:'cards',name:'Numbered cards'},{id:'strip',name:'Specification strip'},{id:'grid',name:'Bordered grid'},{id:'legend',name:'Side legend'}] as const).map(choice=><button type="button" key={choice.id} aria-pressed={summaryStyle===choice.id} onClick={()=>setSummaryStyle(choice.id)}>{choice.name}</button>)}</div>}
          <ContractAnatomy productType={product.name} room={room} options={options} width={width} height={height} layout={layout} lineRouting={lineRouting} summaryStyle={summaryStyle}/>
          {!!unresolvedSelections.length&&<aside className={styles.review} aria-label="Unfinished selected drawings"><strong>{unresolvedSelections.length} selected details still need artwork</strong><p className={styles.source}>The picture above is a partial configuration. These details are recorded, but their exact appearance is not represented yet:</p><ul>{unresolvedSelections.map(value=><li key={value}>{value}</li>)}</ul></aside>}
          <div id="option-pictures" className={styles.review}><h2>Pictures for every option</h2>
            {counts&&<div className={styles.coverageTotals}>{Object.entries(counts).map(([key,n])=><span key={key}><strong>{n.toLocaleString()}</strong>{coverageLabels[key as RenderStudyCoverage]}</span>)}</div>}
            <p className={styles.source}>Each card isolates one selection using sample settings. Choose a card to apply it to the configuration above. Options from quote-builder reference lists still require product-specific supplier checks.</p>
            <label>Option group <select aria-label="Option study group" value={groupId} onChange={e => {setGroupId(e.target.value);setSearch('');setPage(0);}}>{product.groups.map(g => <option key={g.id} value={g.id}>{g.label} · {g.choices.length}</option>)}</select></label>
            <label>Show <select aria-label="Artwork coverage filter" value={coverageFilter} onChange={e=>{setCoverageFilter(e.target.value);setPage(0);}}><option value="all">All options</option>{Object.entries(coverageLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <label>Find an option <input type="search" value={search} onChange={e => {setSearch(e.target.value);setPage(0);}} /></label>
            <div className={styles.optionCards}>{choices.slice(page*12,(page+1)*12).map(({choice:c,study}) => <button type="button" key={c.id} aria-pressed={selected[groupId] === c.id} onClick={() => choose(groupId,c.id)}>
              <div className={styles.optionArt}><ContractProductIllustration productType={product.name} options={study.options} showTemporaryShade={false} size="anatomy" illustrationGeometry={shutterIllustrationGeometry(width,height,study.options)}/></div>
              {fabricPerformanceLabels(study.options).map(label=><strong className={styles.fabricPerformance} key={label}>{label}</strong>)}
              <span className={study.coverage==='needs-artwork'?styles.missing:styles.badge}>{coverageLabels[study.coverage]}</span><strong>{c.label}</strong><span>{study.note}</span><small>{study.source}</small>
            </button>)}</div>
            {!choices.length&&<p>No options match this filter.</p>}
            {choices.length>12&&<nav className={styles.pagination} aria-label="Option pictures"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><span>{page*12+1}–{Math.min((page+1)*12,choices.length)} of {choices.length}</span><button disabled={(page+1)*12>=choices.length} onClick={()=>setPage(p=>p+1)}>Next</button></nav>}
          </div>
          <details className={styles.review}><summary>Artwork coverage for this configuration</summary><p>{model?.coverageNote}</p><p>All saved customer-facing selections remain in the specification list, including options that cannot be pictured. Colors are identified by their saved names. A pencil illustration does not simulate an exact fabric color or texture.</p><p>Dimension-based geometry is currently supported for shutter assemblies and specialty shutters. Other existing pencil artwork retains its original proportions.</p></details>
        </>}
      </section>
    </div>
  </main>;
}
