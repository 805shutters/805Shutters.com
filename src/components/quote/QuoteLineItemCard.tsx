"use client";

import { useId, useState, type ReactNode } from "react";
import { Check, ChevronDown, Layers, List, SlidersHorizontal, SwatchBook } from "lucide-react";
import { customerQuoteProductName, customerQuoteText } from "@/lib/crm/customer-quote-branding";
import { quoteSpecificationGroups } from "@/lib/quote/quote-line-item-presentation";
import { CONTRACT_ART_ROOT } from "@/lib/quote/contract-illustrations";
import { temporaryShadeSelected } from "@/lib/quote/temporary-shades";
import { ContractProductIllustration } from "./ContractProductIllustration";
import styles from "./QuoteLineItemCard.module.css";

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
  actions?: ReactNode;
  selection?: ReactNode;
  notice?: ReactNode;
};

const groupIcons = { finish: SwatchBook, operation: SlidersHorizontal, construction: Layers, additional: List };

/** Shared staff/customer presentation. All money and mutations belong to the caller. */
export function QuoteLineItemCard({
  lineNumber, room, productType, optionLabel, styleName = "", options = [], valanceArtId,
  price, priceLabel = "Item total", quantity = 1, dimensions, actions, selection, notice,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const detailsId = useId();
  const headingId = useId();
  const groups = quoteSpecificationGroups(styleName, options);
  const temporary = temporaryShadeSelected(options);
  const number = typeof lineNumber === "number" ? String(lineNumber).padStart(2, "0") : lineNumber;
  return (
    <article className={styles.card} aria-labelledby={headingId} data-quote-line-card="805-light">
      <header className={styles.summary}>
        <div className={styles.identity}>
          {selection ? <div className={styles.selection}>{selection}</div> : null}
          <div className={styles.meta}>
            <span className={styles.number}>Item {number}</span>
            {optionLabel ? <span className={styles.option}>Option {customerQuoteText(optionLabel) || "A"}</span> : null}
          </div>
          <h3 id={headingId} className={styles.room}>{room || "Room not specified"}</h3>
          <p className={styles.product}><span>{customerQuoteProductName(productType)}</span></p>
          <div className={styles.measurements}>
            {dimensions ? <span>{dimensions}</span> : null}
            <span>Quantity {quantity}</span>
          </div>
          {notice ? <div className={styles.notice}>{notice}</div> : null}
        </div>
        <div className={styles.artwork}>
          <ContractProductIllustration productType={productType} options={options} valanceArtId={valanceArtId} showTemporaryShade={false} />
        </div>
        <div className={styles.cost}>
          <div><p className={styles.priceLabel}>{priceLabel}</p><div className={styles.price}>{price}</div></div>
          <div className={`${styles.actions} no-print`}>
            {groups.length > 0 ? <button type="button" className={styles.toggle} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(!expanded)}>
              {expanded ? "Hide details" : "Show details"}<ChevronDown size={13} aria-hidden="true" className={expanded ? styles.expandedIcon : undefined} />
            </button> : null}
            {actions}
          </div>
        </div>
      </header>
      {groups.length > 0 ? <div id={detailsId} className={styles.specifications} hidden={!expanded}>
        {groups.map((group) => {
          const Icon = groupIcons[group.id];
          return <section key={group.id} className={group.id === "additional" ? styles.additional : styles.group}>
            <h4 className={styles.groupTitle}><Icon size={14} aria-hidden="true" />{group.title}</h4>
            <dl className={styles.detailList}>{group.details.map((detail) => <div key={`${detail.label}:${detail.value}`} className={styles.detail}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>
          </section>;
        })}
      </div> : null}
      {temporary ? <footer className={styles.included} data-temporary-shade="included">
        <img src={`${CONTRACT_ART_ROOT}/temporary-shade.webp`} alt="Temporary pleated paper shade — pencil illustration" width={30} height={51} />
        <div className={styles.includedCopy}><p>Complimentary temporary paper shade</p><span>Included with this item</span></div>
        <span className={styles.noCharge}><Check size={14} aria-hidden="true" />No charge</span>
      </footer> : null}
    </article>
  );
}
