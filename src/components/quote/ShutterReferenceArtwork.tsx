import { CONTRACT_ART_ROOT } from '@/lib/quote/contract-illustrations';
import { SHUTTER_REFERENCE_SIZE, SHUTTER_REFERENCE_TARGETS } from '@/lib/quote/shutter-anatomy-targets';
import styles from './ContractProductIllustration.module.css';

/** Keep the approved drawing and its attachment regions in the same coordinate system. */
export function ShutterReferenceArtwork({ options }: {options: readonly string[]}) {
  const frontTilt = options.some(o => /^(tilt|tilt type):/i.test(o) && !/hidden|invisible|in stile/i.test(o));
  const divider = options.some(o => /^divider rail(?: count)?:\s*(yes|true|[1-9])/i.test(o));
  return <>
    <div className={styles.shutterReference} data-shutter-reference="original-v1">
      <img src={`${CONTRACT_ART_ROOT}/shutters.webp`} alt="Shutters — original pencil illustration" width={627} height={627} className={styles.product} data-original-shutter-art="true" />
      {Object.entries(SHUTTER_REFERENCE_TARGETS).map(([name, [x,y,width,height]]) => <span key={name} data-shutter-target={name} aria-hidden="true" className={styles.attachmentRegion} style={{left:`${x/SHUTTER_REFERENCE_SIZE*100}%`,top:`${y/SHUTTER_REFERENCE_SIZE*100}%`,width:`${width/SHUTTER_REFERENCE_SIZE*100}%`,height:`${height/SHUTTER_REFERENCE_SIZE*100}%`}} />)}
    </div>
    {(frontTilt || divider) && <div className={styles.shutterDetails}>
      {frontTilt && <figure><div className={styles.shutterDetailArt}><img src={`${CONTRACT_ART_ROOT}/shutter-center-plain.webp`} width={200} height={640} alt="Front tilt rod detail" /><span className={styles.attachmentRegion} data-shutter-target="tilt-detail" style={{left:'48%',top:'38%',width:'4%',height:'5%'}} aria-hidden="true" /></div><figcaption>Front tilt detail</figcaption></figure>}
      {divider && <figure><div className={styles.shutterDetailArt}><img src={`${CONTRACT_ART_ROOT}/shutter-hidden-divider.webp`} width={200} height={640} alt="Divider rail detail" /><span className={styles.attachmentRegion} data-shutter-target="divider-detail" style={{left:'18%',top:'48%',width:'64%',height:'2%'}} aria-hidden="true" /></div><figcaption>Divider rail detail</figcaption></figure>}
    </div>}
  </>;
}
