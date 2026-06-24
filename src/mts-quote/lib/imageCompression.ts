/**
 * Image Compression Utility
 * Resizes and compresses images before upload to stay within edge function payload limits.
 * Mobile camera photos are typically 3-10MB; this reduces them to ~200-500KB.
 */

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.8;

/**
 * Compress an image file by resizing and converting to JPEG.
 * Returns a new File object with reduced size.
 */
export async function compressImage(
  file: File,
  maxDimension = MAX_DIMENSION,
  quality = JPEG_QUALITY
): Promise<File> {
  // Skip non-image files
  if (!file.type.startsWith("image/")) return file;

  // Skip already-small files (under 500KB)
  if (file.size < 500 * 1024) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Scale down if larger than max dimension
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round(height * (maxDimension / width));
          width = maxDimension;
        } else {
          width = Math.round(width * (maxDimension / height));
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to compress image"));
            return;
          }

          // Keep original name but change extension to .jpg
          const name = file.name.replace(/\.[^.]+$/, ".jpg");
          const compressed = new File([blob], name, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });

          console.log(
            `[ImageCompression] ${file.name}: ${(file.size / 1024).toFixed(0)}KB -> ${(compressed.size / 1024).toFixed(0)}KB (${width}x${height})`
          );

          resolve(compressed);
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Return original file if we can't load it as an image
      resolve(file);
    };

    img.src = url;
  });
}
