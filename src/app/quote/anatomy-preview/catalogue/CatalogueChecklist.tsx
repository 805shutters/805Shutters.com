'use client';
import { useEffect, useMemo, useState } from 'react';
import type { AnatomyPreviewProduct } from '@/lib/quote/contract-anatomy-catalog';
import { contractProductFamily } from '@/lib/quote/contract-product-family';
import { catalogueChoiceKey, type CatalogueSelection } from '@/lib/quote/anatomy-catalogue-selection';
import { ContractProductIllustration } from '@/components/quote/ContractProductIllustration';
import styles from './catalogue.module.css';
type Product = Omit<AnatomyPreviewProduct,'groups'>;
const names:Record<string,string>={shutters:'Shutters',roller:'Roller & solar shades',roman:'Roman shades',honeycomb:'Honeycomb shades','vertical-honeycomb':'Vertical honeycomb shades',sheer:'Sheer, zebra & SmartFold shades','faux-wood':'Faux wood blinds',wood:'Wood blinds',mini:'Aluminum & mini blinds',vinyl:'Vinyl blinds',vertical:'Vertical blinds','smart-drapes':'SmartDrape & drapery',woven:'Woven wood shades','fabric-blind':'Fabric blinds',valance:'Separate valances',fabric:'Fabric by the yard',pillow:'Pillow covers',vanes:'Replacement vane packs',shelf:'Palladian shelves',track:'Drapery tracks',tension:'Tension shades',screen:'Retractable screens',awning:'Awnings',parts:'Parts & accessories',custom:'Other products'};
export function CatalogueChecklist({products}:{products:Product[]}) {
  const [selection,setSelection]=useState<CatalogueSelection>({});
  const [loaded,setLoaded]=useState(false),[saving,setSaving]=useState(false),[dirty,setDirty]=useState(false);
  const [status,setStatus]=useState('Loading saved choices…'),[error,setError]=useState('');
  const [search,setSearch]=useState(''),[onlySelected,setOnlySelected]=useState(false);
  const [expanded,setExpanded]=useState<string|null>(null);
  const [cache,setCache]=useState<Record<string,AnatomyPreviewProduct>>({});
  const [optionSearch,setOptionSearch]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/quote/anatomy-preview/selection',{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('Unable to load saved choices.');return r.json();}).then(data=>{setSelection(data.savedAt?data.selection:Object.fromEntries(products.map(p=>[p.id,{scope:'all',choices:[]}])));setLoaded(true);setDirty(!data.savedAt);setStatus(data.savedAt?'Saved choices loaded.':'All products checked. Uncheck anything you do not need.');}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
    return ()=>controller.abort();
  },[]);
  useEffect(()=>{
    if(!expanded || cache[expanded])return;
    const controller=new AbortController();
    fetch('/api/quote/anatomy-preview?product='+encodeURIComponent(expanded),{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('Unable to load options.');return r.json();}).then((p:AnatomyPreviewProduct)=>setCache(c=>({...c,[p.id]:p}))).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
    return ()=>controller.abort();
  },[expanded,cache]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  const groups=useMemo(()=>Object.entries(names).map(([family,name])=>({family,name,products:products.filter(p=>contractProductFamily(p.name)===family)})).filter(g=>g.products.length),[products]);
  const visible=groups.map(g=>({...g,products:g.products.filter(p=>(!onlySelected||!!selection[p.id])&&(!search||[p.name,p.manufacturer,g.name].join(' ').toLowerCase().includes(search.toLowerCase())))})).filter(g=>g.products.length);
  function change(next:CatalogueSelection){setSelection(next);setDirty(true);setStatus('Unsaved changes');setError('');}
  function toggleProduct(id:string,checked:boolean){const next={...selection};if(checked)next[id]={scope:'all',choices:[]};else delete next[id];change(next);}
  function setScope(id:string,scope:'all'|'selected'){change({...selection,[id]:{scope,choices:selection[id]?.choices||[]}});}
  function toggleChoice(id:string,key:string,checked:boolean){
    const current=selection[id]?.choices||[];
    change({...selection,[id]:{scope:'selected',choices:checked?[...new Set([...current,key])]:current.filter(c=>c!==key)}});
  }
  async function save(){
    setSaving(true);setError('');
    try{
      const r=await fetch('/api/quote/anatomy-preview/selection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(selection)});
      if(!r.ok)throw new Error('Choices could not be saved. Please try again.');
      const result=await r.json();setDirty(false);setStatus(`Saved · ${result.selectedCount} ${result.selectedCount===1?'product':'products'} selected`);
    }catch(e){setError(e instanceof Error?e.message:'Unable to save.');}finally{setSaving(false);}
  }
  async function download(){
    const models={...cache};
    try {
      await Promise.all(products.filter(p=>selection[p.id]?.scope==='selected'&&!models[p.id]).map(async p=>{
        const r=await fetch('/api/quote/anatomy-preview?product='+encodeURIComponent(p.id));
        if(!r.ok)throw new Error('Unable to download the full option list.');
        models[p.id]=await r.json();
      }));
    }catch(e){setError(e instanceof Error?e.message:'Unable to download.');return;}
    const text=['805 RENDER CATALOGUE — SELECTED SCOPE','',...products.filter(p=>selection[p.id]).flatMap(p=>{
      const s=selection[p.id],product=models[p.id];
      return [`[x] ${p.manufacturer ? p.manufacturer+' · ' : ''}${p.name}`,s.scope==='all'?'    All listed options':s.choices.length?`    ${s.choices.length} selected option choices`:'    Product sketch only',...(s.scope==='selected'&&product?product.groups.flatMap(g=>g.choices.filter(c=>s.choices.includes(catalogueChoiceKey(g.id,c.id))).map(c=>`    [x] ${g.label}: ${c.label}`)):[])];
    })].join('\n');
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain'})),a=document.createElement('a');a.href=url;a.download='805-render-checklist.txt';a.click();URL.revokeObjectURL(url);
  }
  return <main className={styles.page}>
    <header className={styles.header}><p className={styles.kicker}>805 · RENDER PLANNING</p><h1>Your full product catalogue</h1><p>Uncheck the products you do not need. Each checked product includes its listed options by default. Use <strong>Choose options</strong> if you only want certain options or just the base sketch.</p><p className={styles.note}>Pictures are pencil product references; supplier details and selected options may differ. This catalogue includes supplier entries, dealer-listed items, and general quote types. Checking an item selects artwork to build; it does not confirm availability or place an order.</p></header>
    <div className={styles.toolbar}>
      <div><strong>{Object.keys(selection).length} of {products.length} selected</strong><span role="status">{status}</span></div>
      <label className={styles.search}>Find a product<input type="search" placeholder="Product, supplier or category" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <label className={styles.filter}><input type="checkbox" checked={onlySelected} onChange={e=>setOnlySelected(e.target.checked)}/>Selected only</label>
      <button className={styles.save} type="button" disabled={!loaded||saving||!dirty} onClick={save}>{saving?'Saving…':'Save my choices'}</button>
      <button type="button" disabled={!loaded||saving} onClick={()=>change(Object.fromEntries(products.map(p=>[p.id,{scope:'all',choices:[]}])))}>Check all products</button>
      <button type="button" onClick={download} disabled={!loaded}>Download list</button>
      <button type="button" onClick={()=>window.print()}>Print checklist</button>
    </div>
    {error&&<p className={styles.error} role="alert">{error} <button type="button" onClick={()=>window.location.reload()}>Reload</button></p>}
    <fieldset disabled={!loaded||saving} className={styles.catalogue}>
      <legend className={styles.srOnly}>Products to include in the render build</legend>
      {visible.map(group=><section className={styles.category} key={group.family}>
        <header><h2>{group.name}</h2><span>{group.products.filter(p=>selection[p.id]).length} / {group.products.length} checked</span><button type="button" onClick={()=>{const next={...selection};for(const p of group.products)next[p.id]=next[p.id]||{scope:'all',choices:[]};change(next);}}>Check this category</button></header>
        <div className={styles.productGrid}>{group.products.map(p=><div className={`${styles.product} ${selection[p.id]?styles.selected:''} ${expanded===p.id?styles.expanded:''}`} key={p.id}>
          <div className={styles.cardOverview}>
          <div className={styles.artwork}><ContractProductIllustration productType={p.name} options={p.manufacturer?[`Manufacturer: ${p.manufacturer}`]:[]} size="anatomy" showTemporaryShade={false}/><span>Product reference</span></div>
          <div className={styles.productRow}><label><input type="checkbox" checked={!!selection[p.id]} onChange={e=>toggleProduct(p.id,e.target.checked)}/><span><strong>{p.name}</strong><small>{p.manufacturer||'General quote type'}</small></span></label>
            <span className={styles.scope}>{selection[p.id]?(selection[p.id].scope==='all'?'All listed options':selection[p.id].choices.length?`${selection[p.id].choices.length} option choices`:'Base sketch only'):'Not selected'}</span>
            <button type="button" aria-expanded={expanded===p.id} onClick={()=>{setExpanded(expanded===p.id?null:p.id);setOptionSearch('');}}>{expanded===p.id?'Close options':'Choose options'}</button>
          </div>
          </div>
          {expanded===p.id&&<div className={styles.options}>
            {!cache[p.id]?<p role="status">Loading options…</p>:<>
              <p><strong>{cache[p.id].groups.length} option groups · {cache[p.id].groups.reduce((n,g)=>n+g.choices.length,0).toLocaleString()} choices</strong></p>
              {!selection[p.id]?<p>Check this product above to include it and choose its options.</p>:<>
                <label className={styles.scopeToggle}><input type="checkbox" checked={selection[p.id].scope==='all'} onChange={e=>setScope(p.id,e.target.checked?'all':'selected')}/>Include all listed options</label>
                {selection[p.id].scope==='selected'&&<p>Check only the options you need. Leave all unchecked for the base product sketch only.</p>}
              </>}
              <label>Find an option<input type="search" value={optionSearch} onChange={e=>setOptionSearch(e.target.value)} placeholder="Search option names"/></label>
              {cache[p.id].groups.filter(g=>!optionSearch||g.label.toLowerCase().includes(optionSearch.toLowerCase())||g.choices.some(c=>c.label.toLowerCase().includes(optionSearch.toLowerCase()))).map(g=><details key={g.id} className={styles.optionGroup}>
                <summary>{g.label} <span>{g.choices.length} choices</span></summary>
                <div>{g.choices.filter(c=>!optionSearch||g.label.toLowerCase().includes(optionSearch.toLowerCase())||c.label.toLowerCase().includes(optionSearch.toLowerCase())).map(c=>{
                  const key=catalogueChoiceKey(g.id,c.id);
                  return <label key={c.id}><input type="checkbox" disabled={!selection[p.id]||selection[p.id].scope==='all'} checked={!!selection[p.id]&&(selection[p.id].scope==='all'||selection[p.id].choices.includes(key))} onChange={e=>toggleChoice(p.id,key,e.target.checked)}/>{c.label}</label>;
                })}</div>
              </details>)}
              {!cache[p.id].groups.length&&<p>No option choices are recorded for this catalogue entry.</p>}
            </>}
          </div>}
        </div>)}</div>
      </section>)}
      {!visible.length&&<p>No products match this filter.</p>}
    </fieldset>
    <footer className={styles.footer}>Choices save to this local project when you press “Save my choices.” <a href="/quote/anatomy-preview/">Review selected products & option pictures</a></footer>
  </main>;
}
