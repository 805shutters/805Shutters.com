"use client";

import { useId, useRef, type ReactNode } from 'react';
import { valanceArtwork } from '@/lib/quote/valance-illustrations';
import styles from './ValanceDetail.module.css';

/** The inset uses the approved installed sketch, focused on its actual end profile. */
export function ValanceDetail({ id, mirror = false, children }: { id: string | null; mirror?: boolean; children: ReactNode }) {
  const clip = useId().replace(/:/g, '');
  const dialog = useRef<HTMLDialogElement>(null);
  const art = valanceArtwork(id);
  if (!art) return children;
  const src = `/images/contract-illustrations/valances-installed-v1/${art.id}.webp`;
  const point = mirror ? [.16, .125] : [.85, .145];
  const detail = (key: string) => <svg viewBox="0 0 180 180" role="img" aria-label={`${art.label} — pencil detail`}>
    <defs><clipPath id={`${clip}-${key}`}><circle cx="90" cy="90" r="85" /></clipPath></defs>
    <circle cx="90" cy="90" r="85" fill="white" />
    <g clipPath={`url(#${clip}-${key})`}><g transform={mirror ? 'translate(180 0) scale(-1 1)' : undefined}>
      <image href={src} x={90-point[0]*1100} y={90-point[1]*1100} width="1100" height="1100" />
    </g></g>
    <circle cx="90" cy="90" r="85" fill="none" stroke="#89937f" strokeWidth="1.6" />
  </svg>;
  return <div className={styles.stage} data-valance-detail={id}>
    <div className={styles.body}>{children}</div>
    <svg className={styles.leader} viewBox="0 0 1100 850" aria-hidden="true"><path d={`M ${35+(mirror ? .84 : .85)*800} ${25+point[1]*800} L 841 ${25+point[1]*800} Q 851 ${25+point[1]*800} 858 116 L 884 100`} fill="none" stroke="#89937f" strokeWidth="1.4" /><circle cx={35+(mirror ? .84 : .85)*800} cy={25+point[1]*800} r="4" fill="white" stroke="#89937f" strokeWidth="1.4" /></svg>
    <div className={styles.inset}>
      <button type="button" onClick={() => dialog.current?.showModal()} aria-label={`Enlarge ${art.label} detail`} className={styles.bubble}>{detail('inset')}</button>
      <span className={styles.title}>{art.label}</span>
    </div>
    <dialog ref={dialog} className={styles.dialog} aria-label={`${art.label} close-up`} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="Close valance detail">Close ×</button>
      <h2>{art.label}</h2>{detail('large')}
    </dialog>
  </div>;
}
