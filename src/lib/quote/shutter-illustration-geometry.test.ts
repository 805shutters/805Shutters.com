import { describe, expect, it } from 'vitest';
import { proportionedSketchParts } from '@/components/quote/SpecialtyShutterSketch';
import { specialtyShutterSketch } from './specialty-shutter-illustrations';
import { shutterGeometryFromDimensions, shutterIllustrationGeometry } from './shutter-illustration-geometry';

describe('measured specialty shutter proportions', () => {
  const sketch = specialtyShutterSketch('Shutters', ['Specialty shape: Louvered Arch', 'Panel configuration: LR', 'Tilt: Standard Tilt'])!;
  it.each([[70,45],[45,70],[24.5,60.125]])('keeps a %s × %s opening at its measured aspect ratio', (width,height) => {
    const p=proportionedSketchParts(sketch,shutterIllustrationGeometry(width,height))[0];
    expect(p.w/p.h).toBeCloseTo(width/height,10);
    expect(p.path).not.toMatch(/NaN|Infinity/);
  });
  it('uses the recorded leg height to place the arch spring line', () => {
    const p=proportionedSketchParts(sketch,shutterIllustrationGeometry(70,45,['Leg height: 25"']))[0];
    expect(p.path).toContain(`V${20+(200/70)*20}`);
  });
  it('reads decimal and fractional staff dimensions', () => {
    expect(shutterGeometryFromDimensions('70 × 45')).toEqual({aspectRatio:70/45});
    expect(shutterGeometryFromDimensions('70" W × 45" H')).toEqual({aspectRatio:70/45});
    expect(shutterGeometryFromDimensions('24 1/2" W × 60 1/8" H')).toEqual({aspectRatio:24.5/60.125});
  });
  it('uses independently recorded left/right leg heights for a rake', () => {
    const rake=specialtyShutterSketch('Shutters',['Specialty shape: YS21'])!;
    const p=proportionedSketchParts(rake,shutterIllustrationGeometry(70,45,['Left leg height: 25','Right leg height: 45']))[0];
    expect(p.path).toContain(`M20 ${20+200/70*20}L220 20`);
  });
  it('leaves missing and invalid measurements as references', () => {
    for(const width of [null,0,NaN,Infinity,-1])expect(shutterIllustrationGeometry(width,45)).toBeUndefined();
    expect(shutterGeometryFromDimensions('Measurements pending')).toBeUndefined();
  });
  it('projects dimensionless louver, rail and curve proportions', () => {
    expect(shutterIllustrationGeometry(70,45,['Louver size: 3 1/2"','Divider rail height: 20"','Left leg height: 25"'])).toEqual({aspectRatio:70/45,louverPitchFraction:3.5/45,dividerHeightFraction:20/45,leftLegHeightFraction:25/45});
  });
});
