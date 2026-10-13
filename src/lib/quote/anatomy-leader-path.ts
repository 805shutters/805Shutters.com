export type AnatomyLineRouting = 'direct' | 'around';
type Point = { x:number; y:number };

/** All intermediate segments stay outside the artwork; only the last enters a part. */
export function exteriorLeaderPoints(input:{start:Point;end:Point;left:boolean;entry:'top'|'bottom'|'side';art:{left:number;right:number;top:number;bottom:number};clearance?:number}):Point[] {
  const {start,end,left,entry,art,clearance=12}=input;
  const lane=left?art.left-clearance:art.right+clearance;
  if(entry==='top'||entry==='bottom') {
    const y=entry==='top'?Math.min(art.top,end.y)-clearance:Math.max(art.bottom,end.y)+clearance;
    return [start,{x:lane,y:start.y},{x:lane,y},{x:end.x,y},end];
  }
  return [start,{x:lane,y:start.y},{x:lane,y:end.y},end];
}

/** Small tangent corners keep leaders smooth without bending their straight runs. */
export function roundedLeaderPath(points:readonly Point[],radius=4):string {
  const distinct=points.filter((p,i)=>!i||p.x!==points[i-1].x||p.y!==points[i-1].y);
  if(!distinct.length)return '';
  let path=`M ${distinct[0].x} ${distinct[0].y}`;
  for(let i=1;i<distinct.length-1;i++) {
    const previous=distinct[i-1],corner=distinct[i],next=distinct[i+1];
    const before=Math.hypot(corner.x-previous.x,corner.y-previous.y),after=Math.hypot(next.x-corner.x,next.y-corner.y);
    const r=Math.min(radius,before/2,after/2);
    const a={x:corner.x+(previous.x-corner.x)*r/before,y:corner.y+(previous.y-corner.y)*r/before};
    const b={x:corner.x+(next.x-corner.x)*r/after,y:corner.y+(next.y-corner.y)*r/after};
    path+=` L ${a.x} ${a.y} Q ${corner.x} ${corner.y} ${b.x} ${b.y}`;
  }
  const end=distinct[distinct.length-1];
  return distinct.length>1?`${path} L ${end.x} ${end.y}`:path;
}
/** Exterior lanes keep physical-part leaders out of the face of the product. */
export function anatomyLeaderPath(input:{start:Point; end:Point; left:boolean; routing:AnatomyLineRouting; part:string; anchor?:string; art:{left:number;right:number;top:number;bottom:number}; elbow:number}):string {
  const {start:s,end:e,left,routing,part,anchor,art,elbow}=input;
  if(routing==='direct'||part==='surface')return `M ${s.x} ${s.y} L ${elbow} ${s.y} L ${e.x} ${e.y}`;
  const lane=left?Math.min(art.left-14,s.x+20):Math.max(art.right+14,s.x-20);
  if(anchor==='pull-tab'||part==='bottom') {
    const below=Math.max(art.bottom,e.y)+18;
    if(s.y>=art.bottom)return `M ${s.x} ${s.y} L ${e.x} ${s.y} L ${e.x} ${e.y}`;
    return `M ${s.x} ${s.y} L ${lane} ${s.y} L ${lane} ${below} L ${e.x} ${below} L ${e.x} ${e.y}`;
  }
  if(part==='top') {
    const above=Math.min(art.top,e.y)-16;
    if(s.y<=e.y)return `M ${s.x} ${s.y} L ${e.x} ${s.y} L ${e.x} ${e.y}`;
    return `M ${s.x} ${s.y} L ${lane} ${s.y} L ${lane} ${above} L ${e.x} ${above} L ${e.x} ${e.y}`;
  }
  return `M ${s.x} ${s.y} L ${lane} ${s.y} L ${e.x} ${e.y}`;
}
