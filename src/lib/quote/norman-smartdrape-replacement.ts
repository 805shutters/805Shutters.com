import { ROMAN_ANCILLARY_PRICE_SOURCE } from './norman-roman-ancillary';
import type { CatalogProduct } from './catalog/types';
import { SMARTDRAPE_COORDINATION } from '../quote-v2/generated/norman-smartdrape-coordination.generated';
export const SMARTDRAPE_REPLACEMENT = 'norman_smartdrape_replacement_vanes';
export const SMARTDRAPE_REPLACEMENT_RECORD = 'smartdrape_replacement_request_v1';
export const SMARTDRAPE_REPLACEMENT_PRICING_FROM = '2026-09-22';
export const SMARTDRAPE_REPLACEMENT_PRICING_VERSION = '805-v2-norman-smartdrape-replacement-retail-2026-09-22-r1';
export const SMARTDRAPE_REPLACEMENT_PRICING_NOTE = 'Priced from the September standalone six-vane pack schedule using the original shade length. Dealer cost and manufacturer freight are unverified. Original order details and color-lot availability must be confirmed before ordering.';
export const SMARTDRAPE_REPLACEMENT_LENGTHS = [48,60,72,84,100,120,132,144] as const;
export const SMARTDRAPE_REPLACEMENT_PRICES = [230,270,310,350,390,460,500,540] as const;
export const SMARTDRAPE_REPLACEMENT_VERSION = '805-v2-norman-smartdrape-replacement-2026-09-20-r1';
export const SMARTDRAPE_REPLACEMENT_HOLD = 'Standalone vane packs have different pricing from packs ordered with a shade. Exact replacement availability, length, price and freight require Norman confirmation against the original work order. Pattern availability and color-lot match are not assured.';
export const replacementColors = SMARTDRAPE_COORDINATION;
export const replacementStacks = ['Left Stack','Right Stack','Traveling Center Stack','Center Stack (Motorized)','Center Opening'] as const;
export type ReplacementRequest = {version:1;originalWorkOrder:string;style:'A'|'B'|'';shadeType:'Single'|'Side by Side';stack:typeof replacementStacks[number]|'';colorMode:'Single Color'|'Alternating';firstColor:string;secondColor:string;originalVaneCount:number|null;vaneLengthInches:number|null;shadeLengthInches?:number|null};
export const emptyReplacementRequest = ():ReplacementRequest=>({version:1,originalWorkOrder:'',style:'',shadeType:'Single',stack:'',colorMode:'Single Color',firstColor:'',secondColor:'',originalVaneCount:null,vaneLengthInches:null});
export function parseReplacementRequest(value:unknown):ReplacementRequest|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 if(v.version!==1||!['originalWorkOrder','firstColor','secondColor'].every(k=>typeof v[k]==='string')||!['A','B',''].includes(String(v.style))||!['Single','Side by Side'].includes(String(v.shadeType))||!['',...replacementStacks].includes(String(v.stack))||!['Single Color','Alternating'].includes(String(v.colorMode)))return null;
 if(!['originalVaneCount','vaneLengthInches'].every(k=>v[k]===null||typeof v[k]==='number'&&Number.isFinite(v[k])))return null;
 if(v.shadeLengthInches!==undefined&&v.shadeLengthInches!==null&&(typeof v.shadeLengthInches!=='number'||!Number.isFinite(v.shadeLengthInches)))return null;
 return {...(v.shadeLengthInches===undefined?{}:{shadeLengthInches:v.shadeLengthInches as number|null}),version:1,originalWorkOrder:String(v.originalWorkOrder).trim(),style:v.style as ReplacementRequest['style'],shadeType:v.shadeType as ReplacementRequest['shadeType'],stack:v.stack as ReplacementRequest['stack'],colorMode:v.colorMode as ReplacementRequest['colorMode'],firstColor:String(v.firstColor),secondColor:String(v.secondColor),originalVaneCount:v.originalVaneCount as number|null,vaneLengthInches:v.vaneLengthInches as number|null};
}
/** PS-SD Guide p24: six vanes per pack; shared by with-shade and standalone requests. */
export function smartdrapePackCounts(middleOnly:boolean,doubleEnds:boolean){const first=middleOnly?0:doubleEnds?2:1;return {first,middle:6-2*first,last:first};}
export function replacementComposition(r:ReplacementRequest){
 const alternating=r.colorMode==='Alternating';
 const n=smartdrapePackCounts(r.style==='B',r.stack==='Center Opening'||r.shadeType==='Side by Side'&&alternating);
 const last=alternating?(r.originalVaneCount===null?null:r.originalVaneCount%2===0?r.secondColor:r.firstColor):r.firstColor;
 return {first:{quantity:n.first,color:r.firstColor},middle:alternating?[{quantity:n.middle/2,color:r.firstColor},{quantity:n.middle/2,color:r.secondColor}]:[{quantity:n.middle,color:r.firstColor}],last:{quantity:n.last,color:n.last?last:null}};
}
export function replacementUnitLabel(raw:unknown){const r=parseReplacementRequest(raw);return r?.shadeLengthInches ? `${r.shadeLengthInches} inch shade length · 6 per pack` : `${r?.vaneLengthInches??'—'} inch vanes · 6 per pack`;}
export const smartdrapeReplacementProduct:CatalogProduct={id:SMARTDRAPE_REPLACEMENT,name:'SmartDrape Extra / Replacement Vane Packs',productType:'Vane Packs',manufacturer:'Norman',priceBasis:'suggested_retail',customerRetailStatus:'verified',provisional:false,source:'September Retail Guide printed p23; PS-SD Guide p24',pages:[24],fabricRouting:null,programs:[{id:`${SMARTDRAPE_REPLACEMENT}_source`,name:'Standalone pack of six vanes',priceGroup:null,priceAxis:'wh',priceBasis:'suggested_retail',sourceId:ROMAN_ANCILLARY_PRICE_SOURCE,grid:{widths:[],heights:[],prices:[]},minWidth:null,maxWidth:null,minHeight:null,maxHeight:null,maxAreaSqft:null,fabricCollections:[],sourcePages:[24],notes:[SMARTDRAPE_REPLACEMENT_PRICING_NOTE]}],surcharges:[],fabricByYard:[],freightStatus:'unresolved',notes:[SMARTDRAPE_REPLACEMENT_PRICING_NOTE]};
