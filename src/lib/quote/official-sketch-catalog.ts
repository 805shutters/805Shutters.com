import { OFFICIAL_CATEGORY_SKETCHES } from './anatomy-reference-artwork';
import { FRENCH_DOOR_CATEGORY_SKETCH } from './french-door-artwork';
import { FRENCH_DOOR_SKETCH_TYPES } from './specialty-shutter-illustrations';
import { NORMAN_SPECIALTY_SHAPES } from './norman-shutter-specialty';
import type { ContractProductFamily } from './contract-product-family';

const categoryNames: Record<Exclude<ContractProductFamily, 'custom'>, string> = {
  shutters:'Shutters', roller:'Roller shades', roman:'Roman shades', honeycomb:'Honeycomb shades',
  sheer:'Sheer shades', 'faux-wood':'Faux wood blinds', wood:'Wood blinds', mini:'Mini blinds',
  vertical:'Vertical blinds', 'smart-drapes':'Smart drapes', 'vertical-honeycomb':'Vertical honeycomb',
  'fabric-blind':'Fabric blinds', vinyl:'Vinyl blinds', woven:'Woven shades', fabric:'Fabric',
  pillow:'Pillows', vanes:'Replacement vanes', shelf:'Shelves', track:'Drapery tracks',
  tension:'Tension systems', screen:'Screens', awning:'Awnings', parts:'Parts', valance:'Valances',
};
export const OFFICIAL_SKETCH_CATEGORIES = Object.entries(OFFICIAL_CATEGORY_SKETCHES).map(([id,file]) => ({
  id, label:categoryNames[id as keyof typeof categoryNames], src:`/images/contract-illustrations/${file}`,
}));
export const OFFICIAL_FRENCH_DOOR_SKETCH = {id:'french-door',label:'French-door shutter with handle cutout',...FRENCH_DOOR_CATEGORY_SKETCH};
const profile = ([code,label]:readonly [string,string]) => ({id:code,label,src:`/images/contract-illustrations/catalog-v1/${code.toLowerCase()}.png`});
export const OFFICIAL_SPECIALTY_SKETCHES = NORMAN_SPECIALTY_SHAPES.map(profile);
export const OFFICIAL_CUTOUT_SKETCHES = FRENCH_DOOR_SKETCH_TYPES.map(profile);
export const OFFICIAL_ARCH_CONTROL_SKETCHES = ['center','hidden','offset'].flatMap(tilt => [false,true].flatMap(split => [false,true].map(divider => {
  const id=`ys05-${tilt}${split?'-split':''}${divider?'-divider':''}`;
  return {id,label:`Louvered arch · ${tilt} tilt${split?' · split tilt':''}${divider?' · divider rail':''}`,src:`/images/contract-illustrations/catalog-v1/${id}.png`};
})));
