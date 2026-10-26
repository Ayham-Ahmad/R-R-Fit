const MAX_PROOF_BYTES = 100 * 1024;
const MAX_EDGE = 1500;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("PROOF_FILE_INVALID"));
    };
    image.src = url;
  });
}

function fitDimensions(width, height, maxEdge) {
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
}

function canvasToWebp(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/webp", quality);
  });
}

export async function compressProofImage(file) {
  if (!file) return null;
  if (!String(file.type).startsWith("image/")) throw new Error("PROOF_FILE_TYPE_INVALID");

  const image = await loadImage(file);
  const start = fitDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height, MAX_EDGE);
  let width = start.width;
  let height = start.height;
  let best = null;

  for (let dimensionPass = 0; dimensionPass < 4; dimensionPass += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.86, 0.74, 0.6, 0.48]) {
      const blob = await canvasToWebp(canvas, quality);
      if (!blob) continue;
      if (!best || blob.size < best.size) best = blob;
      if (blob.type === "image/webp" && blob.size <= MAX_PROOF_BYTES) return blob;
    }

    width = Math.max(320, Math.round(width * 0.8));
    height = Math.max(320, Math.round(height * 0.8));
  }

  if (best && best.size <= MAX_PROOF_BYTES) return best;
  throw new Error("PROOF_FILE_TOO_LARGE");
}
