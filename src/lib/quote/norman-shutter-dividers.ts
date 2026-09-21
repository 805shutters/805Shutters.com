/** Divider locations use the guide's window/frame datum, never an inferred opening-to-panel offset. */
export type NormanShutterDividerRecord={
 version:1;
 measurementBasis:''|'window'|'max_frame'|'panel';
 referenceHeightInches:number|null;
 rails:Array<{heightInches:number|null;location:''|'center'|'specified';centerInches:number|null;exactLocation:boolean|null}>;
 /** Historical storage key. New custom entries explicitly identify the TOP of a closed louver. */
 splitTiltCentersInches:number[];
 splitTiltMode?:'equal'|'custom'|'';
 splitTiltReference?:'top_closed_louver';
 splitTiltExactLocations?:Array<boolean|null>;
 clearLouverCounts:number[];
};
export const emptyNormanShutterDividerRecord=():NormanShutterDividerRecord=>({version:1,measurementBasis:'',referenceHeightInches:null,rails:[{heightInches:3,location:'',centerInches:null,exactLocation:null}],splitTiltCentersInches:[],clearLouverCounts:[]});
const finiteOrNull=(v:unknown)=>v===null||(typeof v==='number'&&Number.isFinite(v));
export function parseNormanShutterDividerRecord(value:unknown):NormanShutterDividerRecord|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as Record<string,unknown>;
 if(r.version!==1||!['','window','max_frame','panel'].includes(String(r.measurementBasis))||!finiteOrNull(r.referenceHeightInches)||!Array.isArray(r.rails)||!Array.isArray(r.splitTiltCentersInches)||!Array.isArray(r.clearLouverCounts))return null;
 if(r.splitTiltMode!==undefined&&!['','equal','custom'].includes(String(r.splitTiltMode)))return null;
 if(r.splitTiltReference!==undefined&&r.splitTiltReference!=='top_closed_louver')return null;
 if(r.splitTiltExactLocations!==undefined&&(!Array.isArray(r.splitTiltExactLocations)||r.splitTiltExactLocations.some(v=>![null,true,false].includes(v))))return null;
 if(r.rails.some(p=>!p||typeof p!=='object'||Array.isArray(p)||!finiteOrNull(p.heightInches)||!finiteOrNull(p.centerInches)||!['','center','specified'].includes(p.location)||![null,true,false].includes(p.exactLocation)))return null;
 if([...r.splitTiltCentersInches,...r.clearLouverCounts].some(v=>typeof v!=='number'||!Number.isFinite(v)))return null;
 return r as NormanShutterDividerRecord;
}
export function normanShutterDividerSizes(programId:string){
 return ['brightwood','normandy_painted','normandy_stained'].includes(programId)?[3,...Array.from({length:39},(_,i)=>3.125+i*0.125)]:[3];
}
export function normanShutterDividerDeviation(louver:unknown):number|null{
 return ({'1 7/8"':0.75,'2 1/2"':1,'3"':1.25,'3 1/2"':1.5,'4 1/2"':2} as Record<string,number>)[String(louver)]??null;
}
