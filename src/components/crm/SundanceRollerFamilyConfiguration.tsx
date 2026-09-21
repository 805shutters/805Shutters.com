'use client';
import {SundanceEuropanelLayout} from './SundanceEuropanelLayout';
import {SundancePrivacyPieces} from './SundancePrivacyPieces';
import type {SalesQuoteDesign} from '@mts/types/quote';
import type {SelectionRecord} from '@/lib/quote-v2/core';
import {sundanceShadeKind,sundanceShadeControls,sundanceShadeTopOptions,sundanceRollerChains,sundanceRollerFinishes,validateSundanceShadeConfiguration,sundanceShadeOptionEvidence,sundanceShadeConfigurationPatch,sundanceShadeAccessories,sundanceShadeAccessoryKey} from '@/lib/quote/sundance/shade-configuration';
export function SundanceRollerFamilyConfiguration({productId:p,options:c,widthInches=0,heightInches=0,onUpdateFields}:{productId:string;options:Record<string,unknown>;widthInches?:number;heightInches?:number;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}){
 const kind=sundanceShadeKind(p),program=String(c.catalog_program_id??''),control=sundanceShadeControls(p).find(r=>r.name===c.sundance_shade_control),classes='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
 const field=(key:string,value:string)=>onUpdateFields({...(key==='mount_type'?{mount_type:value}:{}),options_json:{...c,[key]:value||null,...(key==='sundance_shade_privacy'?{sundance_privacy_pieces_v1:null}: {})}});
 const select=(key:string,label:string,values:string[])=><label className="block text-sm">{label}<select aria-label={`Sundance shade ${label}`} className={classes} value={String(c[key]??'')} onChange={e=>field(key,e.target.value)}><option value="">Select</option>{values.map(v=><option key={v}>{v}</option>)}</select></label>;
 const issues=validateSundanceShadeConfiguration({productId:p,programId:program,widthInches,heightInches,configuration:c as SelectionRecord}),evidence=sundanceShadeOptionEvidence(p,program,c,widthInches);
 return <>
 <label className="block text-sm">Operating system<select aria-label="Sundance shade operating system" className={classes} value={String(c.sundance_shade_control??'')} onChange={e=>onUpdateFields({options_json:sundanceShadeConfigurationPatch(c,e.target.value)})}><option value="">Select system</option>{sundanceShadeControls(p).map(r=><option key={r.name}>{r.name}</option>)}</select></label>
 {control&&<p className="text-sm">Published control capability: {control.minWidth>0?`${control.minWidth}–${control.maxWidth}`:`up to ${control.maxWidth}`} inches wide, up to {control.maxHeight} inches high. Exact fabric and product grid limits also apply; missing minimums require confirmation.</p>}
 {select('mount_type','Mount',kind==='europanel'?['Outside']:['Inside','Outside'])}
 {kind==='europanel'?<>{select('sundance_shade_wand','Wand side',['Left','Right'])}{select('sundance_shade_stack','One-way stack',['Left','Right'])}{select('sundance_shade_panel_count','Panel count',['2','3','4','5'])}{select('sundance_shade_channels','Headrail channels',['4','5'])}{select('sundance_shade_top','Valance',['None','Rounded Corner Valance'])}<p className="text-sm">Soft White headrail, ⅝ × 2¾ inches; mounting bracket 2⅞ × 4½. Rounded valance includes dust cover, 3¾ inches high × 3¼ deep. Each panel’s fabric width and overlap still require a complete panel layout.</p></>:<>
 {control?.power==='manual'&&control.name!=='Cordless'&&<>{select('sundance_shade_chain','Chain',sundanceRollerChains)}{select('sundance_shade_control_side','Control side',['Left','Right'])}</>}
 {select('sundance_shade_railroad','Railroad fabric',['No','Yes'])}
 </>}
 {kind==='europanel'&&<SundanceEuropanelLayout productId={p} options={c} widthInches={widthInches} heightInches={heightInches} onChange={options=>onUpdateFields({options_json:options})}/>}
 {select('sundance_shade_assembly','Assembly',kind==='roller'?['Single','Two on one','Dual independent','Coupled motorized']:kind==='roman'?['Single','Two on one']:['Single'])}
 {kind==='roller'&&<>
 {select('sundance_shade_roll','Roll',['Standard','Reverse'])}
 {select('sundance_shade_top','Top treatment',['Open roll',...sundanceShadeTopOptions(p,program).map(r=>r.name)])}
 {c.sundance_shade_top!=='Open roll'&&select('sundance_shade_finish','Top finish',c.sundance_shade_top==='Contractor’s Box 5"'?['White','Silver']:sundanceRollerFinishes)}
 {['Small Round Cassette','Large Round Cassette'].includes(String(c.sundance_shade_top))&&select('sundance_shade_fabric_insert','Cassette fabric insert',['No','Yes'])}
 {select('sundance_shade_bottomrail','Bottomrail',['Standard Hem Pocket','Exposed','Wrap-around','Enhanced Fabric-Wrapped'])}
 {c.sundance_shade_bottomrail==='Exposed'&&select('sundance_shade_bottomrail_color','Bottomrail finish',sundanceRollerFinishes)}
 {select('sundance_shade_hold_down','Hold-down brackets',['No','Yes'])}
 {select('sundance_shade_privacy','Privacy accessory',['None','Aluminum side channels','Solar bar'])}
 {c.sundance_shade_privacy==='Aluminum side channels'&&select('sundance_shade_privacy_color','Privacy accessory color',['White','Silver','Black'])}
 {c.sundance_shade_privacy==='Solar bar'&&select('sundance_shade_privacy_color','Privacy accessory color',['White','Ivory','Gray','Bronze','Black'])}
 <SundancePrivacyPieces options={c} onChange={options=>onUpdateFields({options_json:options})}/>
 {c.sundance_shade_assembly==='Dual independent'&&select('sundance_shade_dual_bracket','Dual bracket',['Vertical','Small 45-degree','Large 45-degree','5-inch fascia dual'])}
 {control?.power!=='manual'&&select('sundance_shade_tube','Tube',['Standard','2½-inch','3¼-inch'])}
 </>}
 {kind==='roman'&&<p className="text-sm">⅝ × 2-inch fabric-wrapped board; included 6-inch valance and returns; knife pleats at 6¼-inch seams; heat-sealed bottom bar. Lining unavailable. Inside factory deduction:⅜ inch. Two-on-one gap:½–⅝ inch. Cordless blackout max84×84; light-filtering max96×96. Current dealer orderability requires confirmation.</p>}
 {control?.power==='simphony24'&&<>{select('sundance_simphony_panel_id','Shared Simphony 24V panel',Array.from({length:50},(_,i)=>`Panel ${i+1}`))}<p className="text-sm">Each panel powers up to 18 motors and has one $800 net source charge for the order. Selected line quantities and independent component motors count toward capacity. Clear this choice for an individual transformer. Whole-order connection/capacity and charge ownership are derived by the server.</p></>}
 {kind!=='europanel'&&control?.power!=='manual'&&<details className="text-sm"><summary className="cursor-pointer">Motor accessories allocated to this line</summary>{sundanceShadeAccessories(p).filter(a=>a.power.includes(control?.power??'')).map(a=><label key={a.key} className="block text-sm">{a.label}<input type="number" min="0" step="1" aria-label={`Sundance shade ${a.label} quantity`} className={classes} value={String(c[sundanceShadeAccessoryKey(a.key)]??'')} onChange={e=>field(sundanceShadeAccessoryKey(a.key),e.target.value)}/></label>)}<p>Allocate shared accessories once. Shared power boxes require connected-shade records and capacity validation.</p></details>}
 <details className="text-sm"><summary className="cursor-pointer">Published shade option evidence</summary>{evidence.entries.map((e,i)=><p key={i}>{e.label}: ${e.amount.toFixed(2)} {e.basis==='unverified'?'basis unverified':`source ${e.basis}`} (PDF {e.page})</p>)}<p>Net option evidence: ${evidence.netSubtotal.toFixed(2)}. Retail top-treatment evidence: ${evidence.retailSubtotal.toFixed(2)}. These are separate from base shade and customer prices.</p>{evidence.unresolved.map(r=><p key={r}>{r}</p>)}</details>
 {issues.length>0&&<div role="alert" className="text-sm text-amber-900">{issues.map(r=><p key={r.ruleId}>{r.explanation}</p>)}</div>}
 </>;
}
