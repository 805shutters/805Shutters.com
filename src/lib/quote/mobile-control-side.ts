import type { SalesQuoteDesign } from '@mts/types/quote';
import {getDetailFieldsForProduct} from './product-options';
export type ControlSidePolicy={choices:string[];required:boolean;reason:string};
/** The exact product's existing configurator is authoritative. No universal N/A or stock side. */
export function mobileControlSidePolicy(design:SalesQuoteDesign,control:string):ControlSidePolicy {
 const product=String(design.options_json.catalog_product_id??design.options_json.quote_lab_product_id??'');
 if(design.product_type==='Shutters')return {choices:[],required:false,reason:'Shutter operation is collected by its panel schedule.'};
 if(!control)return {choices:[],required:false,reason:'Choose the operating system first.'};
 // These shades have no customer-selected cord side. Never apply this exemption to wand-tilt blinds.
 if(!/Blinds/.test(design.product_type??'')&&/cordless|motor|wirefree|simphony/i.test(control)&&!/loop|cord loop|chain/i.test(control))return {choices:['Not applicable'],required:false,reason:'This operating system has no manual cord side.'};
 if(design.supplier==='Sundance'&&product==='sundance_basicvue')return {choices:['Left'],required:true,reason:'BasicVue documents left-side wand tilt only.'};
 const field=getDetailFieldsForProduct(product).find(f=>['control_side','chain_location','wand_side','sundance_blind_wand'].includes(f.id));
 const choices=field?.options?.map(o=>o.value).filter(v=>!/^(?:n\/?a|none|not applicable|center)$/i.test(v))??[];
 return {choices:choices.length?choices:['Left','Right'],required:true,reason:/loop|chain/i.test(control)?'Manual loop or chain operation requires its side.':'Record the customer control side; supplier rules validate availability.'};
}
