import type { ReactNode } from 'react';
import { valanceArtwork } from '@/lib/quote/valance-illustrations';
import styles from './ValanceDetail.module.css';

/** Show the complete selected pencil profile below its installed treatment. */
export function ValanceDetail({ id, children }: { id: string | null; children: ReactNode }) {
  const art = valanceArtwork(id);
  if (!art) return children;
  return <div className={styles.stage} data-valance-detail={id} data-valance-layout="below">
    <div className={styles.body}>{children}</div>
    <figure className={styles.profile}>
      <img src={art.src} alt={`${art.label} — full pencil profile`} width={640} height={240} />
      <figcaption>{art.label}</figcaption>
    </figure>
  </div>;
}
