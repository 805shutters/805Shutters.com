import {sundanceCellularAccessories,sundanceCellularAccessoryKey} from './cellular-option-schedules';
import {sundanceCellularSource} from './cellular-assortment';
import {sundanceZebraAccessories,sundanceZebraAccessoryKey} from './zebra-accessories';
import {sundanceZebraSourceId} from './zebra-configuration';
import {sundanceShadeAccessories,sundanceShadeAccessoryKey,sundanceShadeControls,sundanceShadeSource} from './shade-configuration';
import {sundanceWaldenAccessories,sundanceWaldenAccessoryKey} from './walden-option-schedules';
import {sundanceWaldenSource} from './walden-assortment';
import {sundanceSheerviewAccessories,sundancePortfolioAccessories} from './option-schedules';
export type SundanceSharedAccessory={key:string;label:string;quantityKey:string;unitSource:number;basis:'net'|'retail';sourceId:string;page:number;compatible:boolean;review?:string;maxMotors?:number;capacityPage?:number};
const shared=(key:string)=>/remote|wall|situo|telis|decoflex|smoove|hub|tahoma|charger|^usb/.test(key)&&!key.includes('ethernet');
export function sundanceSharedAccessoryCatalog(p:string,c:Record<string,unknown>):SundanceSharedAccessory[]{
 let rows:SundanceSharedAccessory[]=[];
 if(p==='sundance_cellular')rows=sundanceCellularAccessories.filter(a=>shared(a.key)).map(a=>({key:a.key,label:a.label,quantityKey:sundanceCellularAccessoryKey(a.key),unitSource:a.net,basis:'net',sourceId:sundanceCellularSource.sourceId,page:a.page,compatible:(a.systems as readonly string[]).includes(String(c.sundance_cellular_system)),...('review' in a?{review:a.review}:{})}));
 else if(['sundance_zebra','sundance_louvolite_zebra'].includes(p))rows=sundanceZebraAccessories.filter(a=>shared(a.key)).map(a=>({key:a.key,label:a.label,quantityKey:sundanceZebraAccessoryKey(a.key),unitSource:a.net,basis:'net',sourceId:sundanceZebraSourceId,page:a.page,compatible:a.controls.includes(String(c.sundance_zebra_control)),...('review' in a?{review:a.review}:{})}));
 else if(['sundance_roller','sundance_louvolite_roller','sundance_flat_roman','sundance_louvolite_flat_roman'].includes(p)){
  const source=sundanceShadeSource(p),power=sundanceShadeControls(p).find(a=>a.name===c.sundance_shade_control)?.power;
  rows=sundanceShadeAccessories(p).filter(a=>shared(a.key)).map(a=>({key:a.key,label:a.label,quantityKey:sundanceShadeAccessoryKey(a.key),unitSource:a.net,basis:'net',sourceId:source.sourceId,page:a.page,compatible:a.power.includes(power??''),...(a.review?{review:a.review}:{})}));
 }else if(['sundance_walden_premier','sundance_walden_select'].includes(p)){
  const premier=p==='sundance_walden_premier',sourceId=sundanceWaldenSource.sources.find(s=>s.file.includes(premier?'Premier':'Select'))!.sourceId;
  rows=sundanceWaldenAccessories.filter(a=>shared(a.key)).map(a=>({key:a.key,label:a.label,quantityKey:sundanceWaldenAccessoryKey(a.key),unitSource:a.key==='pro_hub'&&premier?458:a.price,basis:'retail',sourceId,page:c.sundance_walden_control==='Somfy Sonesse Ultra 30'?premier?23:21:premier?22:20,compatible:c.sundance_walden_style!=='Valance Only'&&a.controls.includes(String(c.sundance_walden_control)),...(({situo1:1,situo5:5,telis16:16,somfy_wall1:1,somfy_wall5:5} as Record<string,number>)[a.key]?{capacityPage:9,maxMotors:({situo1:1,situo5:5,telis16:16,somfy_wall1:1,somfy_wall5:5} as Record<string,number>)[a.key]}:{})}));
 }else if(p==='sundance_sheerview'||p==='sundance_portfolio_roman'){
  const family=p==='sundance_sheerview'?'sheerview':'portfolio',sourceId=family==='sheerview'?'sundance-h-sheerview-pricing_aug2026-4a981c88776d':'sundance-sundance-portfolio-roman-shade-product-price-guide-2026-421a4cba9a72';
  rows=(family==='sheerview'?sundanceSheerviewAccessories:sundancePortfolioAccessories).filter(a=>shared(a.key)).map(a=>({key:a.key,label:a.label,quantityKey:`sundance_${family}_${a.key}_qty`,unitSource:a.sourceRetail,basis:'retail',sourceId,page:a.page,compatible:c.roman_style!=='Valance Only'&&('control' in a?a.control===c[`sundance_${family}_control`]:(a.controls as readonly string[]).includes(String(c[`sundance_${family}_control`]))),...(a.key==='somfy_wall5'?{review:'The Portfolio five-channel wall-switch price $40 conflicts with its one-channel price $380; confirm the source amount.'}:{}),...(({somfy_situo1:1,somfy_situo5:5,somfy_telis16:16,somfy_wall1:1,somfy_wall5:5,single_remote:20} as Record<string,number>)[a.key]?{capacityPage:family==='sheerview'?17:16,maxMotors:({somfy_situo1:1,somfy_situo5:5,somfy_telis16:16,somfy_wall1:1,somfy_wall5:5,single_remote:20} as Record<string,number>)[a.key]}:{})}));
 }
 return rows;
}
