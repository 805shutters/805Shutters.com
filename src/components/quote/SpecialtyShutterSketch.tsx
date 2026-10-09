import { useId } from 'react';
import { frenchDoorSketch, pureSunburst, type SpecialtyShutterSketch as Sketch } from '@/lib/quote/specialty-shutter-illustrations';
import styles from './ContractProductIllustration.module.css';
import type { ShutterIllustrationGeometry } from '@/lib/quote/shutter-illustration-geometry';

type Part = { path: string; x: number; y: number; w: number; h: number; fan?: {x:number;y:number;full?:boolean}; horizontalStart?: number; connection?: 'strip'|'post'|'rail'; };
const polygon = (points: number[][]) => `M${points.map(p=>p.join(' ')).join('L')}Z`;
const part = (path:string,x=20,y=20,w=200,h=280): Part => ({path,x,y,w,h});
const arch = (x=20,w=200,y=20,shoulder=120,bottom=300): Part => part(`M${x} ${bottom}V${shoulder}A${w/2} ${shoulder-y} 0 0 1 ${x+w} ${shoulder}V${bottom}Z`,x,y,w,bottom-y);
const quarter = (right=false,bottom=300,shoulder=120,x=70,w=100): Part => part(right?`M${x} ${bottom}V20A${w} ${shoulder-20} 0 0 1 ${x+w} ${shoulder}V${bottom}Z`:`M${x} ${bottom}V${shoulder}A${w} ${shoulder-20} 0 0 1 ${x+w} 20V${bottom}Z`,x,20,w,bottom-20);

/** Each outline follows the source shape; louvers/rods/rails are composable.
 * A frontal graphite study remains legible at contract and print sizes. */
