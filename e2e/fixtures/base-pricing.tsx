import {QuoteLineItemCard} from '@/components/quote/QuoteLineItemCard';
import {v2CustomerConfigurationOptions} from '@/lib/crm/sales-quote-v2-customer-configuration';
import type {PreparedV2CustomerQuote} from '@/lib/crm/sales-quote-v2-send';
// Local fixture with actual V2 UI and server calculator. No database or delivery provider.
import {useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {DesignCard,buildCatalogSelectionPatch} from '@mts/components/crm/quote-builder/DesignCard';
import {BASE_CONFIGURATIONS} from '@/lib/quote-v2/base-configuration';
import {getProduct} from '@/lib/quote/catalog';
import {quoteLabProductType} from '@/lib/quote-lab/builder';
import {getQuoteDesignDetails} from '@mts/lib/quoteDesignDetails';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
import type {QuoteLabCatalogProduct} from '@/lib/quote-lab/types';
import '../../src/app/globals.css';import '../../src/mts-quote/mts-quote.css';
const catalogs=Object.keys(BASE_CONFIGURATIONS).map(id=>({...getProduct(id)!,productType:quoteLabProductType(id)!})) as unknown as QuoteLabCatalogProduct[];
const initialLine:SalesQuoteLineItem={id:'qa-line',quote_id:'qa-quote',room_name:'Internal QA',product_type:'Roller Shades',width_whole:0,width_fraction:'0',height_whole:0,height_fraction:'0',quantity:1,sort_order:0,created_at:'',selected_design_id:'qa-design'};
function newDesign(id:string){return {id:'qa-design',line_item_id:'qa-line',variant:'A',product_type:quoteLabProductType(id)!,created_at:'',...buildCatalogSelectionPatch({quote_v2_backend:true},catalogs.find(p=>p.id===id)!,id==='norman_shutters'?'woodlore':id==='onyx_shutters'?'poly_composite':undefined)} as SalesQuoteDesign;}
function Preview(){
 const saved=JSON.parse(localStorage.getItem('base-qa')||'null');
 const [line,setLine]=useState<SalesQuoteLineItem>(saved?.line??initialLine),[design,setDesign]=useState<SalesQuoteDesign>(saved?.design??newDesign('roller'));
 const [customerPayload,setCustomerPayload]=useState<PreparedV2CustomerQuote|null>(saved?.customerPayload??null);
 const [status,setStatus]=useState(saved?.status??'Enter dimensions'),[writes,setWrites]=useState(0);
 const latest=useRef({line,design});latest.current={line,design};const seq=useRef(0);
 async function change(l:SalesQuoteLineItem,d:SalesQuoteDesign){const n=++seq.current;latest.current={line:l,design:d};setLine(l);setDesign({...d,unit_price:0});setStatus('Pricing');setWrites(v=>v+1);
 const response=await fetch('/__base-price',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({line:l,design:d})});const r=await response.json();if(n!==seq.current)return;
 setCustomerPayload(r.customerPayload);const ok=r.priceStatus==='authoritative';setStatus(ok?'Priced':r.authoritativePrice?.error??r.error??'Incomplete configuration');
 setDesign({...d,unit_price:ok?Number(r.authoritativeSnapshot.retail.unitPrice):0,quote_v2_price_status:r.priceStatus,quote_v2_selection:r.selection,quote_v2_selection_fingerprint:r.selectionFingerprint,quote_v2_priced_catalog_version:r.catalogVersion,options_json:{...d.options_json,authoritative_price_status:r.priceStatus,authoritative_v2_snapshot:r.authoritativeSnapshot,authoritative_price:r.authoritativePrice}});
 }
 return <main className="mts-quote-scope" style={{padding:16,maxWidth:1300,margin:'auto'}}><h1>805 V2 base pricing · Internal QA</h1><div className="my-4 flex flex-wrap gap-4">
 <label>Product <select aria-label="QA product" value={String(design.options_json.catalog_product_id)} onChange={e=>change({...line,product_type:quoteLabProductType(e.target.value)!},newDesign(e.target.value))}>{catalogs.map(p=><option key={p.id} value={p.id}>{p.id}</option>)}</select></label>
 <label>Width <input aria-label="QA width" type="number" value={line.width_whole} onChange={e=>change({...latest.current.line,width_whole:Number(e.target.value)},latest.current.design)}/></label>
 <label>Height <input aria-label="QA height" type="number" value={line.height_whole} onChange={e=>change({...latest.current.line,height_whole:Number(e.target.value)},latest.current.design)}/></label>
 <button onClick={()=>{localStorage.setItem('base-qa',JSON.stringify({line,design,status,customerPayload}));}}>Save fixture</button>
 </div><DesignCard authoritativeV2 lineItem={line} lineNumber={1} designs={[design]} catalogProducts={catalogs} onSaveLinePrice={async()=>{}} onUpdateDesign={patch=>change(latest.current.line,{...latest.current.design,...patch})} onCopyAll={()=>{}} onCopySome={()=>{}} onStack={()=>{}} copyMode="none" isCopyTarget={false} isSelectedTarget={false} onToggleCopyTarget={()=>{}}/>
 <p data-testid="status">{status}</p><output data-testid="price">{Number(design.unit_price).toFixed(2)}</output><output data-testid="writes">{writes}</output>
 <article aria-label="Customer configuration">{getQuoteDesignDetails(design).map((x,i)=><p key={i}>{x.label}: {x.value}</p>)}</article>
 <section aria-label="Prepared customer document">{customerPayload?.lines.map((item,i)=><QuoteLineItemCard key={item.lineItemId} lineNumber={i+1} room={item.room??'Internal QA'} productType={item.productType??''} quantity={item.quantity} dimensions={`${item.widthInches} × ${item.heightInches}`} options={v2CustomerConfigurationOptions(item.configuration)} price={`$${item.price.total.toFixed(2)}`}/>)}</section>
 <details><summary>Internal test state</summary><pre data-testid="state">{JSON.stringify(design)}</pre></details></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
