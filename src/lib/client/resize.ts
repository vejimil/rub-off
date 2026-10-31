// Phones take 12–48 MP photos; the pipeline uses 2000 px on the long side. Resizing in the
// browser keeps uploads under the server's limit and re-encodes HEIC (where the browser can
// decode it) as JPEG. The browser applies EXIF rotation when decoding, and the canvas drops all
// metadata, location included.

export async function resizeToJpeg(file: File, longSide = 2000): Promise<{ blob: Blob; url: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * k), height = Math.round(bitmap.height * k);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.9));
  return { blob, url: URL.createObjectURL(blob), width, height };
}
