import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { anatomyPreviewProduct, anatomyProductIndex } from '@/lib/quote/contract-anatomy-catalog';
import { catalogueChoiceKey, validateCatalogueSelection } from '@/lib/quote/anatomy-catalogue-selection';
const file=path.join(process.cwd(),'artifacts/visual-contract/catalogue-selection.json');
export async function GET() {
  if(process.env.NODE_ENV!=='development') return new NextResponse(null,{status:404});
  try{return NextResponse.json(JSON.parse(await fs.readFile(file,'utf8')),{headers:{'Cache-Control':'no-store'}});}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return NextResponse.json({selection:{},savedAt:null});throw error;}
}
export async function POST(request:NextRequest) {
  if(process.env.NODE_ENV!=='development') return new NextResponse(null,{status:404});
  const origin=request.headers.get('origin');
  try{if(!origin || new URL(origin).host!==request.headers.get('host'))return new NextResponse(null,{status:403});}
  catch{return new NextResponse(null,{status:403});}
  const text=await request.text();
  if(text.length>2_000_000)return new NextResponse(null,{status:413});
  let body:unknown;try{body=JSON.parse(text);}catch{return new NextResponse(null,{status:400});}
  const products=anatomyProductIndex().map(p=>anatomyPreviewProduct(p.id)!);
  const allowed=new Map(products.map(p=>[p.id,new Set(p.groups.flatMap(g=>g.choices.map(c=>catalogueChoiceKey(g.id,c.id))))]));
  const selection=validateCatalogueSelection(body,allowed);
  if(!selection)return NextResponse.json({error:'Some choices no longer match the catalog. Reload and try again.'},{status:400});
  const savedAt=new Date().toISOString();
  const selectedProducts=products.filter(p=>selection[p.id]).map(p=>({id:p.id,name:p.name,manufacturer:p.manufacturer,scope:selection[p.id].scope,options:p.groups.flatMap(g=>g.choices.filter(c=>selection[p.id].scope==='all'||selection[p.id].choices.includes(catalogueChoiceKey(g.id,c.id))).map(c=>({group:g.label,choice:c.label})))}));
  const saved={version:1,savedAt,selection,selectedProducts};
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp=file+'.'+crypto.randomUUID()+'.tmp';
  await fs.writeFile(temp,JSON.stringify(saved,null,2)+'\n');
  await fs.rename(temp,file);
  return NextResponse.json({savedAt,selectedCount:selectedProducts.length});
}
