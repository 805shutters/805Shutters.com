'use client';
import {SUNDANCE_PRIVACY_PIECES_KEY,readSundancePrivacyPieces,sundancePrivacyPieceEvidence,type SundancePrivacyPieces as PieceRecord} from '@/lib/quote/sundance/privacy-pieces';
export function SundancePrivacyPieces({options,onChange}:{options:Record<string,unknown>;onChange:(options:Record<string,unknown>)=>void}){
 const selected=options.sundance_shade_privacy,record=readSundancePrivacyPieces(options[SUNDANCE_PRIVACY_PIECES_KEY]),evidence=sundancePrivacyPieceEvidence(options);
 if(!['Aluminum side channels','Solar bar'].includes(String(selected)))return null;
 const active=record&&record.kind===selected?record:{version:1 as const,kind:selected as PieceRecord['kind'],pieces:[]};
 const save=(next:PieceRecord)=>onChange({...options,[SUNDANCE_PRIVACY_PIECES_KEY]:next});
 return <fieldset className="space-y-2 rounded border p-3"><legend>Privacy accessory measurements</legend>
 <p className="text-sm">Enter each ordered piece; lengths are independent of the shade opening. Source rate: ${evidence.rate} net per foot. Factory deductions and fractional-foot billing are not inferred.</p>
 {active.pieces.map((piece,index)=><div key={piece.id} className="flex flex-wrap gap-2"><label>Piece {index+1} length (inches)<input className="w-full rounded border p-2" aria-label={`Sundance privacy piece ${index+1} length`} type="number" min="0" step="0.0625" value={piece.lengthInches??''} onChange={e=>save({...active,pieces:active.pieces.map(p=>p.id===piece.id?{...p,lengthInches:e.target.value===''?null:Number(e.target.value)}:p)})}/></label><label>Quantity<input className="w-full rounded border p-2" aria-label={`Sundance privacy piece ${index+1} quantity`} type="number" min="1" step="1" value={piece.quantity} onChange={e=>save({...active,pieces:active.pieces.map(p=>p.id===piece.id?{...p,quantity:Number(e.target.value)}:p)})}/></label><button type="button" onClick={()=>save({...active,pieces:active.pieces.filter(p=>p.id!==piece.id)})}>Remove privacy piece {index+1}</button></div>)}
 <button type="button" onClick={()=>save({...active,pieces:[...active.pieces,{id:crypto.randomUUID(),lengthInches:null,quantity:1}]})}>Add measured privacy piece</button>
 {evidence.feet!=null&&<p className="text-sm">Measured total: {Number(evidence.feet.toFixed(6))} feet. {evidence.sourceNet==null?'Billed amount requires confirmation.':`Published linear source charge: $${evidence.sourceNet.toFixed(2)} net; not a customer price.`}</p>}
 {evidence.issues.map(message=><p key={message} className="text-sm text-amber-900">{message}</p>)}
 </fieldset>;
}