export function specialtySketchParts(sketch: Sketch): Part[] {
  const c=sketch.code;
  if(frenchDoorSketch(c)) {
    const p = sketch.top==='arch'?arch(65,110,20,85):sketch.top==='quarter-left'?quarter(false,300,95,65,110):sketch.top==='quarter-right'?quarter(true,300,95,65,110):part('M65 20H175V300H65Z',65,20,110,280);
    return [p];
  }
  if(['YS01','YS03','YS04','YS53'].includes(c)) {
    const eyebrow=c==='YS03'||c==='YS04', rise=eyebrow?65:100, legs=c==='YS04'?25:0;
    const p=arch(20,200,20,20+rise,20+rise+legs);
    if(c!=='YS53')p.fan={x:120,y:20+rise+legs-8};
    return [p];
  }
  if(['YS02','YS06'].includes(c)) { const p=quarter(c==='YS06',220,220,20,200);p.fan={x:c==='YS06'?28:212,y:212};return [p]; }
  if(['YS57','YS58','YS68','YS69'].includes(c)) {const p=quarter(['YS58','YS69'].includes(c));if(['YS68','YS69'].includes(c)){p.fan={x:c==='YS69'?78:162,y:112};p.horizontalStart=128;p.connection='rail';}return [p];}
  if(['YS05','YS09','YS10','YS51','YS52'].includes(c)) {
    const p=arch();
    if(c!=='YS05'){p.fan={x:120,y:112};p.horizontalStart=128;p.connection=c==='YS09'?'strip':c==='YS52'?'post':'rail';}
    return [p];
  }
  if(c==='YS56')return [part('M20 88Q120 -24 220 88V300H20Z')];
  if(['YS63','YS64','YS65','YS66','YS67'].includes(c)) {
    const middle=arch(75,90,20,110,300);
    const rounded=c==='YS66'||c==='YS67';
    const left=rounded?part('M20 300V160Q20 110 75 110V300Z',20,110,55,190):part('M20 120H75V300H20Z',20,120,55,180);
    const right=rounded?part('M165 300V110Q220 110 220 160V300Z',165,110,55,190):part('M165 120H220V300H165Z',165,120,55,180);
    if(['YS63','YS67'].includes(c)){middle.fan={x:120,y:102};middle.horizontalStart=118;middle.connection='rail';}
    if(c==='YS67'){left.fan={x:68,y:153};left.horizontalStart=170;left.connection='rail';right.fan={x:172,y:153};right.horizontalStart=170;right.connection='rail';}
    if(c==='YS64'){middle.horizontalStart=128;middle.connection='post';}
    return [left,middle,right];
  }
  if(['YS11','YS17','YS14','YS18','YS12','YS19','YS13','YS15','YS16','YS20'].includes(c)) {
    const oval=['YS16','YS20'].includes(c), round=['YS13','YS15','YS16','YS20'].includes(c);
    const circle=['YS13','YS15'].includes(c);
    const path=round?`M${oval?60:20} 160A${oval?60:100} ${oval?140:100} 0 1 0 ${oval?180:220} 160A${oval?60:100} ${oval?140:100} 0 1 0 ${oval?60:20} 160Z`:['YS11','YS17'].includes(c)?polygon([[20,160],[70,73.4],[170,73.4],[220,160],[170,246.6],[70,246.6]]):['YS14','YS18'].includes(c)?polygon([[20,102.3],[120,44.5],[220,102.3],[220,217.7],[120,275.5],[20,217.7]]):polygon([[78.6,60],[161.4,60],[220,118.6],[220,201.4],[161.4,260],[78.6,260],[20,201.4],[20,118.6]]);
    const y=oval?20:circle?60:['YS11','YS17'].includes(c)?73.4:['YS14','YS18'].includes(c)?44.5:60;
    const p=part(path,oval?60:20,y,oval?120:200,320-y*2);if(pureSunburst(c))p.fan={x:120,y:160,full:true};
    return [p];
  }
  const points:Record<string,number[][]>={
    YS21:[[20,120],[220,20],[220,300],[20,300]],YS23:[[20,20],[220,120],[220,300],[20,300]],
    YS25:[[20,20],[220,20],[220,300],[20,200]],YS26:[[20,20],[220,20],[220,200],[20,300]],
    YS27:[[20,300],[220,20],[220,300]],YS28:[[20,20],[220,300],[20,300]],
    YS59:[[20,300],[120,20],[220,300]],YS60:[[20,300],[120,20],[220,300]],YS62:[[20,120],[120,20],[220,120],[220,300],[20,300]],
    YS70:[[20,120],[80,20],[160,20],[220,120],[220,300],[20,300]],
    YS71:[[20,120],[175,20],[220,20],[220,300],[20,300]],YS72:[[20,20],[65,20],[220,120],[220,300],[20,300]],
    YS73:[[20,20],[220,20],[220,200],[160,300],[80,300],[20,200]],
    YS74:[[20,20],[220,20],[220,300],[175,300],[20,200]],YS75:[[20,20],[220,20],[220,200],[65,300],[20,300]],
  };
  const p=part(polygon(points[c]));if(c==='YS60')p.fan={x:120,y:285};return [p];
}

/** Reposition outlines only. Blades and hardware are constructed in the new
 * coordinates so changing opening proportions never stretches a finished image. */
