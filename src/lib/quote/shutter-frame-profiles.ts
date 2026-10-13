import { contractProductFamily } from './contract-product-family';
/** Source-specific Z-frame side profiles from the supplier manuals. */
export type ShutterFrameProfile = { id:string; label:string; manufacturer:string; src:string; source:string; aquashield:boolean; ref:string };
export const SHUTTER_FRAME_PROFILES:readonly ShutterFrameProfile[] = [
  {
    "id": "norman-bullnose-z-1-5",
    "label": "1 1/2\" Bullnose Z Frame",
    "ref": "norman-woodlore-018.png",
    "manufacturer": "Norman",
    "src": "/images/contract-illustrations/frame-profiles-v1/norman-bullnose-z-1-5.svg",
    "source": "Norman Woodlore technical binder, page 18",
    "aquashield": false
  },
  {
    "id": "norman-bullnose-z-2",
    "label": "2\" Bullnose Z Frame",
    "ref": "norman-woodlore-018.png",
    "manufacturer": "Norman",
    "src": "/images/contract-illustrations/frame-profiles-v1/norman-bullnose-z-2.svg",
    "source": "Norman Woodlore technical binder, page 18",
    "aquashield": false
  },
  {
    "id": "norman-beaded-z",
    "label": "1 1/4\" Beaded Z Frame",
    "ref": "norman-woodlore-018.png",
    "manufacturer": "Norman",
    "src": "/images/contract-illustrations/frame-profiles-v1/norman-beaded-z.png",
    "source": "Norman Woodlore technical binder, page 18",
    "aquashield": false
  },
  {
    "id": "norman-bel-air-z",
    "label": "2\" Bel Air Z Frame",
    "ref": "norman-woodlore-018.png",
    "manufacturer": "Norman",
    "src": "/images/contract-illustrations/frame-profiles-v1/norman-bel-air-z.png",
    "source": "Norman Woodlore technical binder, page 18",
    "aquashield": false
  },
  {
    "id": "norman-crown-z",
    "label": "3\" Crown Z Frame",
    "ref": "norman-woodlore-018.png",
    "manufacturer": "Norman",
    "src": "/images/contract-illustrations/frame-profiles-v1/norman-crown-z.png",
    "source": "Norman Woodlore technical binder, page 18",
    "aquashield": false
  },
  {
    "id": "norman-tilt-out-z",
    "label": "Tilt Out Z Frame",
    "ref": "norman-woodlore-018.png",
    "manufacturer": "Norman",
    "src": "/images/contract-illustrations/frame-profiles-v1/norman-tilt-out-z.png",
    "source": "Norman Woodlore technical binder, page 18",
    "aquashield": false
  },
  {
    "id": "norman-deep-bullnose-z",
    "label": "1 1/2\" Deep Bullnose Z Frame",
    "ref": "norman-aquashield-023.png",
    "manufacturer": "Norman",
    "src": "/images/contract-illustrations/frame-profiles-v1/norman-deep-bullnose-z.png",
    "source": "Norman Woodlore Plus technical binder, page 23",
    "aquashield": true
  },
  {
    "id": "onyx-z-trim",
    "label": "Z Trim",
    "ref": "onyx-frame-detail-04.png",
    "manufacturer": "Onyx",
    "src": "/images/contract-illustrations/frame-profiles-v1/onyx-z-trim.png",
    "source": "Onyx Reference Manual, frame detail, page 4",
    "aquashield": false
  },
  {
    "id": "onyx-z-fine",
    "label": "Z Fine",
    "ref": "onyx-frame-detail-04.png",
    "manufacturer": "Onyx",
    "src": "/images/contract-illustrations/frame-profiles-v1/onyx-z-fine.png",
    "source": "Onyx Reference Manual, frame detail, page 4",
    "aquashield": false
  },
  {
    "id": "onyx-z-crown",
    "label": "Z Crown",
    "ref": "onyx-frame-detail-04.png",
    "manufacturer": "Onyx",
    "src": "/images/contract-illustrations/frame-profiles-v1/onyx-z-crown.png",
    "source": "Onyx Reference Manual, frame detail, page 4",
    "aquashield": false
  },
  {
    "id": "onyx-z-crest",
    "label": "Z Crest",
    "ref": "onyx-frame-detail-04.png",
    "manufacturer": "Onyx",
    "src": "/images/contract-illustrations/frame-profiles-v1/onyx-z-crest.png",
    "source": "Onyx Reference Manual, frame detail, page 4",
    "aquashield": false
  },
  {
    "id": "onyx-vinyl-z-small",
    "label": "Vinyl Z Frame Small",
    "ref": "onyx-frame-detail-04.png",
    "manufacturer": "Onyx",
    "src": "/images/contract-illustrations/frame-profiles-v1/onyx-vinyl-z-small.png",
    "source": "Onyx Reference Manual, frame detail, page 4",
    "aquashield": false
  },
  {
    "id": "onyx-vinyl-z-large",
    "label": "Vinyl Z Frame Large",
    "ref": "onyx-frame-detail-04.png",
    "manufacturer": "Onyx",
    "src": "/images/contract-illustrations/frame-profiles-v1/onyx-vinyl-z-large.png",
    "source": "Onyx Reference Manual, frame detail, page 4",
    "aquashield": false
  }
];
const normalize=(s:string)=>s.toLowerCase().replace(/[“”″]/g,'"').replace(/½/g,'1/2').replace(/¼/g,'1/4').replace(/\*/g,'').replace(/\bframe\b/g,'').replace(/\s+/g,' ').trim();
export function shutterFrameProfile(product:string, options:readonly string[]):ShutterFrameProfile|null {
 if(contractProductFamily(product)!=='shutters') return null;
 const field=(name:RegExp)=>options.find(o=>name.test(o.split(':')[0].trim()))?.split(':').slice(1).join(':').trim()||'';
 const supplier=field(/^(manufacturer|supplier)$/i);
 const identity=supplier||product;
 const manufacturer=/onyx/i.test(identity)?'Onyx':/norman|woodlore|normandy|brightwood/i.test(identity)?'Norman':null;
 const frame=normalize(field(/^(frame|frame type|frame style)$/i));
 if(!frame || (supplier&&!manufacturer)) return null;
 const aliases:Record<string,string>={'vz small':'vinyl z small','vz large':'vinyl z large'};
 const canonical=aliases[frame]||frame;
 const matches=SHUTTER_FRAME_PROFILES.filter(p=>(!manufacturer||p.manufacturer===manufacturer)&&normalize(p.label)===canonical);
 // FS, vinyl variants, and undocumented profiles require their own supplier drawing.
 return matches.length===1 ? matches[0] : null;
}
