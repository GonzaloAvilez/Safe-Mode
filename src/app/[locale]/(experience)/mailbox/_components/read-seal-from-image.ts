import { parseSeal } from "@/lib/return-key-groups";

// ADR-004 #213: opening the mailbox with the saved picture of the seal. The QR on the card holds
// the 15 digits and nothing else (return-key-qr.ts), so reading it gives the seal itself. The
// picture is read here, in the browser: it's never uploaded, and nothing about it is kept.

// A photo can be several thousand pixels wide. The QR's modules stay many pixels wide well below
// this, and jsQR is much faster on a smaller picture.
const MAX_IMAGE_DIMENSION_PX = 1600;

// The seal in a picture's pixels (RGBA, row by row), or null when there's no QR, or the QR holds
// something other than a seal. jsQR loads only when someone chooses a picture.
export async function readSealFromPixels(pixels: Uint8ClampedArray, width: number, height: number): Promise<string | null> {
  const { default: jsQR } = await import("jsqr");
  const code = jsQR(pixels, width, height);
  return code ? parseSeal(code.data) : null;
}

// The seal in a picture the person chose, or null when it can't be read: not an image, no QR, a
// QR that isn't a seal, or a browser that can't decode it.
export async function readSealFromImage(file: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    return await readSealFromPixels(context.getImageData(0, 0, width, height).data, width, height);
  } catch {
    return null;
  }
}
