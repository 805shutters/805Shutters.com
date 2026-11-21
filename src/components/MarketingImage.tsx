import Image from "next/image";
import type { ImgHTMLAttributes } from "react";
import { marketingImage } from "@/lib/marketing-image";

// Keep intrinsic aspect ratios and version URLs when source artwork changes.
export function MarketingImage({ src = "", alt = "", width, height, sizes = "(max-width: 700px) 100vw, 50vw", ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string }) {
  const image = marketingImage(src);
  if (!image) return <img src={src} alt={alt} width={width} height={height} sizes={sizes} {...props} />;
  return <Image {...props} {...image} alt={alt} sizes={sizes} quality={75} loading={props.loading ?? "lazy"} />;
}
