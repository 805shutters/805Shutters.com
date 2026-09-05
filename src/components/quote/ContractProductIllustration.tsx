import { CONTRACT_ART_ROOT, contractIllustration } from "@/lib/quote/contract-illustrations";
import { valanceArtwork, valanceIllustration } from "@/lib/quote/valance-illustrations";
import styles from "./ContractProductIllustration.module.css";

export function ContractProductIllustration({ productType, options = [], valanceArtId }: { productType: string; options?: readonly string[]; valanceArtId?: string | null }) {
  const art = contractIllustration(productType, options);
  const valance = valanceArtwork(valanceArtId === undefined ? valanceIllustration(productType, options) : valanceArtId);
  if (!art && !valance) return null;
  const panels = art?.panels || 0;
  return (
    <figure className={styles.figure} data-contract-illustration="c-v1">
      {art ? panels ? <div className={styles.shutterPanels} style={{width: `min(100%, calc(${panels} * var(--shutter-panel-width)))`}} role="img" aria-label={art.alt} data-panel-count={panels}>
        {Array.from({ length: panels }, (_, index) => <img key={index} src={art.src} alt="" className={styles.shutterPanel} style={{ width: `${100 / panels}%` }} />)}
      </div> : <img src={art.src} alt={art.alt} width={160} height={160} className={styles.product} style={art.mirror ? { transform: "scaleX(-1)" } : undefined} /> : null}
      {art?.remote ? <img src={`${CONTRACT_ART_ROOT}/remote.webp`} alt="Motorized shade handheld control" width={62} height={62} className={styles.remote} /> : null}
      {valance ? <figcaption className={styles.valance} data-valance-artwork={valance.id}><img src={valance.src} alt={`${valance.label} — pencil illustration`} width={160} height={60} /><span>{valance.label}</span></figcaption> : null}
    </figure>
  );
}
