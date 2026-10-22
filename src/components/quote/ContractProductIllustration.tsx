import { CONTRACT_ART_ROOT, contractIllustration } from "@/lib/quote/contract-illustrations";
import { valanceArtwork, valanceIllustration, rollerTopTreatmentSelected, rollerValanceLayout } from "@/lib/quote/valance-illustrations";
import { temporaryShadeSelected } from "@/lib/quote/temporary-shades";
import styles from "./ContractProductIllustration.module.css";
import { specialtyShutterSketch } from "@/lib/quote/specialty-shutter-illustrations";
import { SpecialtyShutterSketch } from "./SpecialtyShutterSketch";
import { customerQuoteProductName, customerQuoteText } from '@/lib/crm/customer-quote-branding';
import type { ShutterIllustrationGeometry } from '@/lib/quote/shutter-illustration-geometry';
import { anatomyReferenceArtwork } from '@/lib/quote/anatomy-reference-artwork';
import { anatomyShutterStudy } from '@/lib/quote/anatomy-shutter-study';
import { anatomyShadeStudy, OPTION_ART_ROOT } from '@/lib/quote/anatomy-shade-study';
import { anatomyControlAnchor } from '@/lib/quote/anatomy-control-anchor';
import { shutterFrameProfile, type ShutterFrameProfile } from '@/lib/quote/shutter-frame-profiles';
import { ValanceDetail } from './ValanceDetail';
import { contractProductFamily, contractProductType } from '@/lib/quote/contract-product-family';
import { ShutterReferenceArtwork } from './ShutterReferenceArtwork';
import type { CSSProperties } from 'react';

