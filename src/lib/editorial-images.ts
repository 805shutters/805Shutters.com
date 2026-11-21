import { parseDocument } from "htmlparser2";
import { findAll, getOuterHTML } from "domutils";
import { getImageProps } from "next/image";
import { marketingImage } from "./marketing-image";

export function optimizeEditorialImages(html: string, priorityHero = false) {
  const doc = parseDocument(html);
  const images = findAll((node) => node.name === "img", doc.children);
  images.forEach((node, index) => {
    const image = marketingImage(node.attribs.src ?? "");
    if (!image) return;
    const hero = priorityHero && index === 0;
    const { props } = getImageProps({
      ...image, alt: node.attribs.alt ?? "", quality: 75,
      // The wide hero is cropped into a tall mobile frame; select enough
      // source pixels for its rendered height as well as its viewport width.
      sizes: hero ? "(max-width: 650px) 1200px, 100vw" : "(max-width: 650px) 100vw, 50vw",
      loading: hero ? "eager" : "lazy", fetchPriority: hero ? "high" : "auto"
    });
    Object.assign(node.attribs, {
      src: props.src, srcset: props.srcSet ?? "", sizes: props.sizes ?? "",
      width: String(props.width), height: String(props.height),
      loading: props.loading!, fetchpriority: props.fetchPriority!, decoding: "async"
    });
  });
  return getOuterHTML(doc);
}
