import { describe,expect,it } from 'vitest';
import { fabricPerformanceLabels } from './fabric-performance-labels';
describe('fabric performance labels',()=>{
  it('emphasizes the recorded fabric light control and keeps lining distinct',()=>{
    expect(fabricPerformanceLabels(['Light Control: Room Darkening','Color: Ivory'])).toEqual(['Room-darkening fabric']);
    expect(fabricPerformanceLabels(['Light Control: Light Filtering','Lining: Blackout'])).toEqual(['Light-filtering fabric','Blackout lining']);
    expect(fabricPerformanceLabels(['Light Control: Blackout'])).toEqual(['Blackout fabric']);
  });
  it('reads catalogue fabric labels but does not infer opacity from a dark color or abbreviation',()=>{
    expect(fabricPerformanceLabels(['Fabric: 3 inch Room Darkening_S70PNRD'])).toEqual(['Room-darkening fabric']);
    expect(fabricPerformanceLabels(['Color: Midnight Black','Fabric: Acme RD'])).toEqual([]);
  });
  it('uses an explicit selection over an example style and preserves dual fabric descriptions',()=>{
    expect(fabricPerformanceLabels(['Light Control: Room Darkening'],'Light Filtering')).toEqual(['Room-darkening fabric']);
    expect(fabricPerformanceLabels(['Light Control: Light Filtering / Room Darkening'])).toEqual(['Room-darkening fabric','Light-filtering fabric']);
  });
});
