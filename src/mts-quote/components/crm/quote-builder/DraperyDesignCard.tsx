'use client';

import { useEffect, useId, useState } from 'react';
import type { DesignCardProps } from './DesignCard';
import { DRAPERY_STYLES, draperyStyle, draperySketch, draperyReferencePhoto, draperyStyleOptions, parseDraperyPrice } from '@/lib/quote/drapery';
import { ContractProductIllustration } from '@/components/quote/ContractProductIllustration';
import { PRODUCT_TYPES } from '@mts/lib/quoteConstants';
import type { SalesQuoteDesign } from '@mts/types/quote';
import styles from './DraperyDesignCard.module.css';

function TextField({ label, value, multiline = false, onCommit }: {label: string; value: string; multiline?: boolean; onCommit: (value: string) => void}) {
  const [draft, setDraft] = useState(value);
  const id = useId();
  useEffect(() => setDraft(value), [value]);
  const shared = { id, value: draft, maxLength: multiline ? 2000 : 250, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value), onBlur: () => { if (draft !== value) onCommit(draft.trim()); } };
  return <div className={`${styles.field} ${multiline ? styles.wide : ""}`}><label htmlFor={id}>{label}</label>{multiline ? <textarea {...shared} rows={3} /> : <input {...shared} />}</div>;
}

/** Dedicated manual editor: manufacturer auto-pricing hooks never run for drapery. */
export function DraperyDesignCard(props: DesignCardProps) {
  const { lineItem, designs, onUpdateDesign, onSaveLinePrice } = props;
  const design = designs.find(row => row.variant === 'A');
  const options = design?.options_json ?? {};
  const selected = draperyStyle(options.drapery_style);
  const reference = selected ? draperyReferencePhoto(selected) : null;
  const hasPrice = options.manual_price_override === true && design?.unit_price != null;
  const [priceDraft, setPriceDraft] = useState(hasPrice ? String(design.unit_price) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setPriceDraft(hasPrice ? String(design!.unit_price) : ''); }, [design?.unit_price, hasPrice]);
  const update = (fields: Partial<SalesQuoteDesign>) => onUpdateDesign({line_item_id: lineItem.id, variant: 'A', product_type: 'Drapery', ...fields}, 'user');
  const updateOption = (key: string, value: string) => update({ options_json: {...options, [key]: value} });
  const savePrice = async () => {
    const amount = parseDraperyPrice(priceDraft);
    if (amount === null) { setError('Enter a price of $0 or more, with up to two decimal places.'); return; }
    if (!selected) { setError('Select a drapery style before saving its price.'); return; }
    setSaving(true); setError(''); setSaved(false);
    try { await onSaveLinePrice('A', amount); setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Price could not be saved. Your entry is still here.'); }
    finally { setSaving(false); }
  };
  const value = (key: string) => typeof options[key] === 'string' ? options[key] as string : '';
  return <section className={styles.card} data-drapery-design={lineItem.id}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>#{props.lineNumberLabel ?? props.lineNumber} · Drapery</p><h3>{lineItem.room_name}</h3><p>{lineItem.width_whole}{lineItem.width_fraction !== '0' ? ` ${lineItem.width_fraction}` : ''}″ × {lineItem.height_whole}{lineItem.height_fraction !== '0' ? ` ${lineItem.height_fraction}` : ''}″ · Qty {lineItem.quantity}</p></div>
      <div className={styles.actions}>
        {props.onOpenMeasurement && <button type="button" onClick={props.onOpenMeasurement}>Measurements</button>}
        {props.onCopyItem && <button type="button" onClick={props.onCopyItem}>Duplicate</button>}
        <button type="button" onClick={props.onStack}>Stack</button>
        {props.onDelete && <button type="button" onClick={props.onDelete}>Delete</button>}
      </div>
    </header>
    <div className={styles.body}>
      <p className={styles.eyebrow}>Drapery style</p>
      <div className={styles.gallery} role="group" aria-label="Drapery style">
        {DRAPERY_STYLES.map(style => <button type="button" key={style.id} aria-pressed={selected?.id === style.id} onClick={() => { update({options_json: draperyStyleOptions(style.id, options)}); setError(''); }}><img src={draperySketch(style)} alt="" width={240} height={160} /><span>{style.title}</span></button>)}
      </div>
      <div className={styles.editor}>
        <div className={styles.fields}>
          <TextField label="Room" value={lineItem.room_name} onCommit={v => props.onUpdateRoomName?.(v)} />
          <label><span>Quantity</span><input key={`quantity-${lineItem.quantity}`} type="number" min={1} step={1} defaultValue={lineItem.quantity} onBlur={e => { const n = Number(e.target.value); if (Number.isSafeInteger(n) && n > 0) props.onUpdateQuantity?.(n); else e.target.value = String(lineItem.quantity); }} /></label>
          <TextField key={`description-${selected?.id}`} label="Customer description" value={value('drapery_description')} multiline onCommit={v => updateOption('drapery_description', v)} />
          <TextField label="Fabric / color" value={design?.fabric ?? ''} onCommit={v => update({fabric: v || null})} />
          <TextField label="Hardware" value={value('drapery_hardware')} onCommit={v => updateOption('drapery_hardware', v)} />
          <TextField label="Lining" value={value('drapery_lining')} onCommit={v => updateOption('drapery_lining', v)} />
          <TextField label="Fullness" value={value('drapery_fullness')} onCommit={v => updateOption('drapery_fullness', v)} />
          <TextField label="Draw / stack" value={value('drapery_draw')} onCommit={v => updateOption('drapery_draw', v)} />
          <TextField label="Supplier" value={design?.supplier ?? ''} onCommit={v => update({supplier: v || null})} />
          <TextField label="Additional drapery details" value={value('drapery_details')} multiline onCommit={v => updateOption('drapery_details', v)} />
        </div>
        <aside className={styles.preview} aria-label="Selected drapery reference">
          {selected ? <><ContractProductIllustration productType="Drapery" options={[`Drapery style: ${selected.title}`]} /><strong>{selected.title}</strong><p>Style reference · pencil sketch</p>{reference ? <details><summary>View style photo</summary><img src={reference} alt={`${selected.title} website style reference`} width={320} height={240} /></details> : <p>Pencil reference for Modern Ring Top</p>}</> : <p>Select a style to preview its sketch.</p>}
        </aside>
      </div>
      <div className={styles.pricing}>
        <div><strong>Manual pricing</strong><p>Enter the price per item. Quantity is applied to the line total.</p></div>
        <label><span>Unit price ($)</span><input aria-label="Drapery unit price" type="text" inputMode="decimal" value={priceDraft} onChange={e => {setPriceDraft(e.target.value);setSaved(false);}} placeholder="Enter price" /></label>
        <button type="button" disabled={saving} onClick={savePrice}>{saving ? 'Saving…' : 'Save price'}</button>
        <output aria-label="Drapery saved line total">{hasPrice ? `$${(Number(design!.unit_price) * lineItem.quantity).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}` : 'Price required'}</output>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {saved && <p role="status">Price saved.</p>}
      {props.onChangeProductType && <details className={styles.changeType}><summary>Change product type</summary><select aria-label="Product type" value="Drapery" onChange={e => props.onChangeProductType?.(e.target.value)}>{PRODUCT_TYPES.map(type => <option key={type}>{type}</option>)}</select></details>}
    </div>
  </section>;
}
