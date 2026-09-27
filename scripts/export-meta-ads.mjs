import sharp from 'sharp';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const [sourceDirectory, wovenOriginal] = process.argv.slice(2);
if (!sourceDirectory || !wovenOriginal) throw new Error('Usage: node scripts/export-meta-ads.mjs REVIEW_ADS_DIRECTORY WOVEN_ORIGINAL');
const selections = [
  ['layered-shades','005-layered-detail.png','Meet your light-control layers.'],
  ['exterior-shades','014-exterior-patio.png','Is afternoon sun cutting patio time short?'],
  ['shutters','010-shutters-free-consultation.png','Custom shutters. Free in-home consultation.'],
  ['roman-shades','009-roman-fabric-choice.png','Which fabric would you choose?'],
  ['drapery','028-beautifully-pulled-together.png','Beautifully pulled together.'],
  ['woven-shades',wovenOriginal,'Bring texture home.'],
];
const output = path.resolve('public/ads');
await mkdir(output, { recursive: true });
const manifest = [];
for (const [slug, source, headline] of selections) {
  const input = await readFile(path.isAbsolute(source) ? source : path.join(sourceDirectory, source));
  const sourceSha256 = createHash('sha256').update(input).digest('hex');
  for (const [ratio, height] of [['1x1',1080],['4x5',1350]]) {
    const file = `ad-${slug}-${ratio}.jpg`;
    // Flattened originals place text at both edges. Preserve every headline,
    // logo, CTA, and disclosure with an ivory surround instead of clipping.
    await sharp(input).rotate().resize(1080,height,{fit:'contain',background:'#f7f4ee'})
      .flatten({background:'#f7f4ee'}).toColourspace('srgb').withIccProfile('srgb')
      .jpeg({quality:85,mozjpeg:true,chromaSubsampling:'4:4:4'}).toFile(path.join(output,file));
    const metadata = await sharp(path.join(output,file)).metadata();
    if(metadata.width!==1080 || metadata.height!==height || metadata.space!=='srgb' || !metadata.hasProfile)
      throw new Error(`Invalid export ${file}`);
    manifest.push({file,headline,source:path.basename(source),sourceSha256,width:1080,height,bytes:(await stat(path.join(output,file))).size,quality:85,colorSpace:'sRGB',layout:'Full original preserved; ivory padding where required'});
  }
}
await writeFile(path.join(output,'manifest.json'), JSON.stringify(manifest,null,2)+'\n');
const cards = selections.map(([slug,,headline])=>`<section><h2>${headline}</h2><div class="pair">${['1x1','4x5'].map(r=>`<a download href="ad-${slug}-${r}.jpg"><img src="ad-${slug}-${r}.jpg" alt="${headline} ${r}"/><span>${r==='1x1'?'1080 × 1080':'1080 × 1350'} · Download JPG</span></a>`).join('')}</div></section>`).join('\n');
await writeFile(path.join(output,'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>805 Shutters · Meta feed exports</title><style>*{box-sizing:border-box}body{background:#f4f1eb;color:#24372d;font:16px system-ui;margin:40px auto;max-width:1200px;padding:0 24px}h1{font:42px Georgia}h2{font:26px Georgia;margin:48px 0 20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}img{width:100%;display:block}a{color:inherit;text-decoration:none}span{display:block;margin-top:10px}p{max-width:760px;line-height:1.6}@media(max-width:650px){.pair{grid-template-columns:1fr}}</style><h1>805 Shutters · Feed creative review</h1><p>Six selected designs in two feed sizes. JPG quality 85, embedded sRGB. Originals preserved. Ivory padding protects the complete headlines and contact details. These files are ready for creative review; the campaign has not been launched.</p>${cards}</html>`);
console.log(JSON.stringify(manifest.map(({file,width,height,bytes})=>({file,width,height,bytes})),null,2));
