'use client';
import { flushSync } from 'react-dom';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { contractAnatomyLabels, anatomySelectionGroup, ANATOMY_SELECTION_GROUPS, isFinishDetail } from '@/lib/quote/contract-anatomy';
import { customerQuoteProductName } from '@/lib/crm/customer-quote-branding';
import { shutterIllustrationGeometry, type ShutterIllustrationGeometry } from '@/lib/quote/shutter-illustration-geometry';
import { ContractProductIllustration } from './ContractProductIllustration';
import { fabricPerformanceLabels } from '@/lib/quote/fabric-performance-labels';
import styles from './ContractAnatomy.module.css';
import { anatomyLeaderPath, type AnatomyLineRouting } from '@/lib/quote/anatomy-leader-path';

export type AnatomyLayout = 'compact' | 'centered' | 'bordered' | 'classic' | 'grouped';
export type AnatomySummaryStyle = 'current' | 'recap' | 'numbered' | 'cards' | 'strip' | 'grid' | 'legend';
export type ContractAnatomyProps = { productType: string; room: string; options: readonly string[]; styleName?: string; width?: number; height?: number; quantity?: number; valanceArtId?: string | null; layout?: AnatomyLayout; lineRouting?:AnatomyLineRouting; summaryStyle?:AnatomySummaryStyle; illustrationGeometry?: ShutterIllustrationGeometry; showHeader?: boolean; afterIllustration?: ReactNode };
/** Shared, read-only presentation. The caller owns selections and order validity. */
export function ContractAnatomy({ productType, room, options, styleName, width, height, quantity = 1, valanceArtId, illustrationGeometry, layout = 'centered', lineRouting='around',summaryStyle='current', showHeader=true, afterIllustration }: ContractAnatomyProps) {
  const model = useMemo(() => contractAnatomyLabels(productType, options, styleName, layout), [productType, options, styleName, layout]);
  const finishDetails = model.specifications.filter(isFinishDetail);
  const visibleCalloutDetails = model.callouts.flatMap(callout => callout.details.slice(0, 2));
  const constructionDetails = model.specifications.filter(detail => !isFinishDetail(detail) && !visibleCalloutDetails.includes(detail));
  const fabricLabels=fabricPerformanceLabels(options,styleName);
  const detailKey=(detail:{label:string;value:string})=>`${detail.label}:${detail.value}`;
  const numberedDetails=Array.from(new Map([...model.callouts.flatMap(c=>c.details),...model.specifications].map(d=>[detailKey(d),d])).values());
  const performanceDetail=numberedDetails.find(d=>/^fabric$/i.test(d.label))||numberedDetails.find(d=>/fabric|lining|opacity|light control/i.test(d.label))||numberedDetails.find(isFinishDetail);
  const detailNumber=(detail:{label:string;value:string})=>numberedDetails.findIndex(d=>detailKey(d)===detailKey(detail))+1;
  const showNumbers=layout!=='grouped'&&summaryStyle!=='current'&&summaryStyle!=='recap';
  const scene = useRef<HTMLDivElement>(null), art = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLElement | null)[]>([]);
  const [paths, setPaths] = useState<{ part: string; d: string; x: number; y: number }[]>([]);
  const [printing, setPrinting] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const heading = useId();
  useEffect(() => {
    const draw = () => {
      if (!scene.current || !art.current) return;
      // The contract print stylesheet uses zoom. SVG coordinates use CSS pixels,
      // while client rectangles include that zoom, so normalize every anchor.
      const scale = scene.current.getBoundingClientRect().width / scene.current.clientWidth || 1;
      const measure = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left / scale, right: rect.right / scale, top: rect.top / scale, bottom: rect.bottom / scale, width: rect.width / scale, height: rect.height / scale };
      };
      const frame = measure(scene.current);
      const mobile = frame.width <= 620;
      const image = measure(art.current.querySelector(mobile ? '[data-shade-fold], [data-roller-top-treatment], figure' : '[data-shade-fold]') || art.current);
      setPaths(model.callouts.map((callout, i) => {
        if (callout.noLeader) return {part:callout.part,d:'',x:0,y:0};
        const text = labels.current[i] ? measure(labels.current[i]!) : undefined;
        const shutterPanel = model.family === 'shutters' && ['control','slat','bottom'].includes(callout.part) ? art.current?.querySelector('[data-shutter-panel]:last-of-type') : null;
        const shutterFrame = model.family === 'shutters' && callout.part === 'frame' ? art.current?.querySelector('[data-shutter-frame="outer"]') : null;
        const targetElement = (shutterPanel || shutterFrame || (callout.anchor ? art.current?.querySelector(`[data-anatomy-anchor="${callout.anchor}"]`) : callout.part === 'top' ? art.current?.querySelector('[data-valance-artwork]') : null));
        const target = targetElement ? measure(targetElement) : undefined;
        const bounds = target || image;
        const perimeter=lineRouting==='around'&&!callout.anchor&&callout.part!=='surface';
        const point=shutterPanel ? [50,callout.point[1]] : shutterFrame ? [callout.side==='left'?1:99,64] : target && callout.part==='top' ? [50,50] : perimeter ? callout.part==='top' ? [50, model.family==='roman'?12:summaryStyle==='legend'?20:14] : callout.part==='bottom' ? [52,81] : [callout.side==='left'?16:84,callout.point[1]] : callout.point;
        if (mobile && layout === 'grouped' && callout.part === 'bottom' && !shutterPanel) point[0] = 82;
        if (mobile && layout === 'grouped' && callout.part === 'surface' && !target) point[0] = 32;
        const x = bounds.left - frame.left + bounds.width * (target && callout.anchor === 'cord-loop' ? 50 : point[0]) / 100;
        const y = bounds.top - frame.top + bounds.height * point[1] / 100;
        if (!text || (mobile && layout !== 'grouped') || model.reference) return { part: callout.part, d: '', x, y };
        if (mobile && layout === 'grouped') {
          const above = text.bottom <= image.top;
          const section = labels.current[i]?.closest('section');
          const labelBounds = section ? measure(section) : text;
          // Start below upper cards or above lower section headings. Direct
          // leaders stay in the free space; controls use one outside lane.
          const startX = text.left - frame.left + text.width * (above && callout.anchor ? .82 : .5);
          const startY = (above ? text.bottom + 5 : labelBounds.top - 8) - frame.top;
          const end = `L ${x} ${y}`;
          const lane = image.right - frame.left + 8;
          const lowerLane = callout.side === 'right' ? frame.width + 6 : -6;
          const lowerStartX = (callout.side === 'right' ? text.right + 4 : text.left - 4) - frame.left;
          const lowerStartY = text.top - frame.top + Math.min(24, text.height / 2);
          const d = !above && Number(section?.getAttribute('data-label-row') || 0) > 1
            ? `M ${lowerStartX} ${lowerStartY} L ${lowerLane} ${lowerStartY} L ${lowerLane} ${y} ${end}`
            : above && callout.anchor
              ? `M ${startX} ${startY} L ${lane} ${startY + 14} L ${lane} ${y - 18} ${end}`
              : `M ${startX} ${startY} ${end}`;
          return { part:callout.part, d, x, y };
        }
        const left = callout.side === 'left';
        const startX = left ? text.right - frame.left + 8 : text.left - frame.left - 8;
        const startY = text.top - frame.top + Math.min(24, text.height / 2);
        const elbow = left ? Math.max(startX + 16, frame.width * .29) : Math.min(startX - 16, frame.width * .71);
        return { part: callout.part, d: anatomyLeaderPath({start:{x:startX,y:startY},end:{x,y},left,routing:lineRouting,part:callout.part,anchor:callout.anchor,elbow,art:{left:image.left-frame.left+image.width*.1,right:image.left-frame.left+image.width*.9,top:image.top-frame.top+image.height*.14,bottom:image.top-frame.top+image.height*.84}}), x, y };
      }));
    };
    draw();
    const observer = new ResizeObserver(draw);
    if (scene.current) observer.observe(scene.current);
    if (art.current) observer.observe(art.current);
    labels.current.forEach(el => el && observer.observe(el));
    // Printing changes the layout synchronously, before ResizeObserver can commit.
    const beforePrint = () => {
      flushSync(() => setPrinting(true));
      flushSync(draw);
    };
    const afterPrint = () => { flushSync(() => setPrinting(false)); draw(); };
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    const printMedia = window.matchMedia('print');
    const mediaChanged = (event: MediaQueryListEvent) => event.matches ? beforePrint() : afterPrint();
    printMedia.addEventListener('change', mediaChanged);
    return () => {
      observer.disconnect();
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
      printMedia.removeEventListener('change', mediaChanged);
    };
  }, [model, layout, lineRouting, summaryStyle]);
  const selected = model.callouts.find(c => c.part === active);
  const renderCallout = (callout: typeof model.callouts[number], i: number) => {
        const CalloutTag = layout === 'grouped' ? 'div' : 'button';
        const siblings = model.callouts.filter(c => c.side === callout.side), index = siblings.indexOf(callout);
        const labelTop=layout==='grouped' ? (callout.side==='right'?96:32)+index*130 : layout==='classic' ? (callout.side==='right'?190:70)+index*116 : lineRouting==='around'&&(callout.anchor==='pull-tab'||callout.part==='bottom')?230:24 + index * (layout === 'bordered' ? 108 : 96);
        return <CalloutTag type={layout === 'grouped' ? undefined : "button"} key={`${callout.part}-${i}`} data-callout-part={callout.part} data-no-leader={callout.noLeader || undefined} ref={(el: HTMLDivElement | HTMLButtonElement | null) => { labels.current[i] = el; }} style={{ top: `${labelTop}px` }} className={`${styles.callout} ${styles[callout.side]} ${active === callout.part ? styles.selected : ''}`} aria-pressed={layout === 'grouped' ? undefined : active === callout.part} onClick={() => {if(layout!=='grouped')setActive(active === callout.part ? null : callout.part);}}>
          {layout==='grouped'?callout.details.map(detail=><span className={styles.calloutDetail} key={detailKey(detail)}><span className={styles.calloutCategory}>{showNumbers?`${detailNumber(detail)} · `:''}{/^lift system$/i.test(detail.label)?'Control type':detail.label}</span><strong>{detail.value}</strong>{detail===performanceDetail&&fabricLabels.map(label=><strong className={styles.fabricPerformance} data-fabric-performance="true" key={label}>{label}</strong>)}</span>):<><strong>{showNumbers?<span className={styles.referenceNumbers}>{callout.details.map(d=><b key={detailKey(d)}>{detailNumber(d)}</b>)}</span>:<span className={styles.number}>{i + 1}.</span>}{callout.anchor === 'remote' ? 'Remote control' : callout.anchor === 'pull-tab' ? 'Cordless pull tab' : callout.anchor === 'cord-loop' ? 'Continuous cord loop' : callout.details.length === 1 ? callout.details[0].value : callout.title}</strong><span>{callout.details.length === 1 ? callout.details[0].label : callout.details.slice(0, 2).map(d => d.value).join(' · ') + (callout.details.length > 2 ? ` · +${callout.details.length - 2} details` : '')}</span></>}
          {layout==='grouped'&&callout.anchor==='remote'&&!callout.details.some(d=>/remote/i.test(`${d.label} ${d.value}`))&&<span className={styles.controlTarget}>Remote control</span>}
          {layout==='grouped'&&callout.anchor==='pull-tab'&&<span className={styles.controlTarget}>Center pull tab</span>}
        </CalloutTag>;
  };
  return <article className={`${styles.card} ${printing ? styles.printing : ''} ${styles[layout]} ${showNumbers?styles.numbered:''} ${summaryStyle==='legend'?styles.legend:''}`} aria-labelledby={showHeader ? heading : undefined} aria-label={showHeader ? undefined : room} data-contract-anatomy={model.family} data-contract-layout={layout} data-line-routing={lineRouting} data-summary-style={summaryStyle}>
    {showHeader && <header className={styles.header}><div className={styles.identity}><h2 id={heading} className={styles.room}>{room || 'Room not specified'}</h2><p className={styles.eyebrow}>{customerQuoteProductName(productType)}</p>{layout==='classic'&&<p className={styles.subtitle}>{model.family==='shutters'?'Your shutters':/roller|roman|honeycomb|sheer|woven|pleated|dual|solar/.test(model.family)?'Your shade':'Your product'}, explained</p>}</div><div className={styles.headerMeta}>{width ? <span>Width <strong>{width}″</strong></span> : null}<span>Quantity <strong>{quantity}</strong></span></div></header>}
    <div className={styles.diagram} ref={scene}>
      <div className={styles.art} ref={art}><ContractProductIllustration productType={productType} options={options} valanceArtId={valanceArtId} illustrationGeometry={illustrationGeometry ?? shutterIllustrationGeometry(width, height, options)} showTemporaryShade={false} size="anatomy" /></div>
      <svg className={styles.lines} aria-hidden="true">{paths.map((path, i) => path.d ? <g key={`${path.part}-${i}`}><path d={path.d} className={`${styles.line} ${active === path.part ? styles.active : ''}`} /><circle cx={path.x} cy={path.y} r="3" className={styles.dot}/></g> : null)}</svg>
      {layout==='grouped' ? (['left','right'] as const).flatMap(side => {
        const entries = ANATOMY_SELECTION_GROUPS.flatMap(title => model.callouts
          .map((callout, i) => ({callout, i, title}))
          .filter(({callout}) => callout.side === side && anatomySelectionGroup(callout.details[0].label) === title));
        return entries.map(({callout, i, title}, row) => <section key={`${side}-${i}`} aria-label={title}
          className={`${styles.labelSlot} ${side === 'left' ? styles.designColumn : styles.operationColumn}`}
          style={{gridRow: row + 1, '--phone-label-row': row === 0 ? 1 : row + 2} as CSSProperties} data-label-row={row} data-label-side={side}>
          {row === 0 || entries[row - 1].title !== title ? <h3>{title}</h3> : <span aria-hidden="true" />}
          {renderCallout(callout, i)}
        </section>);
      }) : model.callouts.map(renderCallout)}
    </div>
    {((selected && layout!=='grouped') || model.reference) && <p className={styles.coverage} aria-live="polite">{selected ? selected.details.map(d => `${d.label}: ${d.value}`).join(' · ') : model.coverageNote}</p>}
    {showNumbers&&<section className={`${styles.selectionSummary} ${{cards:styles.summaryCards,strip:styles.summaryStrip,grid:styles.summaryGrid,legend:styles.summaryLegend,numbered:styles.summaryRows,current:'',recap:''}[summaryStyle]}`} aria-label="Numbered selection summary"><h3>Your selections</h3><ol>{numberedDetails.map((detail,i)=><li key={detailKey(detail)} data-selection-number={i+1}><span className={styles.summaryNumber}>{i+1}</span><div><span className={styles.summaryLabel}>{/^lift system$/i.test(detail.label)?'Control type':detail.label}</span><strong>{detail.value}</strong>{detail===performanceDetail&&fabricLabels.map(label=><strong className={styles.fabricPerformance} data-fabric-performance="true" key={label}>{label}</strong>)}</div></li>)}</ol></section>}
    {layout!=='grouped'&&summaryStyle==='recap'&&numberedDetails.length>0&&<section className={styles.recap} aria-label="Selection recap">{[{title:'',details:numberedDetails}].map(group=><div key={group.title}>{group.title&&<h3>{group.title}</h3>}<dl>{group.details.map(detail=><div key={detailKey(detail)}><dt>{/^lift system$/i.test(detail.label)?'Control type':detail.label}</dt><dd>{detail.value}{detail===performanceDetail&&fabricLabels.map(label=><strong className={styles.fabricPerformance} data-fabric-performance="true" key={label}>{label}</strong>)}</dd></div>)}</dl></div>)}</section>}
    {layout!=='grouped'&&summaryStyle==='current'&&constructionDetails.length > 0 && <dl className={styles.specs}>{constructionDetails.map((detail, i) => <div key={`${detail.label}-${i}`} className={selected?.details.includes(detail) ? styles.highlight : undefined}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>}
    {layout!=='grouped'&&summaryStyle==='current'&&(finishDetails.length > 0 || fabricLabels.length > 0) && <section className={styles.description} aria-label="Fabric and finish description">
      <h3>{finishDetails.some(detail => /fabric|lining|weave/i.test(detail.label)) ? 'Fabric & finish' : 'Material & finish'}</h3>
      <dl>{finishDetails.map((detail, i) => <div key={`${detail.label}-${i}`}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>
      {fabricLabels.map(label => <strong className={styles.fabricPerformance} data-fabric-performance="true" key={label}>{label}</strong>)}
    </section>}
    {!model.specifications.length && !model.notes.length && <p className={styles.empty}>No options selected.</p>}
    {afterIllustration}
    {model.notes.length > 0 && <section className={styles.notes} aria-label="Item notes" data-contract-notes="true"><h3>Notes</h3>{model.notes.map((note, i) => <p key={`${note.label}-${i}`}>{!/^notes?$/i.test(note.label) && <span>{note.label}: </span>}{note.value}</p>)}</section>}
  </article>;
}
