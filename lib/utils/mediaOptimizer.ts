/**
 * Client-Side Media Optimizer & Constraint Engine
 * 
 * Ensures all image uploads are automatically scaled down to maximum 1080p standard dimensions
 * (1920x1080 or 1080x1920) before uploading to Supabase Storage.
 * This prevents multi-gigabyte egress costs, accelerates feed loading, and eliminates memory crashes.
 */

export const MAX_DIMENSION_1080P = 1920;
export const MAX_SHORT_DIMENSION_1080P = 1080;

/**
 * Resizes an image File/Blob so that neither dimension exceeds 1080p (max 1920x1080 or 1080x1920)
 * while preserving aspect ratio and converting to an efficient WebP/JPEG blob.
 */
export async function resizeImageToMax1080p(file: File): Promise<File | Blob> {
  // If not a browser environment or not an image, return original
  if (typeof window === "undefined" || !file.type.startsWith("image/")) {
    return file;
  }

  // SVG images are vector and do not need bitmap resizing
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;

      // Check if image already satisfies 1080p constraints
      const maxDim = Math.max(width, height);
      const minDim = Math.min(width, height);

      if (maxDim <= MAX_DIMENSION_1080P && minDim <= MAX_SHORT_DIMENSION_1080P) {
        // Already within 1080p specifications
        resolve(file);
        return;
      }

      // Calculate scale factor down to 1080p
      let scale = 1;
      if (width >= height) {
        // Landscape or square: cap width at 1920 and height at 1080
        const scaleW = MAX_DIMENSION_1080P / width;
        const scaleH = MAX_SHORT_DIMENSION_1080P / height;
        scale = Math.min(scaleW, scaleH);
      } else {
        // Portrait: cap height at 1920 and width at 1080
        const scaleH = MAX_DIMENSION_1080P / height;
        const scaleW = MAX_SHORT_DIMENSION_1080P / width;
        scale = Math.min(scaleW, scaleH);
      }

      const targetWidth = Math.round(width * scale);
      const targetHeight = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            const resizedFile = new File([blob], file.name, {
              type: mimeType,
              lastModified: Date.now(),
            });
            resolve(resizedFile);
          } else {
            // Keep original if compressed blob is somehow larger
            resolve(file);
          }
        },
        mimeType,
        0.88 // 88% quality is visually indistinguishable from lossless at 1080p
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}
