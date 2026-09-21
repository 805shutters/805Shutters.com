"use client";
import { emptyNormanBifold180Construction, normanBifold180Geometry, normanBifold180BaseboardAdvice, type NormanBifold180Construction } from '@/lib/quote/norman-shutter-bifold180-construction';
export function NormanBifold180ConstructionOptions({value,aqua,onChange}:{value:NormanBifold180Construction|undefined;aqua:boolean;onChange:(value:NormanBifold180Construction)=>void}){
 const r=value??emptyNormanBifold180Construction();
 const update=(patch:Partial<NormanBifold180Construction>)=>onChange({...r,...patch});
 const cls='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
 const geometry=normanBifold180Geometry(r),advice=normanBifold180BaseboardAdvice(r);
 const number=(key:'referenceWidthInches'|'referenceHeightInches'|'headerExtensionInches'|'baseboardThicknessInches'|'headerBuildoutInches'|'lightBlockExtensionInches',label:string)=><label className="block text-sm" key={key}>{label}<input aria-label={`Norman Bi-fold 180 ${label}`} className={cls} type="number" step="0.0625" min="0" value={r[key]??''} onChange={e=>update({[key]:e.target.value===''?null:Number(e.target.value)})}/></label>;
 return <section className="space-y-3 rounded border border-slate-200 p-3" aria-label="Bi-fold 180 header and casing construction">
  <label className="block text-sm">Casing measurement basis<select aria-label="Norman Bi-fold 180 casing" className={cls} value={r.casing} onChange={e=>update({casing:e.target.value as NormanBifold180Construction['casing'],referenceWidthInches:null,referenceHeightInches:null})}><option value="">Select</option><option value="none">No casing · measured window opening</option><option value="existing">Existing casing · outside casing width and measured max-frame height</option></select></label>
  {!!r.casing&&<div className="grid grid-cols-2 gap-3">{number('referenceWidthInches',r.casing==='none'?'Window width (inches)':'Outside casing width (inches)')}{number('referenceHeightInches',r.casing==='none'?'Window height (inches)':'Measured max-frame height (inches)')}</div>}
  {geometry&&<p className="text-sm">Source max-frame dimensions: {geometry.widthInches} × {geometry.heightInches} inches. {r.casing==='existing'?'Width adds 1¼ inches; height is your direct measurement.':'Width adds 3½ inches; height adds 4½ inches.'} Pricing remains held for complete track verification.</p>}
  <label className="block text-sm">Header size<select aria-label="Norman Bi-fold 180 header size" className={cls} value={r.headerInches??''} onChange={e=>update({headerInches:e.target.value===''?null:Number(e.target.value) as 3|3.5})}><option value="">Select</option><option value="3">3 inches</option><option value="3.5">3½ inches</option></select></label>
  <label className="block text-sm">Fascia<select aria-label="Norman Bi-fold 180 fascia" className={cls} value={r.fascia} onChange={e=>update({fascia:e.target.value as NormanBifold180Construction['fascia']})}><option value="">Select</option><option value="plain">Plain / flat</option>{!aqua&&<option value="deco">Deco</option>}</select></label>
  {number('headerExtensionInches','Header extension (inches; 0 for none)')}
  <p className="text-sm">Header extension is optional, up to 2 inches, and supplied pre-attached.</p>
  {number('baseboardThicknessInches','Baseboard thickness (inches; 0 for none)')}
  {number('headerBuildoutInches','Header buildout (inches; 0 for none)')}
  {advice&&<p className="text-sm text-slate-600">{advice}</p>}
  <label className="block text-sm">Bottom pivot L bracket required<select aria-label="Norman Bi-fold 180 bottom pivot L bracket" className={cls} value={r.bottomPivotLBracket===null?'':String(r.bottomPivotLBracket)} onChange={e=>update({bottomPivotLBracket:e.target.value===''?null:e.target.value==='true'})}><option value="">Select</option><option value="false">No</option><option value="true">Yes</option></select></label>
  {r.bottomPivotLBracket===true&&number('lightBlockExtensionInches','L-shape light-block extension width (inches)')}
  <p className="text-sm">A required bottom pivot L bracket uses a 1¾-inch-wide L-shape light-block extension. Save these inputs with Save panel construction.</p>
 </section>;
}
