import { describe,expect,it } from 'vitest';
import { anatomyShadeStudy } from './anatomy-shade-study';
import { renderDrawingIdentity } from './anatomy-render-studies';
describe('custom shade components',()=>{
  it('has distinct real assets for all five Norman Roman folds',()=>{
    const folds=['Flat Fold without Seams','Flat Fold with Batten Back','Soft Fold','Edge Banded','Ribbon Banded'];
    expect(new Set(folds.map(f=>anatomyShadeStudy('Roman Shades',[`Fold Style: ${f}`,'Lift System: Cordless'])!.src)).size).toBe(5);
  });
  it('retains the chosen fold while composing the correct side loop or remote',()=>{
    const base=['Fold Style: Soft Fold'];
    const left=anatomyShadeStudy('Roman Shades',[...base,'Lift System: Continuous Cord Loop','Control Side: Left'])!;
    const motor=anatomyShadeStudy('Roman Shades',[...base,'Lift System: Motorized'])!;
    expect(left.loopSide).toBe('left');expect(left.remote).toBe(false);expect(motor.remote).toBe(true);expect(motor.loopSide).toBeUndefined();expect(left.src).toBe(motor.src);
    expect(renderDrawingIdentity('Roman Shades',[...base,'Lift System: Continuous Cord Loop','Control Side: Right'])).not.toBe(renderDrawingIdentity('Roman Shades',[...base,'Lift System: Continuous Cord Loop','Control Side: Left']));
  });
  it('never fills in unknown hardware or treats SmartFold/day-night as an ordinary Roman',()=>{
    expect(anatomyShadeStudy('Roman Shades',['Lift System: AutoWand'])!.controlDrawn).toBe(false);
    expect(anatomyShadeStudy('Roman Shades',['Lift System: Continuous Cord Loop'])!.loopSide).toBeUndefined();
    expect(anatomyShadeStudy('SmartFold Shades',[])).toBeNull();
    expect(anatomyShadeStudy('Roman Shades',['Shade Type: Day & Night'])).toBeNull();
  });
});
