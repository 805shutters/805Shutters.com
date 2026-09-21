'use client';
import{SUNDANCE_VERTICAL_COMPONENT_KEY as KEY,readSundanceVerticalComponent,sundanceVerticalComponentEvidence,sundanceVerticalStackReference,type SundanceVerticalComponent}from'@/lib/quote/sundance/vertical-components';
export function SundanceVerticalComponents({options:c,widthInches,onChange}:{options:Record<string,unknown>;widthInches:number;onChange:(options:Record<string,unknown>)=>void}){
 const kind=c.sundance_vertical_fulfillment,r=readSundanceVerticalComponent(c[KEY]),stack=sundanceVerticalStackReference(widthInches),classes='w-full rounded border p-2',e=sundanceVerticalComponentEvidence(c);
 const active=kind==='Track only'||kind==='Vanes only';const base:SundanceVerticalComponent=r??{version:1,kind:kind==='Track only'?'Track only':'Vanes only',fabricId:String(c.fabric_color_id??''),sizeBasis:'',lengthInches:null,quantity:null};
 const patch=(fields:Partial<SundanceVerticalComponent>)=>onChange({...c,[KEY]:{...base,...fields}});
 return <>
 <p className="text-sm">{stack?`Published reference at ${stack.width}-inch blind width: ${stack.vanes} vanes; approximately ${stack.approximateStack}-inch stack (PDF11). This is a planning reference, not a confirmed component order.`:'The source vane-count/approximate-stack table has no exact row for this width; confirm the actual vane count and stack. No interpolation is assumed.'}</p>
 {active&&<section aria-label="Vertical component measurements" className="space-y-2 rounded border p-3"><p>Component-only measurements are separate from the opening. Quantities below are per line unit. The complete-blind grid is not a component price.</p>
 <label>{kind==='Track only'?'Track length':'Vane length'} (inches)<input aria-label="Sundance vertical component length" type="number" min="0" step="0.0625" className={classes} value={base.lengthInches??''} onChange={ev=>patch({lengthInches:ev.target.value===''?null:Number(ev.target.value)})}/></label>
 <label>Component quantity<input aria-label="Sundance vertical component quantity" type="number" min="1" step="1" className={classes} value={base.quantity??''} onChange={ev=>patch({quantity:ev.target.value===''?null:Number(ev.target.value)})}/></label>
 <label>Size instructions<select aria-label="Sundance vertical component size basis" className={classes} value={base.sizeBasis} onChange={ev=>patch({sizeBasis:ev.target.value as SundanceVerticalComponent['sizeBasis']})}><option value="">Select</option><option>Net component size</option><option>Opening size — factory deduction required</option></select></label>
 {base.fabricId!==c.fabric_color_id&&kind==='Vanes only'&&<button type="button" onClick={()=>patch({fabricId:String(c.fabric_color_id??'')})}>Reconfirm vane measurements for selected material</button>}
 {e.sourceAmount!==null&&<p>Published component source amount: ${e.sourceAmount.toFixed(2)} {e.sourceBasis==='net'?'net':'(vane-column retail/net basis requires confirmation)'} (PDF{e.page}{e.gridHeight?`, ${e.gridHeight}-inch height row`:''}). Not a customer price.</p>}
 {e.issues.map((text,i)=><p role="alert" key={i}>{text}</p>)}
 </section>}
 </>;
}
