"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import styles from "./OperationsOverview.module.css";

export function InlineJobContract({ url, customerName, onClose }: { url: string | null; customerName: string; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [failed, setFailed] = useState(false);
  useEffect(() => () => observer.current?.disconnect(), []);
  function resizeDocument() {
    observer.current?.disconnect();
    setLoading(false);
    try {
      const doc = frame.current?.contentDocument;
      if (!doc?.body) return; // External PDFs retain their own document viewer.
      const fit = () => {
        if (frame.current) frame.current.style.height = `${Math.max(480, doc.body.scrollHeight, doc.documentElement.scrollHeight)}px`;
      };
      fit();
      observer.current = new ResizeObserver(fit);
      observer.current.observe(doc.body);
    } catch { /* Cross-origin documents can still be viewed or opened directly. */ }
  }
  return <section className={styles.contractPanel} aria-label={`Contract for ${customerName}`}>
    <header className={styles.contractHeader}>
      <h2>{customerName} · Contract</h2>
      <div>{url && <a href={url} target="_blank" rel="noopener noreferrer">Open separately <ExternalLink size={14} aria-hidden="true" /></a>}
      <button type="button" onClick={onClose}><X size={16} aria-hidden="true" />Close contract</button></div>
    </header>
    {!url ? <p role="status">No contract is linked to this job yet. Open the job to review its records.</p> : <>
      {loading && <p role="status">Loading contract…</p>}
      {failed && <p role="alert">The contract could not be displayed here. Use Open separately to view it.</p>}
      <iframe ref={frame} className={styles.contractFrame} title={`${customerName} full contract`} src={url} onLoad={resizeDocument} onError={() => { setLoading(false); setFailed(true); }} />
    </>}
  </section>;
}
