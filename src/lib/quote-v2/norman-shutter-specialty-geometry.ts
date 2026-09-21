import {NORMAN_SPECIALTY_ARCH_SHAPES,NORMAN_SPECIALTY_QUARTER_LEG_SHAPES,NORMAN_SPECIALTY_TWO_LEG_SHAPES,NORMAN_SPECIALTY_T_POST_SHAPES} from '../quote/norman-shutter-specialty-geometry';
import type {NormanSpecialtyRecord} from '../quote/norman-shutter-specialty';
export function normanSpecialtyGeometryProblems(r:NormanSpecialtyRecord,mount:unknown):Array<{id:string;explanation:string}>{
 const g=r.geometry,issues:Array<{id:string;explanation:string}>=[];
 const add=(id:string,explanation:string)=>issues.push({id:`order_geometry.${id}`,explanation});
 if(!g){add('required','Save specialty order-outline measurements and template requirements separately from finished-panel dimensions.');return issues;}
 const w=g.widthInches,h=g.heightInches,positive=(n:number|null):n is number=>n!==null&&Number.isFinite(n)&&n>0;
 if(!positive(w)||!positive(h))add('dimensions','Record positive specialty order width and order height. Opening and finished-panel sizes do not establish the order outline.');
 if(!g.outline||(NORMAN_SPECIALTY_ARCH_SHAPES.includes(r.shapeCode)&&g.outline==='not_arch'))add('outline','Declare whether this arch is perfect or imperfect; do not infer a perfect arch from missing measurements.');
 if(g.existingMolding===null)add('molding','Record whether the specialty will mount on existing molding.');
 const leg=(n:number|null)=>positive(h)&&n!==null&&Number.isFinite(n)&&n>=0&&n<=h;
 if(NORMAN_SPECIALTY_QUARTER_LEG_SHAPES.includes(r.shapeCode)||r.shapeCode==='YS56'){
  if(!leg(g.legHeightInches))add('leg','Record the order leg height, at least zero and no greater than the order height.');
  if(r.shapeCode==='YS56'&&positive(h)&&leg(g.legHeightInches)&&h-g.legHeightInches!>6)add('solid_curve','YS56 Solid Rail Arch permits a curve no more than 6 inches above the leg height.');
 }
 if(NORMAN_SPECIALTY_QUARTER_LEG_SHAPES.includes(r.shapeCode)){
  if(!positive(g.middleHeightInches)||!positive(h)||g.middleHeightInches>h||!leg(g.legHeightInches)||g.middleHeightInches<=g.legHeightInches!)add('middle','Record an order middle height above the leg and no greater than the order height.');
  else if(g.outline==='perfect'&&g.middleHeightInches<=(h-g.legHeightInches!)/2+g.legHeightInches!)add('perfect_middle','For this perfect quarter arch, order middle height must be greater than (order height − leg height) ÷ 2 + leg height.');
 }
 if(NORMAN_SPECIALTY_TWO_LEG_SHAPES.includes(r.shapeCode)){
  if(!leg(g.leftLegHeightInches)||!leg(g.rightLegHeightInches))add('two_legs','Record both order leg heights, each at least zero and no greater than the order height.');
  else if(g.outline==='perfect'&&positive(h)&&positive(w)&&[g.leftLegHeightInches!,g.rightLegHeightInches!].some(n=>n<h-w/2))add('perfect_legs','For this perfect arch, each order leg height must be at least order height minus half the order width.');
 }
 if(['YS02','YS06'].includes(r.shapeCode)&&!(g.outline==='perfect'&&w===h)&&(!positive(g.middleHeightInches)||!positive(h)||g.middleHeightInches>h))add('quarter_middle','Supply order middle height for an imperfect quarter round, including when width equals height. Only a perfect quarter round with equal width and height omits it.');
 if(NORMAN_SPECIALTY_T_POST_SHAPES.includes(r.shapeCode)){
  const count=g.verticalTPostCount,locations=g.verticalTPostLocationsInches;
  if(count===null||!Number.isInteger(count)||count<2)add('t_post_count','This arch requires at least two vertical T-posts.');
  else {
   const allowed=count===2?[0,2]:count===3?[1,3]:[count];
   if(!allowed.includes(locations.length))add('t_post_locations',count===2?'Two T-posts need no custom positions; if recording requested positions, provide both.':count===3?'For three T-posts, provide the middle (second) position; outer positions are optional and factory-determined.':'For more than three T-posts, provide every requested location.');
   if(locations.some((n,i)=>!positive(w)||n<=0||n>=w||(i>0&&n<=locations[i-1])))add('t_post_positions','Requested T-post locations must increase from left to right within the order width. Final locations follow the actual outline and require factory verification.');
  }
 }
 if(r.shapeCode==='YS62'){
  if(g.centeredPeak===null)add('peak_mode','Declare a centered peak or provide the noncentered vertex measurement WA.');
  if(g.centeredPeak===false&&(!positive(w)||!positive(g.peakWidthAInches)||g.peakWidthAInches>=w))add('peak_width','For a noncentered peak, record WA from the left edge, greater than zero and below order width.');
  if(g.centeredPeak===true&&g.peakWidthAInches!==null&&positive(w)&&g.peakWidthAInches!==w/2)add('peak_center','A centered peak has WA equal to half the order width; remove a contradictory custom WA.');
 }
 if((mount==='Inside Mount'||g.outline==='imperfect'||g.existingMolding===true||['YS16','YS20'].includes(r.shapeCode))&&!g.templateReference.trim())add('template','A template submission reference is required for inside mount, imperfect arches, existing molding or oval shapes. Factory acceptance remains unverified; templates older than one year must be resent.');
 return issues;
}