export function ContractProductIllustration({ productType, options = [], frameProfile: selectedFrameProfile, valanceArtId, showTemporaryShade = true, illustrationGeometry, size = "compact" }: { productType: string; options?: readonly string[]; frameProfile?: ShutterFrameProfile | null; valanceArtId?: string | null; showTemporaryShade?: boolean; illustrationGeometry?: ShutterIllustrationGeometry; size?: "compact" | "anatomy" }) {
  const frameProfile = selectedFrameProfile === undefined ? shutterFrameProfile(productType, options) : selectedFrameProfile;
  const displayProductType = customerQuoteProductName(productType);
  // Prefer the original graphite panels at every size; procedural studies are
  // reserved for configurations without matching approved pencil artwork.
  const pencilArt = contractIllustration(displayProductType, options);
  const rectangleStudy = size === 'anatomy' ? anatomyShutterStudy(productType, options) : null;
  const specialty = specialtyShutterSketch(productType, options) || (!pencilArt?.panels || rectangleStudy?.noFrame ? rectangleStudy : null);
  const shadeStudy = size === 'anatomy' && !specialty ? anatomyShadeStudy(productType, options) : null;
  const resolvedArt = specialty ? null : shadeStudy || pencilArt;
  // Restore the complete approved September 5 drawing. Never stretch individual
  // panel crops into a replacement assembly; selected specifications remain below.
  const art = resolvedArt?.panels ? {
    ...resolvedArt,
    src: `${CONTRACT_ART_ROOT}/shutters.webp`,
    alt: 'Shutters — original pencil illustration',
    panels: undefined,
    operationReference: undefined,
    referenceNote: 'Original shutter artwork. Selected configuration is specified in the labels.',
  } : resolvedArt;
  const selectedValance = valanceArtwork(valanceArtId === undefined ? valanceIllustration(productType, options) : valanceArtId);
  const valance = selectedValance && (selectedValance.products as readonly string[]).includes(contractProductType(productType).toLowerCase()) ? selectedValance : null;
  const installedBlind = !!valance && !(valance.products as readonly string[]).includes('roller shades') && !!art && !art.referenceNote;
  const blindRight = installedBlind && (art!.mirror || art!.src.includes('wand-right'));
  const roller = !!art?.src.includes("/roller-open-roll");
  const integratedValance = roller && valance && (valance.products as readonly string[]).includes("roller shades") ? valance : null;
  const rollerProfile = valance && (valance.products as readonly string[]).includes('roller shades');
  const valanceLayout = rollerProfile ? rollerValanceLayout(valance!.id, options) : null;
  const valanceStyle = valanceLayout ? { '--valance-height': `${valanceLayout.height}%`, '--valance-top': `${valanceLayout.top}%` } as CSSProperties : undefined;
  const coveredRoller = roller && (!!integratedValance || rollerTopTreatmentSelected(options));
  const productSrc = coveredRoller && !integratedValance ? art!.src.replace("roller-open-roll", "roller") : art?.src;
  const controlAnchor = size === 'anatomy' ? anatomyControlAnchor(productType, options, art) : null;
  const temporary = showTemporaryShade && temporaryShadeSelected(options);
  const pencilReference = !specialty && !art ? anatomyReferenceArtwork(productType, options) : null;
  return (
    <div className={temporary ? styles.companions : undefined}>
    <figure className={`${styles.figure} ${size === "anatomy" ? styles.anatomy : ""}`} data-contract-illustration="c-v1" data-official-sketch-family={contractProductFamily(productType)}>
      {!specialty && !art ? <ValanceDetail id={valance?.id ?? null}><div className={styles.shadeStudy} style={valanceStyle} data-valance-body={valance ? true : undefined}>
        {pencilReference ? <><img src={pencilReference.src} alt={customerQuoteText(pencilReference.alt)} width={320} height={320} className={styles.product} data-family-reference="true" /><p className={styles.reference}>Official 805 category sketch · selected configuration is specified in the labels.</p></> : <p role="status" data-official-sketch-required="true">Official 805 sketch required for this product.</p>}
        {valance ? <img src={valance.src} alt={`${valance.label} — pencil illustration`} className={rollerProfile ? styles.rollerValance : styles.blindValance} data-valance-artwork={valance.id} /> : null}
      </div></ValanceDetail> : null}
      {specialty ? <><SpecialtyShutterSketch sketch={specialty} geometry={illustrationGeometry} frameProfile={frameProfile} /><figcaption className={styles.reference}><strong>{specialty.label}</strong><span>{illustrationGeometry ? 'Proportioned to opening · shape reference' : 'Shape & control illustration · measurements pending'}</span>{specialty.curvedTilt === "rear" ? <span>Curved section: rear tilt rod</span> : null}{specialty.referenceNote ? <span>{specialty.referenceNote}</span> : null}</figcaption></> : null}
      {art ? <ValanceDetail id={valance?.id ?? null}><div data-valance-body={valance ? true : undefined} className={roller ? `${styles.rollerAssembly} ${integratedValance ? styles.joinedValance : ''}` : styles.shadeStudy} style={valanceStyle} data-shade-fold={shadeStudy?.fold} data-roller-top-treatment={roller ? coveredRoller ? "valance" : "open-roll" : undefined}>
        {resolvedArt?.panels ? <ShutterReferenceArtwork options={options} /> : <img src={installedBlind ? `/images/contract-illustrations/valances-installed-v1/${valance!.id}.webp` : productSrc} data-anatomy-anchor={!installedBlind && controlAnchor?.kind === 'wand' ? 'wand' : undefined} alt={roller ? `${art.alt} · ${integratedValance ? integratedValance.label : coveredRoller ? "Valance / top cover" : "Open roll, no valance"}` : customerQuoteText(art.alt)} width={160} height={160} className={styles.product} style={(installedBlind ? blindRight : art.mirror) ? { transform: "scaleX(-1)" } : undefined} />}
        {installedBlind ? <><span data-anatomy-anchor="wand" className={styles.installedWand} style={{left: `${(blindRight ? 1-(valance!.manufacturer === 'lotus' ? .215 : .245) : valance!.manufacturer === 'lotus' ? .215 : .245)*100}%`}} /><span data-valance-artwork={valance!.id} className={styles.installedHead} /></> : null}
        {valance && !roller && !installedBlind ? <img src={valance.src} alt={`${valance.label} over the blind`} className={rollerProfile ? styles.rollerValance : styles.blindValance} data-valance-artwork={valance.id} /> : null}
        {integratedValance ? <img src={integratedValance.src} alt={`${integratedValance.label} over the roller shade`} width={160} height={60} className={styles.rollerValance} data-valance-artwork={integratedValance.id} /> : null}
        {shadeStudy?.loopSide ? <svg viewBox="510 20 120 1335" role="img" aria-label={`Continuous cord loop · ${shadeStudy.loopSide}`} data-anatomy-anchor="cord-loop" data-control-side={shadeStudy.loopSide} className={`${styles.shadeLoop} ${shadeStudy.loopSide === 'left' ? styles.loopLeft : styles.loopRight}`}><image href={`${OPTION_ART_ROOT}/cord-loop.png`} width="1145" height="1374" /></svg> : null}
        {controlAnchor?.kind === 'pull-tab' ? <img src={`${OPTION_ART_ROOT}/cordless-pull-tab.png`} alt="Small cordless pull tab" data-anatomy-anchor="pull-tab" className={styles.pullTab} style={{left: `${controlAnchor.point[0]}%`, top: `${controlAnchor.point[1]}%`}} /> : null}
      </div></ValanceDetail> : null}
      {integratedValance ? <figcaption className={styles.rollerLabel}>{integratedValance.label}</figcaption> : null}
      {art?.referenceNote ? <figcaption className={styles.reference}><strong>Product reference</strong><span>{art.referenceNote}</span></figcaption> : null}
      {art?.operationReference ? <figcaption className={styles.operation}>
        {art.panels ? <img src={art.operationReference.src} alt={art.operationReference.label} width={160} height={140} /> : null}
        <span>{art.operationReference.label}</span>
      </figcaption> : null}
      {art?.remote ? <img src={`${CONTRACT_ART_ROOT}/remote.webp`} alt="Motorized shade handheld control" data-anatomy-anchor="remote" width={62} height={62} className={styles.remote} /> : null}
    </figure>
    {temporary ? <figure className={styles.temporary} data-temporary-shade="included"><img src={`${CONTRACT_ART_ROOT}/temporary-shade.webp`} alt="Temporary pleated paper shade — pencil illustration" width={76} height={140} /><figcaption>Complementary temporary paper shade</figcaption></figure> : null}
    </div>
  );
}
