"use client";

import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";
import { customerQuoteText, customerQuoteProductName } from "@/lib/crm/customer-quote-branding";
import { CONTRACT_ART_ROOT } from "@/lib/quote/contract-illustrations";
import { temporaryShadeSelected } from "@/lib/quote/temporary-shades";
import { ContractAnatomy } from "./ContractAnatomy";
import styles from "./QuoteLineItemCard.module.css";
import { sketchInches, shutterGeometryFromDimensions, type ShutterIllustrationGeometry } from '@/lib/quote/shutter-illustration-geometry';

type Props = {
  lineNumber: string | number;
  room: string;
  productType: string;
  optionLabel?: string;
  styleName?: string;
  options?: string[];
  valanceArtId?: string | null;
  price: ReactNode;
  priceLabel?: string;
  quantity?: number;
  dimensions?: string | null;
  illustrationGeometry?: ShutterIllustrationGeometry;
  actions?: ReactNode;
  selection?: ReactNode;
  notice?: ReactNode;
};

/** Shared staff/customer presentation. All money and mutations belong to the caller. */
export function QuoteLineItemCard({
  lineNumber, room, productType, optionLabel, styleName = "", options = [], valanceArtId,
  price, priceLabel = "Item total", quantity = 1, dimensions, illustrationGeometry, actions, selection, notice,
}: Props) {
  const headingId = useId();
  const widthText = dimensions?.split(/[×x]/i)[0]?.replace(/W\s*$/i, '').trim();
  const width = widthText ? sketchInches(widthText) ?? undefined : undefined;
  const temporary = temporaryShadeSelected(options);
  const number = typeof lineNumber === "number" ? String(lineNumber).padStart(2, "0") : lineNumber;
  return (
    <article className={styles.card} aria-labelledby={headingId} data-quote-line-card="805-light">
      <header className={styles.contractToolbar}>
        <div>
          {selection ? <div className={styles.selection}>{selection}</div> : null}
          <div className={styles.meta}>
            <span className={styles.number}>Item {number}</span>
            {optionLabel ? <span className={styles.option}>Option {customerQuoteText(optionLabel) || "A"}</span> : null}
          </div>
          <h2 className={styles.room} id={headingId}>{customerQuoteText(room) || 'Room not specified'}</h2>
          <p className={styles.product}>{customerQuoteProductName(productType)}</p>
          {notice ? <div className={styles.notice}>{notice}</div> : null}
        </div>
        <div className={styles.measurements}>{width ? <span>Width <strong>{width}″</strong></span> : null}<span>Quantity <strong>{quantity}</strong></span></div>
        <div className={styles.cost}>
          <p className={styles.priceLabel}>{priceLabel}</p><div className={styles.price}>{price}</div>
          {actions ? <details className={`${styles.priceEditor} no-print`}><summary>Edit price</summary><div className={styles.actions}>{actions}</div></details> : null}
        </div>
      </header>
      <div className={styles.anatomy}>
        <ContractAnatomy productType={productType} room={room} options={options} styleName={styleName}
          width={width} quantity={quantity} valanceArtId={valanceArtId}
          illustrationGeometry={illustrationGeometry ?? shutterGeometryFromDimensions(dimensions, options)}
          showHeader={false} layout="grouped" lineRouting="around" summaryStyle="current"
          afterIllustration={temporary ? <footer className={styles.included} data-temporary-shade="included">
        <img src={`${CONTRACT_ART_ROOT}/temporary-shade.webp`} alt="Temporary pleated paper shade — pencil illustration" width={30} height={51} />
        <div className={styles.includedCopy}><p>Complimentary temporary paper shade</p><span>Included with this item</span></div>
        <span className={styles.noCharge}><Check size={14} aria-hidden="true" />No charge</span>
      </footer> : null} />
      </div>
    </article>
  );
}
