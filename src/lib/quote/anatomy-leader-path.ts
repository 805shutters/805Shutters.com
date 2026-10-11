export type AnatomyLineRouting = 'direct' | 'around';
type Point = { x:number; y:number };
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
