export const SUNDANCE_PRIVACY_PIECES_KEY='sundance_privacy_pieces_v1';
export type SundancePrivacyPieces={version:1;kind:'Aluminum side channels'|'Solar bar';pieces:{id:string;lengthInches:number|null;quantity:number}[]};
export function readSundancePrivacyPieces(value:unknown):SundancePrivacyPieces|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as SundancePrivacyPieces;
 if(r.version!==1||!['Aluminum side channels','Solar bar'].includes(r.kind)||!Array.isArray(r.pieces)||r.pieces.some(p=>!p||typeof p!=='object'||typeof p.id!=='string'||!p.id||!(p.lengthInches===null||typeof p.lengthInches==='number')||typeof p.quantity!=='number'))return null;
 return r;
}
export function sundancePrivacyPieceEvidence(c:Record<string,unknown>){
 const raw=c[SUNDANCE_PRIVACY_PIECES_KEY],selected=c.sundance_shade_privacy,record=readSundancePrivacyPieces(raw),issues:string[]=[];
 if(!['Aluminum side channels','Solar bar'].includes(String(selected))){if(raw!=null)issues.push('Saved privacy-piece measurements do not match an active privacy accessory.');return{issues,record,feet:null,unroundedSourceNet:null,sourceNet:null,rate:null,customerPriceEligible:false as const};}
 const rate=selected==='Aluminum side channels'?14:3;
 if(!record||record.kind!==selected||record.pieces.length===0)issues.push('Record each privacy accessory length and quantity for the selected accessory.');
 else {
  if(new Set(record.pieces.map(p=>p.id)).size!==record.pieces.length)issues.push('Each privacy piece requires a distinct saved identity.');
  if(record.pieces.some(p=>!Number.isFinite(p.lengthInches)||Number(p.lengthInches)<=0||!Number.isSafeInteger(p.quantity)||p.quantity<1))issues.push('Privacy pieces require positive measured lengths and positive whole quantities.');
 }
 if(issues.length)return{issues,record,feet:null,unroundedSourceNet:null,sourceNet:null,rate,customerPriceEligible:false as const};
 const feet=record!.pieces.reduce((sum,p)=>sum+Number(p.lengthInches)/12*p.quantity,0),unroundedSourceNet=feet*rate;
 // A fractional individual piece may be billed differently even if the sum is whole feet.
 const fractional=record!.pieces.some(p=>Math.abs(Number(p.lengthInches)/12-Math.round(Number(p.lengthInches)/12))>1e-9);
 if(fractional)issues.push('The guide does not specify fractional-foot billing. Exact measured footage is retained; obtain the billed lengths/rounding before approving this charge.');
 return{issues,record,feet,unroundedSourceNet,sourceNet:fractional?null:Math.round(unroundedSourceNet*100)/100,rate,customerPriceEligible:false as const};
}
export function sundancePrivacyPieceDescription(value:unknown){const r=readSundancePrivacyPieces(value);if(!r)return null;return `${r.kind}: ${r.pieces.map(p=>`${p.quantity} × ${p.lengthInches??'unmeasured'} inches`).join('; ')}`;}
