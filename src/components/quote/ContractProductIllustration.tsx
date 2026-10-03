import { CONTRACT_ART_ROOT, contractIllustration } from "@/lib/quote/contract-illustrations";
import { valanceArtwork, valanceIllustration, rollerTopTreatmentSelected } from "@/lib/quote/valance-illustrations";
import { temporaryShadeSelected } from "@/lib/quote/temporary-shades";
import styles from "./ContractProductIllustration.module.css";
import { ShutterAssembly } from "./ShutterAssembly";

export function ContractProductIllustration({ productType, options = [], valanceArtId, showTemporaryShade = true }: { productType: string; options?: readonly string[]; valanceArtId?: string | null; showTemporaryShade?: boolean }) {
  const art = contractIllustration(productType, options);
  const valance = valanceArtwork(valanceArtId === undefined ? valanceIllustration(productType, options) : valanceArtId);
  const roller = !!art?.src.includes("/roller-open-roll");
  const integratedValance = roller && valance && (valance.products as readonly string[]).includes("roller shades") ? valance : null;
  const coveredRoller = roller && (!!integratedValance || rollerTopTreatmentSelected(options));
  const productSrc = coveredRoller && !integratedValance ? art!.src.replace("roller-open-roll", "roller") : art?.src;
  const temporary = showTemporaryShade && temporaryShadeSelected(options);
  if (!art && !valance && !temporary) return null;
  const panels = art?.panels || 0;
  return (
    <div className={temporary ? styles.companions : undefined}>
    <figure className={styles.figure} data-contract-illustration="c-v1">
      {art ? panels ? <ShutterAssembly src={art.src} alt={art.alt} panels={panels} layout={art.shutterLayout || ""} /> : <div className={roller ? styles.rollerAssembly : undefined} data-roller-top-treatment={roller ? coveredRoller ? "valance" : "open-roll" : undefined}>
        <img src={productSrc} alt={roller ? `${art.alt} · ${integratedValance ? integratedValance.label : coveredRoller ? "Valance / top cover" : "Open roll, no valance"}` : art.alt} width={160} height={160} className={styles.product} style={art.mirror ? { transform: "scaleX(-1)" } : undefined} />
        {integratedValance ? <img src={integratedValance.src} alt={`${integratedValance.label} over the roller shade`} width={160} height={60} className={styles.rollerValance} data-valance-artwork={integratedValance.id} /> : null}
      </div> : null}
      {integratedValance ? <figcaption className={styles.rollerLabel}>{integratedValance.label}</figcaption> : null}
      {art?.referenceNote ? <figcaption className={styles.reference}><strong>Product reference</strong><span>{art.referenceNote}</span></figcaption> : null}
      {art?.operationReference ? <figcaption className={styles.operation}>
        {art.panels ? <img src={art.operationReference.src} alt={art.operationReference.label} width={160} height={140} /> : null}
        <span>{art.operationReference.label}</span>
      </figcaption> : null}
      {art?.remote ? <img src={`${CONTRACT_ART_ROOT}/remote.webp`} alt="Motorized shade handheld control" width={62} height={62} className={styles.remote} /> : null}
      {valance && !integratedValance ? <figcaption className={styles.valance} data-valance-artwork={valance.id}><img src={valance.src} alt={`${valance.label} — pencil illustration`} width={160} height={60} /><span>{valance.label}</span></figcaption> : null}
    </figure>
    {temporary ? <figure className={styles.temporary} data-temporary-shade="included"><img src={`${CONTRACT_ART_ROOT}/temporary-shade.webp`} alt="Temporary pleated paper shade — pencil illustration" width={76} height={140} /><figcaption>Complementary temporary paper shade</figcaption></figure> : null}
    </div>
  );
}
