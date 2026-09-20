import type { SelectionContext, SelectionRecord, ValidationIssue } from './core';
import { sourceProvenance } from './source-manifest';

export const ROMAN_HARDWARE_MAGNET_COLORS = ['Nickel-Plated','Pure White','Silk White','Bisque','Pearl','Bright Brass','Antique Brass','Black','Crisp Linen','String','Sea Mist','Stone Gray','Brown Gray','Taupe Gray'] as const;
const norm=(v:unknown)=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const selected=(v:unknown)=>['yes','true'].includes(norm(v));
export function romanHardware(s:SelectionContext){
 if(s.productId!=='roman'||s.catalogAsOf<'2026-09-19')return null;
 const c=s.configuration,lift=norm(c.lift_system),mount=norm(c.mount_type),common=norm(c.shade_type)==='common valance',dayNight=norm(c.shade_type)==='day night';
 const issues:ValidationIssue[]=[];
 const add=(id:string,page:number,explanation:string)=>issues.push({severity:'hard_block',ruleId:`roman.hardware.${id}`,source:sourceProvenance('norman-roman-guide-2026-09',{page}),selectedValues:{...c},explanation});
 const chain=/continuous cord loop|smartrelease|smart release/.test(lift),ccl=lift==='continuous cord loop';
 // A new catalog revision requires measured recess data; earlier quote snapshots retain their rules.
 const mountingRevision = /norman-roman-mounting-2026-09-20-r[2345]$/.test(s.catalogVersion);
 const mountingFit = String(c.roman_mount_fit ?? '');
 const rawDepth = c.mount_depth_inches;
 const depth = rawDepth == null || rawDepth === '' ? NaN : Number(rawDepth);
 const flush = mountingFit === 'Flush Inside';
 const headrailTwo = /2/.test(String(c.headrail_size ?? '')) && !/1\s*1[\/ ]2|1\.5/.test(String(c.headrail_size ?? ''));
 const autoWand = /auto\s*wand/.test(norm(c.motor_type ?? c.power_source));
 const minimumDepth = dayNight ? (flush ? 4.125 : 3.625)
   : lift === 'motorized' ? (autoWand ? (flush ? 2.125 : 1.625) : (flush ? 2.5 : 2))
   : /smartrelease|smart release/.test(lift) || (ccl && headrailTwo) ? (flush ? 2.625 : 2.125)
   : (flush ? 2.125 : 1.75);
 if (mountingRevision && mount === 'inside mount') {
   if (!['Semi Inside', 'Flush Inside'].includes(mountingFit)) add('mount_fit',16,'Choose Semi Inside or Flush Inside for this Roman shade.');
   if (!Number.isFinite(depth) || depth < minimumDepth) add('mount_depth',16,`This Roman control and mounting arrangement requires at least ${minimumDepth} inches of mounting depth.`);
 }

 const rawLength=c.roman_chain_length??c.chain_length;
 const custom=rawLength!=null&&rawLength!==''&&norm(rawLength)!=='standard';
 const chainLength=custom?Number(String(rawLength).replace(/"/g,'')):s.heightInches-3;
 const chainMinimum=ccl?s.heightInches-3:12;
 const recommendedMax=mount==='inside mount'?s.heightInches-2:130;
 if(custom&&(!chain||!Number.isFinite(chainLength)||chainLength<chainMinimum||chainLength>280))add('chain_length',15,`Custom chain length requires a chain-operated Roman shade and must be from ${chainMinimum} through 280 inches.`);
 if(chain&&custom&&chainLength>recommendedMax&&!selected(c.roman_chain_unobstructed))add('chain_clearance',15,`A chain longer than ${recommendedMax} inches requires no sill or obstruction below its tension device; leave at least 2 inches for access and removal.`);
 if(c.roman_chain_unobstructed!=null&&!['yes','no','true','false'].includes(norm(c.roman_chain_unobstructed)))add('chain_obstruction_choice',15,'Choose Yes or No for the space below the chain tension device.');
 if(c.chain_type!=null&&(!chain||!['standard plastic','stainless steel'].includes(norm(c.chain_type))))add('chain_type',15,'Select Plastic or Stainless Steel for a chain-operated Roman shade.');
 if(c.chain_color!=null&&(!chain||norm(c.chain_type)==='stainless steel'||!['white','cottage white','black'].includes(norm(c.chain_color))))add('chain_color',15,'Plastic Roman chain colors are White, Cottage White and Black. Stainless Steel uses white clutch and tension hardware.');
 if(c.chain_location!=null&&(!chain||!['left','right'].includes(norm(c.chain_location))))add('chain_location',15,'Select Left or Right for the Roman chain position.');
 const banded = /edge banded|ribbon banded/.test(norm(c.fold_style));
 const bandingRevision = /norman-roman-mounting-2026-09-20-r[345]$/.test(s.catalogVersion);
 const bandingLayout = String(c.roman_banding_layout ?? '');
 if (bandingRevision && banded && !['Side Border','Wrapped Border'].includes(bandingLayout)) add('banding_layout',/ribbon/.test(norm(c.fold_style))?8:9,'Choose Side Border or Wrapped Border for the banded Roman shade.');
 const pole=norm(c.poles),hasPole=!!pole&&pole!=='none';
 const shadeCount=common?2:1;
 const totalPoles=c.roman_pole_total_quantity!=null&&c.roman_pole_total_quantity!=='';
 // Preserve the original per-component meaning of previously saved selections.
 const legacyPoles=c.roman_pole_quantity!=null&&c.roman_pole_quantity!=='';
 const poleQuantity=totalPoles?Number(c.roman_pole_total_quantity):legacyPoles?Number(c.roman_pole_quantity)*shadeCount*s.quantity:1;
 const poleMaximum=2*shadeCount*s.quantity;
 const poleLength=Number(String(c.pole_length??'').replace(/"/g,''));
 if(hasPole&&(lift!=='cordless'||!['pole with attachment','attachment only'].includes(pole)||!Number.isInteger(poleQuantity)||poleQuantity<1||poleQuantity>poleMaximum))add('pole_quantity',23,`Choose a total of 1 through ${poleMaximum} poles or attachments for this Cordless Roman line (at most two per shade).`);
 if(hasPole&&pole==='pole with attachment'&&![36,60].includes(poleLength))add('pole_length',23,'Choose a 36-inch or 60-inch Cordless Roman pole.');
 const positions:SelectionRecord=common?{left:'Left',right:'Right'}:dayNight?{front:c.chain_location??'Right',rear:norm(c.chain_location)==='left'?'Right':'Left'}:{single:c.chain_location??'Right'};
 const componentWidths=common&&Array.isArray(c.common_valance_panel_widths)?c.common_valance_panel_widths.map(Number):[s.widthInches];
 const layers=Number(c.roman_shim_layers??0);
 const brackets=componentWidths.map(width=>width<=44?2:width<=70?3:4);
 const shimQuantity=brackets.reduce((sum,count)=>sum+count,0)*layers;
 if(!Number.isInteger(layers)||layers<0||layers>3)add('shim_layers',24,'Choose zero through three shim layers per bracket.');
 if(layers>0&&(mount!=='outside mount'||dayNight))add('shim_mount',24,'Roman shims are available only for outside-mounted Single or Common Valance shades; Day & Night cannot use shims.');
 if((selected(c.shim)||Number(c.shims)>0||Number(c.shim_quantity)>0)&&c.roman_shim_layers==null)add('legacy_shims',24,'Reconfirm Roman shim layers so each bracket receives the correct quantity.');
 const hold=norm(c.hold_downs),magnetic=hold==='magnetic';
 if(hold&&!['none','magnetic'].includes(hold))add('hold_down',22,'Select None or Magnetic for Roman hold-downs.');
 if(magnetic&&mount!=='outside mount')add('hold_down_mount',22,'Roman magnetic hold-downs require outside mount.');
 if(c.magnet_color!=null&&(!magnetic||!ROMAN_HARDWARE_MAGNET_COLORS.some(color=>norm(color)===norm(c.magnet_color))))add('magnet_color',22,'Choose a documented Roman magnet catch finish with magnetic hold-downs.');
 if(selected(c.magnetic_hold_down)&&!magnetic)add('legacy_magnet',22,'Reconfirm the Roman magnetic hold-down selection before repricing.');
 if((selected(c.cordless_operating_pole)||selected(c.pole_attachment_only))&&!hasPole)add('legacy_pole',23,'Reconfirm the Roman pole or attachment selection before repricing.');
 return {issues,surchargeSelections:[...(magnetic?[{id:'magnetic_hold_down',units:shadeCount}]:[]),...(hasPole?[{id:pole==='attachment only'?'pole_attachment_only':'cordless_operating_pole',units:poleQuantity,billingScope:'once_per_line' as const}]:[]),...(shimQuantity>0?[{id:'shim',units:shimQuantity}]:[])],record:{
  version:1,sourceId:'norman-roman-guide-2026-09',sourcePages:[8,9,15,16,22,23,24],
  mounting:{...(mountingRevision && mount === 'inside mount' ? {fit:mountingFit,measuredDepth:Number.isFinite(depth)?depth:null,minimumDepth} : {}),componentWidths,brackets,shimLayers:layers,shimQuantity,shimExtension:layers*.375},
  banding:banded&&bandingRevision?{layout:bandingLayout,type:/ribbon/.test(norm(c.fold_style))?'Ribbon':'Edge',borderWidth:/ribbon/.test(norm(c.fold_style))?1.0625:2.5,ribbonInset:/ribbon/.test(norm(c.fold_style))?2:null}:null,
  chain:chain?{length:chainLength,custom,measuredFrom:'top_of_headrail_to_bottom_of_tension_device',minimumAccessClearance:2,toleranceAbove:1.5625,material:norm(c.chain_type)==='stainless steel'?'Stainless Steel':'Plastic',color:norm(c.chain_type)==='stainless steel'?'Stainless Steel':c.chain_color??'White',clutchAndTensionColor:norm(c.chain_type)==='stainless steel'?'White':c.chain_color??'White',positions}:null,
  pole:hasPole?{type:c.poles,quantity:poleQuantity,length:pole==='pole with attachment'?poleLength:null,quantityBasis:'per_line',legacyPerShadeQuantity:!totalPoles&&legacyPoles?Number(c.roman_pole_quantity):null}:null,
  holdDown:magnetic?{quantity:shadeCount,color:c.magnet_color??'Nickel-Plated',factoryMagnetLocation:dayNight?'back_of_rear_roller_hem_bar':'bottom_backside_of_roman',catchInstalledAtJobsite:true,minimumSideClearance:1.4375,minimumBottomClearance:.3125,metalDoorRecommended:false}:null,
 }};
}
