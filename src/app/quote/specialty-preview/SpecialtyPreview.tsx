'use client';
import { useState } from 'react';
import { SPECIALTY_SHUTTER_SKETCHES, frenchDoorSketch, pureSunburst, specialtyShutterSketch, type SpecialtySketchCode } from '@/lib/quote/specialty-shutter-illustrations';
import { SpecialtyShutterSketch } from '@/components/quote/SpecialtyShutterSketch';
import { QuoteLineItemCard } from '@/components/quote/QuoteLineItemCard';
import { CustomerContractDocument } from '../[token]/CustomerContractDocument';
import type { PublicQuote, PublicQuoteLine } from '@/lib/crm/public-quote';
import styles from './preview.module.css';
import { shutterIllustrationGeometry } from '@/lib/quote/shutter-illustration-geometry';

export function SpecialtyPreview() {
 const [code,setCode]=useState<SpecialtySketchCode>('YS05'),[tilt,setTilt]=useState('Standard Tilt'),[split,setSplit]=useState(true),[divider,setDivider]=useState(false),[side,setSide]=useState('Right'),[supplier,setSupplier]=useState('Norman'),[layout,setLayout]=useState('LR');
 const choices=(id:SpecialtySketchCode)=>[...(frenchDoorSketch(id)?['Shutter type: French Door',`French-door cutout type: ${SPECIALTY_SHUTTER_SKETCHES.find(([c])=>c===id)![1]}`,`Handle side: ${side}`,'Top shape: Rectangular', 'Panel configuration: L']:[`Specialty shape: ${SPECIALTY_SHUTTER_SKETCHES.find(([c])=>c===id)![1]}`,`Panel configuration: ${layout}`]),`Tilt: ${tilt}`,`Split tilt: ${split?'Yes':'No'}`,`Divider rail: ${divider?'Yes':'No'}`];
 const [contract,setContract]=useState(false);
 const [width,setWidth]=useState(70),[height,setHeight]=useState(45),[leg,setLeg]=useState<number|null>(25);
 const geometry=shutterIllustrationGeometry(width,height,['Louver size: 3 1/2"',...(leg!==null&&leg<height?[`Leg height: ${leg}`]:[])]);
 const lines:PublicQuoteLine[]=[code,'YS21','YS34'].map((c,i)=>({id:`specialty-sample-${i}`,lineItemId:`specialty-sample-${i}`,room:['Living room','Stairway','French door'][i],productName:'Shutters',styleName:'',options:choices(c as SpecialtySketchCode),illustrationGeometry:i===0?geometry:shutterIllustrationGeometry(i===1?36:22,i===1?64:72,['Louver size: 3 1/2"']),designOptions:[],showDesignOptions:false,unitPrice:500,quantity:1,lineTotal:500,discountPercent:0,priceReady:true}));
 const quote:PublicQuote={token:'preview-only',id:'preview-only',quoteNumber:'SPECIALTY ARTWORK REVIEW',customerName:'Sample customer',customerAddress:null,customerPhone:null,customerEmail:null,status:'draft',signed:false,signedAt:null,lines,subtotal:1500,fees:[],discount:0,tax:0,sourceTotalAdjustment:0,depositDue:750,balanceDue:750,total:1500,allPriced:true,hasOnyxShutters:supplier==='Onyx',versions:[],payment:{available:true,dueType:'deposit',amountDue:750,outstanding:1500,depositPaid:0,paidTotal:0},adjustments:{totalOverride:null,balanceDueOverride:null,balanceAdjustmentNote:null,discountPercent:0,discountFlat:0,taxPercent:0,depositPercent:50,fees:[]},business:{name:'805 Shutters',phone:'805-806-9344',website:'https://www.805shutters.com',email:'805@805shutters.com'}};
 if(contract)return <><div className="no-print" style={{padding:20}}><button style={{color:'#343731'}} onClick={()=>setContract(false)}>← Back to the sketch collection</button></div><CustomerContractDocument quote={quote} previewOnly previewLabel="Specialty sketch review · sample data"/></>;
 const current=specialtyShutterSketch('Shutters',choices(code))!;
 return <main className={styles.page}>
  <header className={styles.header}><p className={styles.eyebrow}>805 SHUTTERS · SIGNATURE COLLECTION</p><h1>Specialty shapes, clearly drawn.</h1><p>Original graphite studies for customer contracts. Shared artwork for Norman and Onyx.</p></header>
  <section className={styles.workspace} aria-label="Interactive specialty sketch">
   <div className={styles.controls}>
    <label>Shape<select aria-label="Sketch shape" value={code} onChange={e=>setCode(e.target.value as SpecialtySketchCode)}>{SPECIALTY_SHUTTER_SKETCHES.map(([c,label])=><option key={c} value={c}>{label}</option>)}</select></label>
    <label>Supplier<select aria-label="Sketch supplier" value={supplier} onChange={e=>setSupplier(e.target.value)}><option>Norman</option><option>Onyx</option></select></label>
    <label>Tilt<select aria-label="Sketch tilt" value={tilt} disabled={pureSunburst(code)} onChange={e=>setTilt(e.target.value)}><option>Standard Tilt</option><option>Invisible Tilt</option><option>Offset Tilt</option></select></label>
    <label>Panel layout<select aria-label="Sketch panel layout" value={layout} disabled={frenchDoorSketch(code)||pureSunburst(code)} onChange={e=>setLayout(e.target.value)}>{['L','R','LR','LLRR','LRTLR'].map(l=><option key={l}>{l}</option>)}</select></label>
    <label>Opening width (inches)<input aria-label="Sketch opening width" type="number" min="1" step="0.0625" value={width} onChange={e=>setWidth(Number(e.target.value))}/></label>
    <label>Opening height (inches)<input aria-label="Sketch opening height" type="number" min="1" step="0.0625" value={height} onChange={e=>setHeight(Number(e.target.value))}/></label>
    {['YS05','YS09','YS10','YS51','YS52'].includes(code)&&<label>Straight leg height (inches)<input aria-label="Sketch arch leg height" type="number" min="0" max={height} step="0.0625" value={leg??''} onChange={e=>setLeg(e.target.value===''?null:Number(e.target.value))}/></label>}
    {frenchDoorSketch(code)&&<label>Handle side<select aria-label="Sketch handle side" value={side} onChange={e=>setSide(e.target.value)}><option>Left</option><option>Right</option></select></label>}
    <label className={styles.toggle}><input aria-label="Sketch split tilt" type="checkbox" disabled={pureSunburst(code)} checked={split} onChange={e=>setSplit(e.target.checked)}/>Split tilt</label>
    <label className={styles.toggle}><input aria-label="Sketch divider rail" type="checkbox" disabled={pureSunburst(code)} checked={divider} onChange={e=>setDivider(e.target.checked)}/>Divider rail</label>
    <p className={styles.note}>The main drawing follows the opening measurements. Unmeasured curves, rails and split positions remain references. Catalog cards show each shape type.</p>
   </div>
   <div className={styles.hero}><SpecialtyShutterSketch sketch={current} geometry={geometry}/><p>{current.label}</p><span>{width}″ wide × {height}″ tall</span><span>{pureSunburst(code)?'Radial louvers':`${tilt==='Invisible Tilt'?'Hidden tilt':tilt}${split?' · split tilt':''}${divider?' · divider rail':''}`}</span></div>
  </section>
  <section aria-label="Contract illustration sample" className={styles.sample}><h2>On the contract</h2><button type="button" className={styles.contractButton} onClick={()=>setContract(true)}>View full contract sample</button><QuoteLineItemCard lineNumber={1} room="Living room · sample" productType="Shutters" price="Sample" options={choices(code)} illustrationGeometry={geometry} notice="Development sample · not a customer quote" /></section>
  <section aria-label="Specialty sketch catalog"><div className={styles.catalogHeading}><h2>All 52 shapes & door profiles</h2><p>Select a sketch to inspect its controls.</p></div><div className={styles.grid}>{SPECIALTY_SHUTTER_SKETCHES.map(([c,label])=><button type="button" key={c} className={styles.card} aria-pressed={code===c} onClick={()=>setCode(c)}><SpecialtyShutterSketch sketch={specialtyShutterSketch('Shutters',choices(c))!}/><strong>{label}</strong><span>{c}</span></button>)}</div></section>
 </main>;
}
