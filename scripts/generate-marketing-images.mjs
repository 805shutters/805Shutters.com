import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const sources = ['src/components/PageSections.tsx','src/lib/site-data.ts','src/lib/commercial-mode-data.ts','src/lib/city-service-content.ts','src/lib/product-preview-data.ts','content/wordpress/published.json'];
const paths = new Set();
for (const source of sources) {
 const text = await readFile(source, 'utf8');
 for (const match of text.matchAll(/\/images\/[\w./-]+\.(?:jpg|jpeg|png|webp|avif)/g)) paths.add(match[0]);
}
const manifest = {};
for (const path of [...paths].sort()) {
 const bytes = await readFile(`public${path}`);
 const {width,height} = await sharp(bytes).metadata();
 manifest[path] = {width,height,version:createHash('sha256').update(bytes).digest('hex').slice(0,12)};
}
await writeFile('src/lib/marketing-images.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`Recorded dimensions and content versions for ${paths.size} marketing images.`);
