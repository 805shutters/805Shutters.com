import { contractProductFamily, type ContractProductFamily } from '@/lib/quote/contract-product-family';
import styles from './ContractProductIllustration.module.css';

const horizontal = (start: number, end: number, step: number, left = 35, right = 125) =>
  Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, i) =>
    <path key={i} d={`M${left} ${start + i * step}h${right - left}`} />);
const vertical = (start: number, end: number, step: number, top = 35, bottom = 135) =>
  Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, i) =>
    <path key={i} d={`M${start + i * step} ${top}v${bottom - top}`} />);

/** Neutral line drawings, with no control side, panel count, motor or geometry
 * asserted. Used only when no faithful configuration-specific artwork exists. */
function ReferenceLines({ family }: { family: ContractProductFamily }) {
  switch (family) {
    case 'faux-wood': case 'wood': case 'mini': case 'vinyl': case 'fabric-blind':
      return <><path d="M32 28h96v8H32zM35 36v96h90V36M32 132h96v5H32z" />{horizontal(44, 124, family === 'mini' ? 5 : 10)}</>;
    case 'shutters':
      return <><path d="M30 24h100v116H30zM36 30h88v104H36z" />{horizontal(40, 125, 10, 37, 123)}</>;
    case 'roller': case 'screen': case 'tension':
      return <><path d="M30 27q50-6 100 0v9H30zM35 36v96h90V36M33 132h94v5H33z" />
        {family === 'screen' ? <g opacity=".3">{horizontal(42, 126, 7)}{vertical(42, 120, 7)}</g> : null}
        {family === 'tension' ? <path d="M28 36v101m104-101v101M28 137h104" /> : null}</>;
    case 'roman': case 'woven':
      return <><path d="M32 28h96v8H32zM35 36v96q45 10 90 0V36" />
        {[58, 82, 106, 130].map(y => <path key={y} d={`M35 ${y}q45 10 90 0`} />)}
        {family === 'woven' ? <g opacity=".4">{horizontal(40, 130, 4)}{vertical(40, 120, 6)}</g> : null}</>;
    case 'honeycomb':
      return <><path d="M30 28h100v8H30zM35 36v96h90V36M32 132h96v5H32z" />
        {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M35 ${40 + i * 8}l5-4h80l5 4-5 4H40z`} />)}</>;
    case 'vertical-honeycomb':
      return <><path d="M28 28h104v7H28zM30 136h100" />
        {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M${30 + i * 10} 36l5 4v90l-5 5-5-5V40z`} />)}</>;
    case 'sheer':
      return <><path d="M30 28h100v8H30zM35 36v96h90V36" />
        {[43, 65, 87, 109].map(y => <path key={y} d={`M35 ${y}h90v12H35z`} fill="#eee" />)}{horizontal(58, 124, 22)}</>;
    case 'vertical': case 'vanes':
      return <>{family === 'vertical' ? <path d="M27 26h106v8H27z" /> : null}
        {Array.from({ length: family === 'vanes' ? 4 : 7 }, (_, i) => <path key={i} d={`M${family === 'vanes' ? 49 + i * 16 : 30 + i * 14} 36h10v99l-5 3-5-3z`} />)}</>;
    case 'smart-drapes':
      return <><path d="M27 26h106v7H27z" />{Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${30 + i * 11} 35q-5 45-2 98q5 7 10 0q-3-45 2-98`} />)}</>;
    case 'valance':
      return <><path d="M25 61l12-9h98l-10 9H25v28h100V61m10-9v28l-10 9M29 68h91M29 81h91" /></>;
    case 'fabric':
      return <><path d="M39 37h79q-12 45 4 89H44Q30 80 39 37zM44 43h66M49 121h67" />
        <g opacity=".35">{horizontal(52, 112, 8, 43, 112)}{vertical(50, 106, 8, 44, 119)}</g></>;
    case 'pillow':
      return <><path d="M37 40q43 9 86 0-9 40 0 80-43-9-86 0 9-40 0-80zM45 48q35 7 70 0-7 32 0 64-35-7-70 0 7-32 0-64z" /></>;
    case 'shelf':
      return <><path d="M24 76l18-13h97l-17 13H24v9h98l17-13v-9M122 76v9M48 85v19l12-19m41 0v19l12-19" /></>;
    case 'track':
      return <><path d="M22 59l17-8h99l-17 8H22v10h99l17-8V51M121 59v10M26 64h91" />
        {[40, 60, 80, 100].map(x => <path key={x} d={`M${x} 69v12q-5 7 0 9q5-2 0-9`} />)}</>;
    case 'awning':
      return <><path d="M36 37h91l17 57H17zM17 94v8q8 9 16 0 8 9 16 0 8 9 16 0 8 9 16 0 8 9 16 0 8 9 16 0 8 9 16 0 8 9 15 0v-8M36 37v89m91-89v89M36 126h91" />
        <path d="M54 37L42 94m30-57-6 57m24-57v57m18-57 12 57" /></>;
    case 'parts':
      return <><path d="M36 45h31v34H36zM42 51h19v22H42zM89 50h29v9H89zM99 59v47h9V59M42 105h36v9H42z" /><circle cx="78" cy="82" r="14" /><circle cx="78" cy="82" r="6" /></>;
    default:
      // A drafting reference, rather than an invented treatment for a new name.
      return <><path d="M38 26h64l20 20v89H38zM102 26v20h20M48 59h34m-34 9h23m-23 49h49M79 103l24-37 6 4-24 37-9 7z" /></>;
  }
}

export function ProductReferenceSketch({ productType, options }: { productType: string; options: readonly string[] }) {
  const family = contractProductFamily(productType);
  const specialty = /specialty|arch|rake|circle|oval|french door|skylight/i.test([productType, ...options.filter(option => /^(application|shade type|shutter type|specialty shape):/i.test(option))].join(' '));
  // An unidentified specialty shape must not be pictured as a rectangle.
  const referenceFamily = specialty ? 'custom' : family;
  return <>
    <svg viewBox="0 0 160 160" width={160} height={160} role="img" aria-label={`${productType} — product reference; see specifications for configuration`} className={styles.product} data-product-reference={referenceFamily}>
      <g fill="none" stroke="#68655f" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round"><ReferenceLines family={referenceFamily} /></g>
    </svg>
    <figcaption className={styles.reference}><strong>Product reference</strong><span>See specifications for configuration</span></figcaption>
  </>;
}
