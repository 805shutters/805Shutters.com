import { describe, expect, it } from 'vitest';
import { exteriorLeaderPoints, roundedLeaderPath } from './anatomy-leader-path';

describe('outside anatomy connectors',()=>{
  const art={left:100,right:300,top:50,bottom:250};
  for(const left of [true,false])for(const entry of ['top','bottom','side'] as const){
    it(`approaches the ${entry} from the ${left?'left':'right'} without traversing the product`,()=>{
      const end=entry==='top'?{x:200,y:60}:entry==='bottom'?{x:200,y:245}:{x:left?110:290,y:140};
      const points=exteriorLeaderPoints({start:{x:left?20:380,y:120},end,left,entry,art});
      // Every segment before the final short entry must miss the open interior.
      for(let i=1;i<points.length-1;i++){
        const a=points[i-1],b=points[i];
        const crosses=a.x===b.x
          ? a.x>art.left&&a.x<art.right&&Math.max(a.y,b.y)>art.top&&Math.min(a.y,b.y)<art.bottom
          : a.y>art.top&&a.y<art.bottom&&Math.max(a.x,b.x)>art.left&&Math.min(a.x,b.x)<art.right;
        expect(crosses).toBe(false);
      }
      const previous=points[points.length-2];
      expect(entry==='side'?previous.y===end.y:previous.x===end.x).toBe(true);
      const path=roundedLeaderPath(points);
      expect(path).toContain(' Q ');
      expect(path).toMatch(new RegExp(` L ${end.x} ${end.y}$`));
      expect(path).not.toMatch(/NaN|Infinity/);
    });
  }
  it('handles aligned labels and short segments without overshooting corners',()=>{
    const path=roundedLeaderPath([{x:0,y:0},{x:0,y:0},{x:2,y:0},{x:2,y:2}]);
    expect(path).toBe('M 0 0 L 1 0 Q 2 0 2 1 L 2 2');
  });
});
