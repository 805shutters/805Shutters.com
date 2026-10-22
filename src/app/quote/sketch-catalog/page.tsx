import type { Metadata } from 'next';
import { OFFICIAL_SKETCH_CATEGORIES, OFFICIAL_FRENCH_DOOR_SKETCH, OFFICIAL_SPECIALTY_SKETCHES, OFFICIAL_CUTOUT_SKETCHES, OFFICIAL_ARCH_CONTROL_SKETCHES } from '@/lib/quote/official-sketch-catalog';
import { anatomyProductIndex } from '@/lib/quote/contract-anatomy-catalog';
import { contractProductFamily } from '@/lib/quote/contract-product-family';
import { SHUTTER_FRAME_PROFILES } from '@/lib/quote/shutter-frame-profiles';
import { VALANCE_ARTWORK, VALANCE_ART_ROOT } from '@/lib/quote/valance-illustrations';
import { DRAPERY_STYLES, draperySketch } from '@/lib/quote/drapery';
import styles from './sketch-catalog.module.css';

export const metadata: Metadata = {title:'805 Shutters · Pencil sketch catalog',robots:{index:false,follow:false}};
type Sketch = {id:string;label:string;src:string};
function Gallery({items}:{items:readonly Sketch[]}) {
  return <div className={styles.gallery}>{items.map(item=><figure key={item.id} id={`sketch-${item.id}`}>
    <a href={item.src}><img src={item.src} alt={`${item.label} — 805 pencil sketch`} width={240} height={280} loading="lazy"/></a>
    <figcaption>{item.label}<span>{item.id}</span></figcaption>
  </figure>)}</div>;
}
export default function SketchCatalog() {
  const products=anatomyProductIndex();
  return <main className={styles.catalog}>
    <header><a href="/crm/">Back to quoting</a><p>805 SHUTTERS</p><h1>Pencil sketch catalog</h1>
      <p>Our complete product illustration collection. Click a sketch to open its saved image.</p>
      <nav aria-label="Sketch catalog sections"><a href="#products">Product categories</a><a href="#specialty">Specialty shapes</a><a href="#cutouts">French-door cutouts</a><a href="#drapery">Drapery</a><a href="#valances">Valances</a><a href="#frames">Frames</a><a href="#inventory">Product index</a></nav>
    </header>
    <section id="products"><h2>Product categories</h2><Gallery items={[OFFICIAL_FRENCH_DOOR_SKETCH,...OFFICIAL_SKETCH_CATEGORIES]}/></section>
    <section id="specialty"><h2>Specialty shutters · {OFFICIAL_SPECIALTY_SKETCHES.length} shapes</h2><Gallery items={OFFICIAL_SPECIALTY_SKETCHES}/></section>
    <section id="cutouts"><h2>French-door cutouts · {OFFICIAL_CUTOUT_SKETCHES.length} profiles</h2><p>Illustrations show representative configurations. The quote specifications identify the ordered options.</p><Gallery items={OFFICIAL_CUTOUT_SKETCHES}/></section>
    <section><h2>Arch tilt and divider variants</h2><Gallery items={OFFICIAL_ARCH_CONTROL_SKETCHES}/></section>
    <section id="drapery"><h2>Drapery · {DRAPERY_STYLES.length} styles</h2><Gallery items={DRAPERY_STYLES.map(d=>({id:d.id,label:d.title,src:draperySketch(d)}))}/></section>
    <section id="valances"><h2>Valances · {VALANCE_ARTWORK.length} profiles</h2><Gallery items={VALANCE_ARTWORK.map(v=>({id:v.id,label:v.label,src:`${VALANCE_ART_ROOT}/${v.id}.webp`}))}/></section>
    <section id="frames"><h2>Shutter frames</h2><Gallery items={SHUTTER_FRAME_PROFILES.map(f=>({id:f.id,label:f.label,src:f.src}))}/></section>
    <section id="inventory"><h2>Product index · {products.length} entries</h2><p>Each catalog product uses its category’s pencil collection, with configured artwork where available.</p>
      <table><thead><tr><th>Product</th><th>Sketch collection</th></tr></thead><tbody>{products.map(p=>{const family=contractProductFamily(p.name);return <tr key={p.id}><td>{p.name}</td><td><a href={`#sketch-${family}`}>{OFFICIAL_SKETCH_CATEGORIES.find(c=>c.id===family)?.label??'Official artwork required'}</a></td></tr>})}</tbody></table>
    </section>
  </main>;
}