export function proportionedSketchParts(sketch: Sketch, geometry?: ShutterIllustrationGeometry): Part[] {
  const parts = specialtySketchParts(sketch);
  if (!geometry || !Number.isFinite(geometry.aspectRatio) || geometry.aspectRatio <= 0) return parts;
  const left=Math.min(...parts.map(p=>p.x)),top=Math.min(...parts.map(p=>p.y));
  const width=Math.max(...parts.map(p=>p.x+p.w))-left, height=Math.max(...parts.map(p=>p.y+p.h))-top;
  const sx=200/width, sy=(200/geometry.aspectRatio)/height;
  const x=(n:number)=>20+(n-left)*sx,y=(n:number)=>20+(n-top)*sy;
  const path=(source:string)=>source.replace(/([MLHVQA])([^MLHVQAZ]*)/g,(_,command:string,values:string)=>{
    const a=(values.match(/-?\d+(?:\.\d+)?/g)??[]).map(Number);
    const mapped=command==='H'?a.map(x):command==='V'?a.map(y):command==='A'?a.map((n,i)=>i===0?n*sx:i===1?n*sy:i===5?x(n):i===6?y(n):n):a.map((n,i)=>i%2===0?x(n):y(n));
    return command+mapped.map(n=>Number(n.toFixed(4))).join(' ');
  });
  const result=parts.map(p=>({...p,path:path(p.path),x:x(p.x),y:y(p.y),w:p.w*sx,h:p.h*sy,
    ...(p.fan?{fan:{...p.fan,x:x(p.fan.x),y:y(p.fan.y)}}:{}),
    ...(p.horizontalStart!==undefined?{horizontalStart:y(p.horizontalStart)}:{})}));
  // A recorded leg height establishes the spring line of an arched opening.
  if(result.length===1&&['YS05','YS09','YS10','YS51','YS52'].includes(sketch.code)&&geometry.legHeightFraction&&geometry.legHeightFraction<1) {
    const h=200/geometry.aspectRatio, shoulder=20+h*(1-geometry.legHeightFraction),bottom=20+h;
    const p=arch(20,200,20,shoulder,bottom);
    if(sketch.code!=='YS05'){p.fan={x:120,y:shoulder-8};p.horizontalStart=shoulder+8;p.connection=result[0].connection;}
    return [p];
  }
  if(['YS57','YS58','YS68','YS69'].includes(sketch.code)) {
    const right=['YS58','YS69'].includes(sketch.code);
    const leg=geometry.legHeightFraction??(right?geometry.rightLegHeightFraction:geometry.leftLegHeightFraction);
    if(leg&&leg<1){const h=200/geometry.aspectRatio,shoulder=20+h*(1-leg),p=quarter(right,20+h,shoulder,20,200);
      if(['YS68','YS69'].includes(sketch.code)){p.fan={x:right?28:212,y:shoulder-8};p.horizontalStart=shoulder+8;p.connection='rail';}
      return [p];}
  }
  if(['YS21','YS23','YS25','YS26'].includes(sketch.code)&&(geometry.leftLegHeightFraction||geometry.rightLegHeightFraction)) {
    const h=200/geometry.aspectRatio,bottom=20+h,reverse=['YS25','YS26'].includes(sketch.code);
    const left=geometry.leftLegHeightFraction??(['YS21','YS25'].includes(sketch.code)?180/280:1);
    const right=geometry.rightLegHeightFraction??(['YS23','YS26'].includes(sketch.code)?180/280:1);
    return [part(polygon(reverse?[[20,20],[220,20],[220,20+h*right],[20,20+h*left]]:[[20,bottom-h*left],[220,bottom-h*right],[220,bottom],[20,bottom]]),20,20,200,h)];
  }
  return result;
}

