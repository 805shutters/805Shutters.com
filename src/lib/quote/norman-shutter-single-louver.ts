import type {NormanShutterPanelRecord} from './norman-shutter-panels';
export const NORMAN_FIXED_SINGLE_LOUVER_TILT='No Tilt · Fixed Single Louver';
/** WL/BW/ND37, WLP43. Actual louvers, never a panel-height estimate. */
export function normanSingleLouverFixedEligible(record:NormanShutterPanelRecord|null|undefined,split:unknown){
 return record?.application==='regular'&&record.motor==='none'&&record.panels.length>0&&!/^(yes|true)$/i.test(String(split??''))&&record.panels.every(p=>p.wholePanelLouverCount===1&&p.divider==='none'&&!p.dividerDetails?.splitTiltCentersInches.length&&!p.dividerDetails?.splitTiltMode);
}
