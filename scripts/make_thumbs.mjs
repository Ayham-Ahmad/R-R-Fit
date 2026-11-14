import fs from "node:fs";
import path from "node:path";

const root = path.join("frontend", "public", "exercises");

function toStatic(svg) {
  return svg
    .replace(/<animate(?:Transform|Motion)?\b[^>]*\/>/g, "")
    .replace(/<animate(?:Transform|Motion)?\b[^>]*>[\s\S]*?<\/animate(?:Transform|Motion)?>/g, "")
    .replace(/<set\b[^>]*\/>/g, "")
    .replace(/<discard\b[^>]*\/>/g, "");
}

if (!fs.existsSync(root)) {
  console.error(`Missing ${root}`);
  process.exit(1);
}

const thumbDir = path.join(root, "thumbs");
fs.mkdirSync(thumbDir, { recursive: true });

const files = fs.readdirSync(root).filter((file) => file.endsWith(".svg"));
for (const file of files) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  fs.writeFileSync(path.join(thumbDir, file), toStatic(src));
}
console.log(`Generated ${files.length} static thumbnails in ${thumbDir}`);
