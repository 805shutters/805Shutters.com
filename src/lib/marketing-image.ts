import manifest from "./marketing-images.json";

export function marketingImage(src: string) {
  const path = src.replace(/^https:\/\/www\.805shutters\.com/, "").split("?")[0];
  const image = (manifest as Record<string, { width: number; height: number; version: string }>)[path];
  return image ? { src: `${path}?v=${image.version}`, width: image.width, height: image.height } : null;
}
