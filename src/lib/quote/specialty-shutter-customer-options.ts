import { customerShutterDetails } from '@/lib/crm/customer-shutter-details';
import { NORMAN_SHUTTER_PANEL_RECORD, type NormanShutterPanelRecord } from './norman-shutter-panels';

const visualFields = {
 'Shutter type':'shutter_type', 'Divider rail':'divider_rail', 'Divider rail location':'divider_rail_location', 'Split tilt':'split_tilt',
 'Specialty shape':'specialty_shape', 'Arch style':'arch_style', 'Curved section tilt':'curved_section_tilt',
 'Top louver':'top_louver', 'Top shape':'top_shape', 'French-door cutout type':'french_door_cutout_type',
 'Handle side':'handle_side', 'Quarter arch side':'quarter_arch_side',
} as const;
/** Persist the customer meaning alongside the private factory worksheet. Native
 * SQL snapshots only copy allow-listed primitives, never the worksheet itself.
 * Clearing inactive visual fields prevents an old door/shape surviving a change. */
export function specialtyShutterCustomerOptions(record: NormanShutterPanelRecord): Record<string,string|null> {
 const patch: Record<string,string|null> = Object.fromEntries(Object.values(visualFields).map(key=>[key,null]));
 for(const detail of customerShutterDetails({[NORMAN_SHUTTER_PANEL_RECORD]:record})) {
  const key=visualFields[detail.label as keyof typeof visualFields];
  if(key) patch[key]=detail.value;
 }
 return patch;
}
