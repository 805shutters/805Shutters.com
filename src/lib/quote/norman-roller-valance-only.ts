import type { CatalogProduct } from './catalog/types';
export const ROLLER_VALANCE_ONLY='norman_roller_valance_only';
export const ROLLER_SEPARATE_VALANCE='norman_roller_separate_valance';
export const ROLLER_VALANCE_KEY='norman_roller_valance_choice_v1';
export const ROLLER_VALANCE_DERIVED='norman_roller_valance_source_v1';
export const ROLLER_VALANCE_VERSION='805-v2-norman-roller-valance-2026-09-20-r2';
export const ROLLER_VALANCE_SOURCE='norman-roller-guide-2026-09-16';
export const ROLLER_VALANCE_HOLD='Roller valance specifications are documented. Standalone/separate valance price, availability, freight and shared charge allocation require Norman confirmation before customer pricing.';
export const isRollerValance=(id:string)=>id===ROLLER_VALANCE_ONLY||id===ROLLER_SEPARATE_VALANCE;
export const ROLLER_VALANCE_STYLES=['4.5-inch Curved Fascia Plain','4.5-inch Curved Fascia with Fabric','4.5-inch Square Fascia','4.5-inch Fabric Valance','6-inch Fabric Valance','8-inch Fabric Valance'] as const;
export const ROLLER_FASCIA_COLORS=['White','Cottage White','Black','Bianca','Anodized Silver'] as const;
export const ROLLER_CAP_COLORS=['White','Cottage White','Nature','Terra','Sahara','Chocolate','Silver','Black','Bianca'] as const;
export type RollerValanceRecord={version:1;style:string;width:number|null;mount:''|'Inside'|'Outside';fabricCode:string;fasciaColor:string;endCapColor:string;returnLength:number|null;joinery:'Connector'|'Keystone';layout:'Equally Centered'|'Custom';keystoneShape:''|'V-Shape'|'Square';keystoneCount:number;locations:(number|null)[];associatedLineIds:string[];controlClearanceConfirmed:boolean};
export const emptyRollerValance=():RollerValanceRecord=>({version:1,style:'',width:null,mount:'',fabricCode:'',fasciaColor:'',endCapColor:'',returnLength:null,joinery:'Connector',layout:'Equally Centered',keystoneShape:'',keystoneCount:0,locations:[],associatedLineIds:[],controlClearanceConfirmed:false});
export function parseRollerValance(raw:unknown):RollerValanceRecord|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const r=raw as Record<string,unknown>,num=(v:unknown)=>v===null||typeof v==='number'&&Number.isFinite(v);
 if(r.version!==1||!['style','fabricCode','fasciaColor','endCapColor'].every(k=>typeof r[k]==='string')||!num(r.width)||!num(r.returnLength)||!['','Inside','Outside'].includes(String(r.mount))||!['Connector','Keystone'].includes(String(r.joinery))||!['Equally Centered','Custom'].includes(String(r.layout))||!['','V-Shape','Square'].includes(String(r.keystoneShape))||!Number.isSafeInteger(r.keystoneCount)||!Array.isArray(r.locations)||r.locations.length>5||!r.locations.every(num)||!Array.isArray(r.associatedLineIds)||r.associatedLineIds.length>100||!r.associatedLineIds.every(v=>typeof v==='string'&&v.length>0&&v.length<=200)||typeof r.controlClearanceConfirmed!=='boolean')return null;
 return {version:1,style:r.style as string,width:r.width as number|null,mount:r.mount as RollerValanceRecord['mount'],fabricCode:r.fabricCode as string,fasciaColor:r.fasciaColor as string,endCapColor:r.endCapColor as string,returnLength:r.returnLength as number|null,joinery:r.joinery as RollerValanceRecord['joinery'],layout:r.layout as RollerValanceRecord['layout'],keystoneShape:r.keystoneShape as RollerValanceRecord['keystoneShape'],keystoneCount:r.keystoneCount as number,locations:[...r.locations] as (number|null)[],associatedLineIds:[...r.associatedLineIds] as string[],controlClearanceConfirmed:r.controlClearanceConfirmed};
}
export const rollerValanceUnitLabel=(raw:unknown)=>{const r=parseRollerValance(raw);return r?.width==null?'Valance width not selected':`${r.width} inches end-to-end width`;};
export const rollerValanceProducts:CatalogProduct[]=[[ROLLER_VALANCE_ONLY,'Soluna Roller Valance Only'],[ROLLER_SEPARATE_VALANCE,'Soluna Roller Separate Valance']].map(([id,name])=>({id,name,manufacturer:'Norman',productType:'Valances',priceBasis:'manual_required',customerRetailStatus:'unverified',provisional:true,source:'Roller Shade Guide September 16, 2026 pp37–40',pages:[37,38,39,40],fabricRouting:null,programs:[{id:`${id}_source`,name:id===ROLLER_VALANCE_ONLY?'Valance only · each':'Separate valance for associated shades · each',priceGroup:null,priceAxis:'width',priceBasis:'manual_required',sourceId:ROLLER_VALANCE_SOURCE,grid:{widths:[],heights:[],prices:[]},minWidth:null,maxWidth:null,minHeight:null,maxHeight:null,maxAreaSqft:null,fabricCollections:[],sourcePages:[37,38,39,40],notes:[ROLLER_VALANCE_HOLD]}],surcharges:[],fabricByYard:[],freightStatus:'unresolved',notes:[ROLLER_VALANCE_HOLD,'No raceway on valance line. Large valance bracket. Explicit width, return length, colors and source splicing.']}));
export type RollerValanceDraft={key:string;base:RollerValanceRecord;record:RollerValanceRecord;submitted:RollerValanceRecord|null};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export const newRollerValanceDraft=(key:string,record:RollerValanceRecord):RollerValanceDraft=>({key,base:record,record,submitted:null});
export const rollerValanceDirty=(s:RollerValanceDraft)=>!equal(s.record,s.submitted??s.base);
export function syncRollerValanceDraft(s:RollerValanceDraft,key:string,incoming:RollerValanceRecord):RollerValanceDraft{
 if(s.key!==key||equal(s.record,incoming))return newRollerValanceDraft(key,incoming);
 if(s.submitted&&equal(s.submitted,incoming))return {...s,base:incoming,submitted:null};
 return s.submitted||!equal(s.base,s.record)?s:newRollerValanceDraft(key,incoming);
}

/** Separate valances may associate with Roller shade lines despite their distinct natural-unit product type. */
export const isRollerValanceAssociationType = (currentType:string,candidateType:string) => currentType === "Valances" && candidateType === "Roller Shades";
