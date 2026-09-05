"use client";

import type { MobileQuotePhoto } from "@/lib/crm/mobile-quote-draft";

export const MOBILE_QUOTE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_EDGE = 2400;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function prepareMobileQuotePhoto(file: File): Promise<MobileQuotePhoto> {
  if (!SUPPORTED_TYPES.has(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error("Photo must be between 1 byte and 25 MB.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file is not a readable image.");
  }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Photo processing is unavailable on this device.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let quality = 0.86;
    let blob: Blob | null = null;
    while (quality >= 0.42) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MOBILE_QUOTE_PHOTO_MAX_BYTES) break;
      quality -= 0.08;
    }
    if (!blob || blob.size > MOBILE_QUOTE_PHOTO_MAX_BYTES) throw new Error("Photo could not be compressed below 2 MB.");
    return {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
      type: "image/jpeg",
      blob,
    };
  } finally {
    bitmap.close();
  }
}
