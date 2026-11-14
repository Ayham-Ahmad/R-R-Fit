// Proof compression pipeline.
//
// Modern phone cameras produce photos that are 4–12 MB. The app accepts any
// image up to 10 MB, then re-encodes it in the browser so storage stays small
// and uploads stay fast on mobile data. Nothing is ever asked of the trainee.

export const MAX_PROOF_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB originals accepted
export const MAX_PROOF_OUTPUT_BYTES = 10 * 1024 * 1024; // hard cap, matches bucket limit
const TARGET_BYTES = 2 * 1024 * 1024; // aim for ~2 MB for a big storage saving
const MAX_EDGE = 3000;
const QUALITY_LADDER = [0.95, 0.9, 0.84, 0.76, 0.68, 0.6];

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        source: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        release: () => URL.revokeObjectURL(url)
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("PROOF_FILE_UNSUPPORTED"));
    };
    image.src = url;
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close?.()
      };
    } catch {
      // Fall through to the <img> decoder below.
    }
  }
  return loadImageElement(file);
}

function fitDimensions(width, height, maxEdge) {
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function supportsWebpEncoding() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

function drawToCanvas(image, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image.source, 0, 0, width, height);
  return canvas;
}

function result(blob, width, height, originalBytes) {
  return {
    blob,
    type: blob.type,
    width,
    height,
    originalBytes,
    bytes: blob.size
  };
}

export async function compressProofImage(file) {
  if (!file) return null;
  const type = String(file.type || "");
  if (type && !type.startsWith("image/")) throw new Error("PROOF_FILE_TYPE_INVALID");
  if (file.size > MAX_PROOF_INPUT_BYTES) throw new Error("PROOF_FILE_TOO_LARGE");

  let image;
  try {
    image = await decodeImage(file);
  } catch {
    throw new Error("PROOF_FILE_UNSUPPORTED");
  }

  try {
    const outputType = supportsWebpEncoding() ? "image/webp" : "image/jpeg";
    const start = fitDimensions(image.width, image.height, MAX_EDGE);
    let width = start.width;
    let height = start.height;
    let best = null;

    for (let dimensionPass = 0; dimensionPass < 3; dimensionPass += 1) {
      const canvas = drawToCanvas(image, width, height);

      for (const quality of QUALITY_LADDER) {
        const blob = await canvasToBlob(canvas, outputType, quality);
        if (!blob) continue;
        if (!best || blob.size < best.size) {
          best = result(blob, width, height, file.size);
        }
        if (blob.size <= TARGET_BYTES) {
          return result(blob, width, height, file.size);
        }
      }

      width = Math.max(320, Math.round(width * 0.82));
      height = Math.max(320, Math.round(height * 0.82));
    }

    if (best && best.bytes <= MAX_PROOF_OUTPUT_BYTES) return best;
    throw new Error("PROOF_FILE_TOO_LARGE");
  } finally {
    image.release?.();
  }
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

// WhatsApp handles JPEG most reliably, so re-encode the compressed proof before
// sharing it. Returns the original blob if the browser cannot decode/re-encode.
export async function toShareJpeg(blob, quality = 0.92) {
  if (!blob) return blob;
  if (blob.type === "image/jpeg") return blob;
  let image;
  try {
    image = await decodeImage(blob);
  } catch {
    return blob;
  }
  try {
    const size = fitDimensions(image.width, image.height, MAX_EDGE);
    const canvas = drawToCanvas(image, size.width, size.height);
    const jpeg = await canvasToBlob(canvas, "image/jpeg", quality);
    return jpeg || blob;
  } finally {
    image.release?.();
  }
}
