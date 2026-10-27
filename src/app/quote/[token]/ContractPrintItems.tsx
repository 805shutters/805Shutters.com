"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { PublicQuote } from "@/lib/crm/public-quote";
import styles from "./ContractPrintItems.module.css";

export type ItemsPerPage = 1 | 2;

export function contractPrintPages<T>(items: T[], count: ItemsPerPage): T[][] {
  return Array.from({ length: Math.ceil(items.length / count) }, (_, index) => items.slice(index * count, (index + 1) * count));
}

/** The same live items are grouped only for print. No snapshot or money changes. */
export function ContractPrintItems({ items, count, quote }: { items: ReactNode[]; count: ItemsPerPage; quote: PublicQuote }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = () => {
      root.current?.querySelectorAll<HTMLElement>("[data-print-item]").forEach(slot => {
        const content = slot.firstElementChild as HTMLElement | null;
        if (!content || slot.clientHeight <= 1) return;
        content.style.zoom = "1";
        content.style.width = `${slot.clientWidth}px`;
        content.style.left = "0";
        // Scale the complete item, including long notes or multiple saved designs,
        // instead of clipping details or allowing a browser to split the card.
        const height = content.getBoundingClientRect().height;
        const scale = height ? Math.min(1, Math.max(0, slot.getBoundingClientRect().height - 1) / height) : 1;
        // zoom changes the layout size as well as the visual size; transform
        // alone lets Chromium paginate a second design before scaling it.
        content.style.zoom = String(scale);
        content.style.left = `${slot.clientWidth * (1 - scale) / (2 * scale)}px`;
      });
    };
    const clear = () => root.current?.querySelectorAll<HTMLElement>("[data-print-item] > div").forEach(item => {
      item.style.zoom = "";
      item.style.width = "";
      item.style.left = "";
    });
    const media = window.matchMedia("print");
    const changed = () => media.matches ? fit() : clear();
    window.addEventListener("beforeprint", fit);
    window.addEventListener("afterprint", clear);
    media.addEventListener("change", changed);
    if (media.matches) fit();
    return () => {
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("afterprint", clear);
      media.removeEventListener("change", changed);
    };
  }, [items, count]);

  return <div className={styles.pages} ref={root} data-contract-print-pages>
    {contractPrintPages(items, count).map((page, index) => <section className={styles.page} key={index} data-print-page data-items-per-page={count}>
      <header className={styles.header}>
        <div><strong>{quote.business.name}</strong><span>Contract {quote.quoteNumber}{quote.quoteLabel ? ` · Quote ${quote.quoteLabel}` : ""} · {quote.signed ? "Signed" : "For review"} · Items {index * count + 1}{page.length > 1 ? `–${index * count + page.length}` : ""} of {items.length}</span></div>
        <div><strong>{quote.customerName}</strong><span>{[quote.customerAddress, quote.customerPhone, quote.customerEmail].filter(Boolean).join(" · ")}</span></div>
        <small>Left and right are viewed from inside the room.</small>
      </header>
      <div className={styles.items}>
        {page.map((item, itemIndex) => <div className={styles.slot} data-print-item key={itemIndex}><div className={styles.content}>{item}</div></div>)}
      </div>
    </section>)}
  </div>;
}