export function SpecialtyShutterSketch({ sketch, geometry }: { sketch: Sketch; geometry?: ShutterIllustrationGeometry }) {
  const id=`specialty-${useId().replace(/[^a-zA-Z0-9_-]/g,'')}`;
  const parts=proportionedSketchParts(sketch,geometry), isDoor=frenchDoorSketch(sketch.code), fixed=pureSunburst(sketch.code);
  const height=Math.max(...parts.map(p=>p.y+p.h))+34;
  const angleRise=11;
  const title=[sketch.label, fixed?'Radial sunburst louvers':sketch.tilt==='hidden'?'Hidden tilt':sketch.tilt==='offset'?'Offset tilt rod':sketch.tilt==='center'?'Center tilt rod':'Tilt not recorded', ...(!fixed&&sketch.split?['Split tilt: upper louvers open, lower louvers more closed']:[]), ...(!fixed&&sketch.divider?['Divider rail']:[])].join(' · ');
  // Shape stiles may constrain a panel layout. Missing layouts are labeled as
  // references; never substitute the source thumbnail's demonstration layout.
  const tokens=sketch.layout.replace(/T/g,'');
  const totalPanels=tokens.length;
  return <svg className={styles.shutterAssembly} viewBox={`0 0 250 ${height}`} width={160} height={160}
    role="img" aria-label={`${title} — 805 signature sketch`} data-specialty-sketch={sketch.code}
    data-sketch-tilt={fixed?'radial':sketch.tilt??'unrecorded'} data-sketch-split={!fixed&&sketch.split} data-sketch-divider={!fixed&&sketch.divider} data-arch-style={sketch.archStyle||undefined} data-specialty-layout={sketch.layout||undefined} data-opening-aspect-ratio={geometry?.aspectRatio}>
    <title>{title}</title>
    <defs>
      <pattern id={`${id}-grain`} width="96" height="96" patternUnits="userSpaceOnUse"><image href="/images/contract-illustrations/specialty-v1/pencil-material.webp" width="96" height="96" preserveAspectRatio="none"/></pattern>
      <image id={`${id}-pencil-louver`} href="/images/contract-illustrations/specialty-v1/louver-up.webp" width="2167" height="726"/>
      <image id={`${id}-pencil-fan`} href="/images/contract-illustrations/specialty-v1/sunburst.webp" width="1254" height="1254"/>
      <linearGradient id={`${id}-blade`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9d9c98" stopOpacity=".48"/><stop offset=".25" stopColor="#dad9d5" stopOpacity=".12"/><stop offset="1" stopColor="#fff" stopOpacity=".38"/></linearGradient>
      <linearGradient id={`${id}-rod`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#999892"/><stop offset=".45" stopColor="#f5f4f0"/><stop offset="1" stopColor="#bdbcb6"/></linearGradient>
      <filter id={`${id}-pencil-edge`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".18"/></filter>
      <filter id={`${id}-soft-shadow`} x="-15%" y="-15%" width="135%" height="140%"><feDropShadow dx="1.8" dy="2" stdDeviation="1.5" floodColor="#888" floodOpacity=".15"/></filter>
      {parts.map((p,i)=><clipPath key={i} id={`${id}-outline-${i}`}><path d={p.path}/></clipPath>)}
    </defs>
    <g transform={`translate(0 ${angleRise}) matrix(1 -.045 0 1 0 0)`} filter={`url(#${id}-soft-shadow)`}>
    {parts.map((p,index)=>{
      const start=p.horizontalStart??p.y+10, end=p.y+p.h-11;
      const mid=geometry?.dividerHeightFraction&&sketch.divider?p.y+p.h*(1-geometry.dividerHeightFraction):(start+end)/2;
      // No meeting stiles are invented when the panel layout was never saved.
      const count=parts.length>1?(index===1&&totalPanels>=3?totalPanels-2:1):totalPanels||1, panelW=(p.w-20)/count;
      const posts=new Set<number>();let panel=0;for(const token of sketch.layout){if(token==='T')posts.add(panel);else panel+=1;}
      const innerTransform=`translate(${p.x+p.w/2} ${p.y+p.h/2}) scale(${Math.max(.2,(p.w-18)/p.w)} ${Math.max(.2,(p.h-18)/p.h)}) translate(${-p.x-p.w/2} ${-p.y-p.h/2})`;
      const openingHeight=Math.max(...parts.map(p=>p.y+p.h))-Math.min(...parts.map(p=>p.y));
      const pitch=Math.max(2,geometry?.louverPitchFraction?openingHeight*geometry.louverPitchFraction:15);
      const bladeStart=sketch.code==='YS64'&&index===1?p.y+10:start;
      const rows=Array.from({length:Math.min(300,Math.max(0,Math.floor((end-bladeStart)/pitch)))},(_,n)=>bladeStart+pitch/2+n*pitch);
      return <g key={index}>
        {!sketch.noFrame&&<path data-surround-frame="true" d={p.path} transform={`translate(${p.x+p.w/2} ${p.y+p.h/2}) scale(1.055 1.035) translate(${-p.x-p.w/2} ${-p.y-p.h/2})`} fill={`url(#${id}-grain)`} stroke="#858177" strokeWidth="1"/>}
        <path d={p.path} transform="translate(3.2 1.5)" fill="#cccac5" stroke="#9a978e" strokeWidth=".6"/>
        <path d={p.path} fill={`url(#${id}-grain)`} stroke="#85837d" strokeWidth=".8"/>
        <g clipPath={`url(#${id}-outline-${index})`}>
          <path d={p.path} transform={innerTransform} fill="#fff" stroke="#aaa7a1" strokeWidth="2.2" filter={`url(#${id}-pencil-edge)`}/>
          <path d={p.path} transform={innerTransform} fill="#fff" stroke="#99958b" strokeWidth=".5"/>
          <g clipPath={`url(#${id}-inner-${index})`}>
          <defs><clipPath id={`${id}-inner-${index}`}><path d={p.path} transform={innerTransform}/></clipPath></defs>
          {!fixed&&rows.map((y,n)=>{
            const lower=sketch.split&&y>mid, bladeH=pitch*(lower?.92:.4);
            return <g key={n} data-louver-section={lower?'lower-more-closed':'upper-open'} data-louver-close-direction="up" data-horizontal-arch-crown={sketch.code==='YS64'&&index===1&&y<start||undefined}>
              <svg x={p.x+9} y={y-bladeH/2} width={p.w-18} height={bladeH} viewBox="18 235 2135 265" preserveAspectRatio="none" overflow="hidden"><use href={`#${id}-pencil-louver`}/></svg>
            </g>;
          })}
          {p.fan&&<g data-radial-sunburst="true">
            <rect x={p.x} y={p.y} width={p.w} height={p.horizontalStart?p.horizontalStart-p.y:p.h} fill={`url(#${id}-grain)`}/>
            <svg x={p.x} y={p.y} width={p.w} height={p.horizontalStart?p.horizontalStart-p.y:p.h} viewBox={`${p.x} ${p.y} ${p.w} ${p.horizontalStart?p.horizontalStart-p.y:p.h}`} overflow="hidden">
              <svg viewBox="0 0 1254 1254"
                x={p.fan.x-Math.max(p.fan.x-p.x,p.x+p.w-p.fan.x)*1.16}
                y={p.fan.y-(p.fan.full?p.h/2:p.fan.y-p.y)*1.18}
                width={Math.max(p.fan.x-p.x,p.x+p.w-p.fan.x)*2.32}
                height={(p.fan.full?p.h/2:p.fan.y-p.y)*2.36} preserveAspectRatio="none"><use href={`#${id}-pencil-fan`}/></svg>
            </svg>
          </g>}
          {p.connection&&<rect data-shape-connection={p.connection} x={p.connection==='strip'?p.x-4:p.x+5} y={start-10} width={p.connection==='strip'?p.w+8:p.w-10} height={p.connection==='post'?12:p.connection==='strip'?6:8} fill={`url(#${id}-grain)`} stroke="#77746b" strokeWidth=".8"/>}
          {sketch.code==='YS56'&&<path d={`M${p.x} ${p.y+p.h*.243}Q${p.x+p.w/2} ${p.y-p.h*.157} ${p.x+p.w} ${p.y+p.h*.243}L${p.x+p.w} ${p.y+p.h*.243+14}Q${p.x+p.w/2} ${p.y-p.h*.157+14} ${p.x} ${p.y+p.h*.243+14}Z`} fill={`url(#${id}-grain)`} stroke="#77746b" strokeWidth="1" data-solid-arch-rail="true"/>}
          {!fixed&&Array.from({length:Math.max(0,count-1)},(_,n)=><rect key={n} data-panel-stile="true" x={p.x+10+(n+1)*panelW-4} y={p.fan?start:p.y} width={posts.has(n+1)?12:8} data-specialty-post={posts.has(n+1)||undefined} height={p.h} fill={`url(#${id}-grain)`} stroke="#77746b" strokeWidth=".85"/>)}
          {sketch.code==='YS51'&&<rect data-quarter-sunburst-center-post="true" x={p.x+p.w/2-4} y={p.y} width={8} height={p.h} fill={`url(#${id}-grain)`} stroke="#77746b" strokeWidth="1"/>}
          {!fixed&&Array.from({length:count},(_,n)=>{
            if(!sketch.tilt||sketch.tilt==='hidden')return null;
            const x=p.x+10+(n+(sketch.tilt==='offset'?.18:.5))*panelW;
            const segments=sketch.split||sketch.divider?[[start+12,mid-7],[mid+8,end-8]]:[[start+12,end-8]];
            if(sketch.code==='YS64'&&index===1)segments.unshift([p.y+18,start-18]);
            return <g key={n} clipPath={`url(#${id}-inner-${index})`}>{segments.map(([a,b],j)=><rect key={j} data-front-tilt-rod={sketch.tilt} data-tilt-section={j} x={x-2} y={a} width={4} height={Math.max(0,b-a)} rx="1.6" fill={`url(#${id}-rod)`} stroke="#87857e" strokeWidth=".5"/>)}</g>;
          })}
          {!fixed&&sketch.divider&&<rect data-divider-rail="true" x={p.x+8} y={mid-6} width={p.w-16} height={12} fill={`url(#${id}-grain)`} stroke="#77746b" strokeWidth=".9"/>}
          {sketch.curvedTilt==='rear'&&sketch.code==='YS05'&&<path data-rear-tilt-reference="true" d={`M${p.x+p.w/2} ${p.y+p.h*.1}V${p.y+p.h*.33}`} stroke="#77746b" strokeWidth="2" strokeDasharray="3 3"/>}
          {sketch.fixedTop&&<path data-fixed-top-louver="true" d={`M${p.x+10} ${p.y+27}h${p.w-20}`} stroke="#57544c" strokeWidth="3"/>}
          </g>
        </g>
        {p.connection==='strip'&&<rect data-overhanging-divider-strip="true" x={p.x-8} y={(p.horizontalStart??120)-10} width={p.w+16} height={6} fill={`url(#${id}-grain)`} stroke="#77746b" strokeWidth=".9"/>}
        <path d={p.path} fill="none" stroke="#aaa7a0" strokeWidth=".5" opacity=".5" transform="translate(.35 -.25)"/>
        {isDoor&&sketch.cutoutSide&&<g transform={`translate(${p.x} ${p.y}) scale(${p.w/110} ${p.h/280}) translate(-65 -20)`}><DoorCutout sketch={sketch} grain={`${id}-grain`}/></g>}
      </g>;
    })}
    </g>
  </svg>;
}

function DoorCutout({sketch,grain}:{sketch:Sketch;grain:string}) {
  const curved=['YS33','YS34'].includes(sketch.code),offset=['YS34','YS36'].includes(sketch.code),batten=['YS38','YS39'].includes(sketch.code);
  const transform=sketch.cutoutSide==='right'?'translate(240 0) scale(-1 1)':undefined;
  const notch=curved?'M65 143Q109 169 65 195':sketch.code==='YS38'?'M65 140L91 155V184L65 199':'M65 143H94V195H65';
  return <g transform={transform} data-french-door-cutout={sketch.code} data-cutout-side={sketch.cutoutSide}>
    <path d={`${notch}Z`} fill="#fff" stroke="#69665c" strokeWidth="1.1"/>
    {offset&&<path d={curved?'M65 136Q119 169 65 202':'M65 136H102V202H65'} fill="none" stroke="#8b877e" strokeWidth="1.3" data-cutout-offset="true"/>}
    {batten&&<path d="M62 132H68V206H62Z" fill={`url(#${grain})`} stroke="#8b877e" strokeWidth="1" data-door-batten="true"/>}
  </g>;
}
