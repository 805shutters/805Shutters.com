import { CONTRACT_ART_ROOT, contractIllustration } from "@/lib/quote/contract-illustrations";
import { valanceArtwork, valanceIllustration, rollerTopTreatmentSelected, rollerValanceLayout } from "@/lib/quote/valance-illustrations";
import { temporaryShadeSelected } from "@/lib/quote/temporary-shades";
import styles from "./ContractProductIllustration.module.css";
import { specialtyShutterSketch } from "@/lib/quote/specialty-shutter-illustrations";
import { SpecialtyShutterSketch } from "./SpecialtyShutterSketch";
import { ShutterAssembly } from "./ShutterAssembly";
import { ProductReferenceSketch } from './ProductReferenceSketch';
import { customerQuoteProductName, customerQuoteText } from '@/lib/crm/customer-quote-branding';
import type { ShutterIllustrationGeometry } from '@/lib/quote/shutter-illustration-geometry';
import { anatomyReferenceArtwork } from '@/lib/quote/anatomy-reference-artwork';
import { anatomyShutterStudy } from '@/lib/quote/anatomy-shutter-study';
import { anatomyShadeStudy, OPTION_ART_ROOT } from '@/lib/quote/anatomy-shade-study';
import { anatomyControlAnchor } from '@/lib/quote/anatomy-control-anchor';
import type { CSSProperties } from 'react';

export function ContractProductIllustration({ productType, options = [], valanceArtId, showTemporaryShade = true, illustrationGeometry, size = "compact" }: { productType: string; options?: readonly string[]; valanceArtId?: string | null; showTemporaryShade?: boolean; illustrationGeometry?: ShutterIllustrationGeometry; size?: "compact" | "anatomy" }) {
  const displayProductType = customerQuoteProductName(productType);
  const specialty = specialtyShutterSketch(productType, options) || (size === 'anatomy' ? anatomyShutterStudy(productType, options) : null);
  const shadeStudy = size === 'anatomy' && !specialty ? anatomyShadeStudy(productType, options) : null;
  const art = specialty ? null : shadeStudy || contractIllustration(displayProductType, options);
  const valance = valanceArtwork(valanceArtId === undefined ? valanceIllustration(productType, options) : valanceArtId);
  const roller = !!art?.src.includes("/roller-open-roll");
  const integratedValance = roller && valance && (valance.products as readonly string[]).includes("roller shades") ? valance : null;
  const valanceLayout = integratedValance ? rollerValanceLayout(integratedValance.id, options) : null;
  const valanceStyle = valanceLayout ? { '--valance-height': `${valanceLayout.height}%`, '--valance-top': `${valanceLayout.top}%` } as CSSProperties : undefined;
  const coveredRoller = roller && (!!integratedValance || rollerTopTreatmentSelected(options));
  const productSrc = coveredRoller && !integratedValance ? art!.src.replace("roller-open-roll", "roller") : art?.src;
  const controlAnchor = size === 'anatomy' ? anatomyControlAnchor(productType, options, art) : null;
  const temporary = showTemporaryShade && temporaryShadeSelected(options);
  const panels = art?.panels || 0;
  const pencilReference = size === 'anatomy' && !specialty && !art ? anatomyReferenceArtwork(productType, options) : null;
  return (
    <div className={temporary ? styles.companions : undefined}>
    <figure className={`${styles.figure} ${size === "anatomy" ? styles.anatomy : ""}`} data-contract-illustration="c-v1">
      {!specialty && !art ? pencilReference ? <img src={pencilReference.src} alt={customerQuoteText(pencilReference.alt)} width={320} height={320} className={styles.product} data-family-reference="true" /> : <ProductReferenceSketch productType={displayProductType} options={options} /> : null}
      {specialty ? <><SpecialtyShutterSketch sketch={specialty} geometry={illustrationGeometry} /><figcaption className={styles.reference}><strong>{specialty.label}</strong><span>{illustrationGeometry ? 'Proportioned to opening · shape reference' : 'Shape & control illustration · measurements pending'}</span>{specialty.curvedTilt === "rear" ? <span>Curved section: rear tilt rod</span> : null}{specialty.referenceNote ? <span>{specialty.referenceNote}</span> : null}</figcaption></> : null}
      {art ? panels ? <ShutterAssembly src={art.src} alt={art.alt} panels={panels} layout={art.shutterLayout || ""} geometry={illustrationGeometry} /> : <div className={roller ? `${styles.rollerAssembly} ${integratedValance ? styles.joinedValance : ''}` : styles.shadeStudy} style={integratedValance ? valanceStyle : undefined} data-shade-fold={shadeStudy?.fold} data-roller-top-treatment={roller ? coveredRoller ? "valance" : "open-roll" : undefined}>
        <img src={productSrc} alt={roller ? `${art.alt} · ${integratedValance ? integratedValance.label : coveredRoller ? "Valance / top cover" : "Open roll, no valance"}` : customerQuoteText(art.alt)} width={160} height={160} className={styles.product} style={art.mirror ? { transform: "scaleX(-1)" } : undefined} />
        {integratedValance ? <img src={integratedValance.src} alt={`${integratedValance.label} over the roller shade`} width={160} height={60} className={styles.rollerValance} data-valance-artwork={integratedValance.id} /> : null}
        {shadeStudy?.loopSide ? <svg viewBox="510 20 120 1335" role="img" aria-label={`Continuous cord loop · ${shadeStudy.loopSide}`} data-anatomy-anchor="cord-loop" data-control-side={shadeStudy.loopSide} className={`${styles.shadeLoop} ${shadeStudy.loopSide === 'left' ? styles.loopLeft : styles.loopRight}`}><image href={`${OPTION_ART_ROOT}/cord-loop.png`} width="1145" height="1374" /></svg> : null}
        {controlAnchor?.kind === 'pull-tab' ? <img src={`${OPTION_ART_ROOT}/cordless-pull-tab.png`} alt="Small cordless pull tab" data-anatomy-anchor="pull-tab" className={styles.pullTab} style={{left: `${controlAnchor.point[0]}%`, top: `${controlAnchor.point[1]}%`}} /> : null}
      </div> : null}
      {integratedValance ? <figcaption className={styles.rollerLabel}>{integratedValance.label}</figcaption> : null}
      {art?.referenceNote ? <figcaption className={styles.reference}><strong>Product reference</strong><span>{art.referenceNote}</span></figcaption> : null}
      {art?.operationReference ? <figcaption className={styles.operation}>
        {art.panels ? <img src={art.operationReference.src} alt={art.operationReference.label} width={160} height={140} /> : null}
        <span>{art.operationReference.label}</span>
      </figcaption> : null}
      {art?.remote ? <img src={`${CONTRACT_ART_ROOT}/remote.webp`} alt="Motorized shade handheld control" data-anatomy-anchor="remote" width={62} height={62} className={styles.remote} /> : null}
      {valance && !integratedValance ? <figcaption className={styles.valance} data-valance-artwork={valance.id}><img src={valance.src} alt={`${valance.label} — pencil illustration`} width={160} height={60} /><span>{valance.label}</span></figcaption> : null}
    </figure>
    {temporary ? <figure className={styles.temporary} data-temporary-shade="included"><img src={`${CONTRACT_ART_ROOT}/temporary-shade.webp`} alt="Temporary pleated paper shade — pencil illustration" width={76} height={140} /><figcaption>Complementary temporary paper shade</figcaption></figure> : null}
    </div>
  );
}
