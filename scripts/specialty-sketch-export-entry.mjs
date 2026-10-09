
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { SpecialtyShutterSketch } from '../src/components/quote/SpecialtyShutterSketch';
import { SPECIALTY_SHUTTER_SKETCHES, specialtyShutterSketch, frenchDoorSketch } from '../src/lib/quote/specialty-shutter-illustrations';
export async function exportCatalog(destination) {
 await mkdir(destination,{recursive:true});
 const records=[];
 // PNG data URLs and the xlink namespace keep standalone exports compatible
 // with print/PDF renderers that do not decode WebP inside an SVG image.
 const materials=Object.fromEntries(await Promise.all(['pencil-material','louver-up','sunburst'].map(async name=>[name,'data:image/png;base64,'+(await sharp(await readFile('public/images/contract-illustrations/specialty-v1/'+name+'.webp')).png().toBuffer()).toString('base64')])));
 const exportOne=async(code,label,tilt,split,divider,suffix='')=>{
  const options=[...(frenchDoorSketch(code)?['Shutter type: French Door', 'French-door cutout type: '+label,'Handle side: Right','Top shape: Rectangular','Panel configuration: L']:['Specialty shape: '+label,'Panel configuration: '+(['YS57','YS58','YS68','YS69','YS27','YS28'].includes(code)?'L':'LR')]),'Tilt: '+tilt,'Split tilt: '+(split?'Yes':'No'),'Divider rail: '+(divider?'Yes':'No')];
  const sketch=specialtyShutterSketch('Shutters',options);
  let svg=renderToStaticMarkup(createElement(SpecialtyShutterSketch,{sketch})).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ').replaceAll(' href=',' xlink:href=');
  for(const [name,data] of Object.entries(materials))svg=svg.replaceAll('/images/contract-illustrations/specialty-v1/'+name+'.webp',data);
  const file=code.toLowerCase()+suffix+'.svg';
  await writeFile(destination+'/'+file,svg);
  await sharp(Buffer.from(svg),{density:300}).resize(800,800,{fit:'contain',background:'white'}).flatten({background:'#fff'}).png().toFile(destination+'/'+file.replace('.svg','.png'));
  return {code,label,file,tilt,split,divider};
 };
 for(const [code,label] of SPECIALTY_SHUTTER_SKETCHES) records.push(await exportOne(code,label,'Standard Tilt',false,false));
 const variants=[];
 for(const tilt of ['Standard Tilt','Invisible Tilt','Offset Tilt'])for(const split of [false,true])for(const divider of [false,true]) variants.push(await exportOne('YS05','Louvered Arch',tilt,split,divider,'-'+(tilt==='Standard Tilt'?'center':tilt==='Invisible Tilt'?'hidden':'offset')+(split?'-split':'')+(divider?'-divider':'')));
 const cards=(rows)=>rows.map(r=>'<figure><img src="'+r.file.replace('.svg','.png')+'"><figcaption><strong>'+r.label+'</strong><br>'+r.code+' · '+r.tilt+(r.split?' · split tilt':'')+(r.divider?' · divider rail':'')+'</figcaption></figure>').join('');
 await writeFile(destination+'/catalog.json',JSON.stringify({collection:'805 signature sketches',referenceOnly:true,shapes:records,archControls:variants},null,2));
 await writeFile(destination+'/catalog.html','<!doctype html><meta charset="utf-8"><title>805 specialty shutter sketches</title><style>body{font:14px Arial;background:#f5f3ed;margin:32px;color:#343731}h1,h2{font-family:Georgia}section{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}figure{margin:0;padding:20px;background:white;border:1px solid #ddd;text-align:center;break-inside:avoid}img{width:170px;height:180px}figcaption{font-size:12px;line-height:1.5}@media(max-width:600px){section{grid-template-columns:repeat(2,1fr)}body{margin:12px}}@media print{body{margin:0;background:white}img{width:120px;height:130px}figure{padding:8px}figcaption{font-size:10px}}</style><h1>805 Shutters · Specialty sketch collection</h1><p>Original shape references shared by Norman and Onyx. Illustrative configurations; not to scale.</p><h2>Arch control variants</h2><section>'+cards(variants)+'</section><h2>All 52 specialty shapes and French-door profiles</h2><section>'+cards(records)+'</section>');
 return records.length+variants.length;
}
