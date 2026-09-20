import type { SelectionContext, ValidationIssue } from '@/lib/quote-v2/core';
import { sourceProvenance } from '@/lib/quote-v2/source-manifest';
import { sundanceExteriorZipColors, sundanceExteriorZipSource } from './exterior-zip';

export function sundanceExteriorZipDimensionWarnings(width: number, height: number) {
 const warnings: {id:string;message:string}[]=[];
 if (!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0) warnings.push({id:'sundance-zip-positive-dimensions',message:'Enter positive, finite Zip shade dimensions.'});
 if(width>sundanceExteriorZipSource.maxWidth)warnings.push({id:'sundance-zip-max-width',message:'Exterior Zip shades have a published maximum width of 220 inches.'});
 if(height>sundanceExteriorZipSource.maxHeight)warnings.push({id:'sundance-zip-max-height',message:'Exterior Zip shades have a published maximum height of 110 inches.'});
 return warnings;
}

/** Published envelope only; account pricing and complete motor compatibility remain held. */
export function validateSundanceExteriorZipConfiguration(s:Pick<SelectionContext,'widthInches'|'heightInches'|'programId'|'configuration'>):ValidationIssue[] {
 const c=s.configuration;
 const warnings=sundanceExteriorZipDimensionWarnings(s.widthInches,s.heightInches);
 const row=sundanceExteriorZipColors.find(row=>row.id===c.fabric_color_id);
 if(!row||row.colorName!==c.fabric_color_name||row.collection!==c.sundance_exterior_price_class||s.programId)warnings.push({id:'sundance-zip-material-route',message:'Select an exact Exterior Zip material and price class; this net square-foot product cannot use a shade grid.'});
 return warnings.map(w=>({severity:'hard_block',ruleId:w.id,source:sourceProvenance(sundanceExteriorZipSource.rows[0].sourceId,{page:1}),selectedValues:{widthInches:s.widthInches,heightInches:s.heightInches,...c},explanation:w.message}));
}
