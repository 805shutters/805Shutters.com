import { CONTRACT_ART_ROOT, contractIllustration } from "@/lib/quote/contract-illustrations";
import styles from "./ContractProductIllustration.module.css";

export function ContractProductIllustration({ productType, options = [] }: { productType: string; options?: readonly string[] }) {
  const art = contractIllustration(productType, options);
  if (!art) return null;
  return (
    <figure className={styles.figure} data-contract-illustration="c-v1">
      <img src={art.src} alt={art.alt} width={160} height={160} className={styles.product} style={art.mirror ? { transform: "scaleX(-1)" } : undefined} />
      {art.remote ? <img src={`${CONTRACT_ART_ROOT}/remote.webp`} alt="Motorized shade handheld control" width={62} height={62} className={styles.remote} /> : null}
    </figure>
  );
}
