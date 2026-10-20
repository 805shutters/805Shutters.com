'use client';
import { useState } from 'react';
import { QuoteLineItemCard } from '@/components/quote/QuoteLineItemCard';
import { anatomyAttachmentExamples } from '@/lib/quote/fixtures/anatomy-attachment-examples';
export function AttachmentReview() {
  const [index,setIndex] = useState(0);
  const [width,setWidth] = useState(36);
  const example = anatomyAttachmentExamples[index];
  return <main style={{padding:16,background:'#fff',color:'#252821'}}>
    <div className="no-print" style={{marginBottom:24,display:'flex',gap:20,flexWrap:'wrap'}}>
      <label>Attachment example <select value={index} onChange={e=>setIndex(Number(e.target.value))}>{anatomyAttachmentExamples.map((example,i)=><option key={example.id} value={i}>{example.label}</option>)}</select></label>
      <label>Opening width <input type="number" min={12} max={150} value={width} onChange={e=>setWidth(Number(e.target.value))}/></label>
    </div>
    <QuoteLineItemCard lineNumber={1} room="Living Room" productType={example.product} options={[...example.options]} dimensions={`${width}" × 60"`} quantity={1} price="$123.45" />
  </main>;
}
