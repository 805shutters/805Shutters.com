import { contractProductFamily } from './contract-product-family';
import { CONTRACT_ART_ROOT, type ContractIllustration } from './contract-illustrations';

export const OPTION_ART_ROOT = '/images/contract-illustrations/options-v1';
export type ShadeStudy = ContractIllustration & {
  fold: string;
  loopSide?: 'left' | 'right';
  controlDrawn: boolean;
};
const clean=(v:string)=>v.toLowerCase().replace(/[_*]/g,'').replace(/\s+/g,' ').trim();

/** Preview assemblies only. Physical drawings do not certify supplier availability. */
export function anatomyShadeStudy(product:string, options:readonly string[]):ShadeStudy|null {
  if(contractProductFamily(product)!=='roman'||/smart\s*fold/i.test(product))return null;
  const fields=options.map(o=>{const i=o.indexOf(':');return [clean(o.slice(0,i)),clean(o.slice(i+1))];});
  const values=(...names:string[])=>fields.filter(([k])=>names.includes(k)).map(([,v])=>v);
  if(/day.*night|common valance|dual|skylight|specialty|coupled/.test(values('shade type','application','specialty shape').join(' ')))return null;
  const folds=values('fold style','fold styles','fold styles limited','roman style');
  const normalized=folds.map(v=>v.replace(/\s*\(.*\)$/,''));
  if(new Set(normalized).size>1)return null;
  const fold=normalized[0]||'flat';
  const assets:Record<string,string>={
    'flat':`${CONTRACT_ART_ROOT}/roman.webp`,
    'flat fold without seams':`${CONTRACT_ART_ROOT}/roman.webp`,
    'flat fold with batten back':`${OPTION_ART_ROOT}/roman-batten-back.png`,
    'flat fold w/ batten back':`${OPTION_ART_ROOT}/roman-batten-back.png`,
    'soft fold':`${OPTION_ART_ROOT}/roman-soft-fold.png`,
    'edge banded':`${OPTION_ART_ROOT}/roman-edge-banded.png`,
    'ribbon banded':`${OPTION_ART_ROOT}/roman-ribbon-banded.png`,
  };
  const src=assets[fold];
  if(!src)return null;
  const operations=values('lift system','operating system','control type','lift / control');
  const operation=operations.length===1?operations[0]:'';
  const sideValues=values('control side','chain location','chain side');
  const sides=new Set(sideValues.map(v=>/^(left|l)$/.test(v)?'left':/^(right|r)$/.test(v)?'right':'unknown'));
  const side=sides.size===1&&!sides.has('unknown')?[...sides][0] as 'left'|'right':undefined;
  const loop=/^(continuous )?(cord|chain) loop$|^ccl$/.test(operation);
  const remote=/^motorized$/.test(operation);
  const cordless=/^(aerolite )?cordless$/.test(operation);
  const controlDrawn=cordless||remote||(loop&&!!side);
  return {src,fold,alt:`${product} · ${fold}${controlDrawn?` · ${operation}`:''} — custom pencil sketch`,remote,mirror:false,
    ...(loop&&side?{loopSide:side}:{}),controlDrawn,
    ...(!controlDrawn?{referenceNote:operations.length?'Selected control requires its own drawing.':'Operating system not recorded.'}:{}),
  };
}
