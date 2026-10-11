'use client';
import { useState } from 'react';
import { QuoteLineItemCard } from '@/components/quote/QuoteLineItemCard';
import { ContractAnatomy } from '@/components/quote/ContractAnatomy';
import styles from './headers.module.css';
const concepts = [
  {id:'balanced',name:'Clean & balanced',description:'Room on the left. Measurements and price neatly aligned on the right.',tag:'Recommended'},
  {id:'centered',name:'Centered room',description:'Keeps the room centered, with item information and price at the edges.',tag:'Familiar feel'},
  {id:'band',name:'Soft detail band',description:'A slim tinted strip organizes the small details beneath the room and total.',tag:'Clear separation'},
  {id:'compact',name:'One-line header',description:'Room, product, measurements, and total share one compact row.',tag:'Most compact'},
] as const;
type Concept = typeof concepts[number]['id'];
const options=['Valance: No Valance','Fabric: Flow 1% Polar White F1244','Fabric Color: F1244 - Polar White','Control Type: Cordless','Hem Bar: Fabric Covered','Mount Type: Inside Mount','Notes: Example note — keep the window sill clear.'];
function Header({variant,staff,room}:{variant:Concept;staff:boolean;room:string}) {
  const [edit,setEdit]=useState(false);
  return <div className={`${styles.sampleHeader} ${styles[variant]}`} data-header-concept={variant}>
    <div className={styles.item}><span>ITEM 02</span><span>Option A</span></div>
    <div className={styles.identity}><h2>{room}</h2><p>ROLLER SHADES</p></div>
    <div className={styles.measures}><span>Width <b>48″</b></span><span>Quantity <b>1</b></span></div>
    <div className={styles.price}><span>Item total</span><strong>$477.00</strong>{staff&&<button type="button" aria-expanded={edit} onClick={()=>setEdit(!edit)}>Edit price {edit?'−':'+'}</button>}</div>
    {staff&&edit&&<div className={styles.editor}><label>Merchandise price each <input aria-label="Merchandise price each" defaultValue="438.00" inputMode="decimal" /></label><button type="button" onClick={()=>setEdit(false)}>Done</button><span>Layout example only. Shipping and installation remain included in the item total.</span></div>}
  </div>;
}
export function HeaderOptions({phone=false}:{phone?:boolean}){
 const [selected,setSelected]=useState<Concept>('balanced'),[staff,setStaff]=useState(false),[longRoom,setLongRoom]=useState(false);
 const room=longRoom?'Primary Bedroom · Window C':'Office 1';
 if(phone) return <main className={`${styles.page} ${styles.phonePage}`}><div className={styles.phoneToolbar}><a href="/quote/anatomy-preview/headers/">← Header choices</a><span>Phone preview</span></div><QuoteLineItemCard lineNumber={2} optionLabel="A" room="Office 1" productType="Roller Shades" options={options} dimensions={'48" × 60"'} quantity={1} price="$477.00"/></main>;
 return <main className={styles.page}>
  <div className={styles.intro}><a href="/quote/anatomy-preview/">← Product preview</a> · <a href="/quote/anatomy-preview/headers/phone/">Phone preview →</a><p>805 · CONTRACT DESIGN STUDY</p><h1>More product. Less header.</h1><div className={styles.introBottom}><span>Four compact directions. Select one to see it with the product below.</span><div className={styles.toggles}><label><input type="checkbox" checked={staff} onChange={e=>setStaff(e.target.checked)}/> Staff price controls</label><label><input type="checkbox" checked={longRoom} onChange={e=>setLongRoom(e.target.checked)}/> Long room name</label></div></div></div>
  <div className={styles.choices}>{concepts.map((c,i)=><section key={c.id} className={`${styles.choice} ${selected===c.id?styles.selected:''}`}><div className={styles.choiceHeading}><div><span className={styles.index}>{String(i+1).padStart(2,'0')}</span><h2>{c.name}</h2><span className={styles.tag}>{c.tag}</span></div><button type="button" aria-pressed={selected===c.id} onClick={()=>setSelected(c.id)}>{selected===c.id?'Selected':'Preview this'}</button></div><Header variant={c.id} staff={staff} room={room}/><p className={styles.caption}>{c.description}</p></section>)}</div>
  <section className={styles.fullPreview} aria-label="Selected design in context"><div className={styles.contextTitle}><h2>{concepts.find(c=>c.id===selected)?.name}</h2><span>Shown with your existing product layout</span></div><div className={styles.contract}><Header key={selected} variant={selected} staff={staff} room={room}/><div className={styles.body}><ContractAnatomy productType="Roller Shades" room={room} options={options} width={48} quantity={1} layout="grouped" lineRouting="direct"/></div></div></section>
 </main>;
}
