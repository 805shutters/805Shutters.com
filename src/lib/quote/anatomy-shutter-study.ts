import { contractProductFamily } from './contract-product-family';
import type { SpecialtyShutterSketch } from './specialty-shutter-illustrations';

/** Preview-only assembly using the same graphite blades as our specialty sketches.
 * Explicit controls only; this does not invent a frame profile or order geometry. */
export function anatomyShutterStudy(product: string, options: readonly string[]): SpecialtyShutterSketch | null {
  if(contractProductFamily(product)!=='shutters'||/specialty|french door|arch|rake/i.test(product))return null;
  const fields=options.map(o=>{const i=o.indexOf(':');return [o.slice(0,i).trim().toLowerCase(),o.slice(i+1).trim()];});
  const values=(...keys:string[])=>fields.filter(([k])=>keys.includes(k)).map(([,v])=>v);
  const single=(...keys:string[])=>{const entries=[...new Set(values(...keys).map(v=>v.toLowerCase()))];return entries.length===1?entries[0]:'';};
  if(values('specialty shape').some(v=>! /^(none|rectangle|rectangular)$/i.test(v)))return null;
  if(values('shutter type','application','track type','track system','panel config','panel configuration').some(v=>/arch|rake|french|bypass|by pass|bifold|bi fold|cafe|double hung|track/i.test(v)&&!/^none$/i.test(v)))return null;
  const layout=single('panel config','panel configuration').replace(/\s/g,'').toUpperCase();
  if(!/^[LR]+(?:T[LR]+)*$/.test(layout)||(layout.match(/[LR]/g)||[]).length>16)return null;
  const rawTilt=single('tilt','tilt type');
  if(/motor/.test(rawTilt))return null;
  const tilt=/hidden|invisible/.test(rawTilt)?'hidden':/offset/.test(rawTilt)?'offset':/^(standard(?: tilt)?|front tilt rod|front center|center tilt(?: rod)?|tilt bar)$/.test(rawTilt)?'center':null;
  if(!tilt)return null;
  const flag=(key:string)=>{const entries=values(key);if(entries.length!==1)return null;return /^(yes|true|1)$/i.test(entries[0])?true:/^(no|none|false|0)$/i.test(entries[0])?false:null;};
  const split=flag('split tilt'),divider=flag('divider rail');
  if(split===null||divider===null)return null;
  return {code:'RECTANGLE',label:'Rectangular shutter',tilt,split,divider,layout,cutoutSide:null,top:'rectangle',archStyle:'',curvedTilt:null,fixedTop:false,noFrame:/no frame|direct mount|panel only/.test(single('frame','frame type'))};
}
