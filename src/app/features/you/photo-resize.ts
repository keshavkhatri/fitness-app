/** Accepted photo types (as the identity store validates them). */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Center-crops an image file to a square and scales it to `size` px, as a
 * JPEG data URL, so the avatar stays small enough for device storage.
 * Rejects files that aren't a supported image or can't be decoded.
 */
export async function resizePhoto(file: File, size = 256): Promise<string> {
  if (!PHOTO_TYPES.includes(file.type as (typeof PHOTO_TYPES)[number])) {
    throw new TypeError('Unsupported image type.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas unavailable.');
    }
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    bitmap.close();
  }
}
