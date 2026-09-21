/** Bi-fold 180 binder j1 pages 2–5. This is source geometry, not a pricing size. */
export type NormanBifold180Construction = {
  version: 1;
  casing: '' | 'none' | 'existing';
  referenceWidthInches: number | null;
  referenceHeightInches: number | null;
  headerInches: 3 | 3.5 | null;
  fascia: '' | 'plain' | 'deco';
  headerExtensionInches: number | null;
  baseboardThicknessInches: number | null;
  headerBuildoutInches: number | null;
  bottomPivotLBracket: boolean | null;
  lightBlockExtensionInches: number | null;
};
export const emptyNormanBifold180Construction = (): NormanBifold180Construction => ({version:1,casing:'',referenceWidthInches:null,referenceHeightInches:null,headerInches:null,fascia:'',headerExtensionInches:null,baseboardThicknessInches:null,headerBuildoutInches:null,bottomPivotLBracket:null,lightBlockExtensionInches:null});
export function parseNormanBifold180Construction(value: unknown): NormanBifold180Construction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const r=value as Record<string,unknown>;
  if(r.version!==1||!['','none','existing'].includes(String(r.casing))||!['','plain','deco'].includes(String(r.fascia))||![null,3,3.5].includes(r.headerInches as number|null)||![null,true,false].includes(r.bottomPivotLBracket as boolean|null))return null;
  for(const field of ['referenceWidthInches','referenceHeightInches','headerExtensionInches','baseboardThicknessInches','headerBuildoutInches','lightBlockExtensionInches'])if(r[field]!==null&&(typeof r[field]!=='number'||!Number.isFinite(r[field])))return null;
  return r as NormanBifold180Construction;
}
export function normanBifold180Geometry(r: NormanBifold180Construction) {
  const w=r.referenceWidthInches,h=r.referenceHeightInches;
  if(!r.casing||w===null||h===null||w<=0||h<=0)return null;
  return {widthInches:w+(r.casing==='none'?3.5:1.25),heightInches:r.casing==='none'?h+4.5:h};
}
export function normanBifold180BaseboardAdvice(r: NormanBifold180Construction): string | null {
  const t=r.baseboardThicknessInches;
  if(t===null||t<0)return null;
  if(t===0)return 'With no baseboard, the guide allows a 3-inch header.';
  if(t<=0.625)return 'For baseboard thickness up to ⅝ inch, the guide allows a 3½-inch header.';
  return `For this baseboard, the guide suggests a 3-inch header with ${t-0.125}-inch buildout (baseboard thickness minus ⅛ inch). Confirm site clearance.`;
}
