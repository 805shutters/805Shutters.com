import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { contractAnatomyLabels } from './contract-anatomy';
import { SHUTTER_REFERENCE_SHA256, SHUTTER_REFERENCE_TARGETS, shutterDetailTarget } from './shutter-anatomy-targets';
import { anatomyAttachmentExamples } from './fixtures/anatomy-attachment-examples';

describe('approved shutter attachment contract', () => {
  it('requires target review whenever the underlying artwork changes', () => {
    expect(createHash('sha256').update(readFileSync('public/images/contract-illustrations/c-v1/shutters.webp')).digest('hex')).toBe(SHUTTER_REFERENCE_SHA256);
  });
  it('keeps every region within the actual raster and outside the white margins', () => {
    for (const [x,y,w,h] of Object.values(SHUTTER_REFERENCE_TARGETS)) {
      expect(x).toBeGreaterThanOrEqual(133);
      expect(x+w).toBeLessThanOrEqual(528);
      expect(y).toBeGreaterThanOrEqual(20);
      expect(y+h).toBeLessThanOrEqual(586);
    }
  });
  it('separates descriptions of different components without losing or duplicating selections', () => {
    for (const example of anatomyAttachmentExamples.filter(e=>e.product.includes('Shutters'))) {
      const model = contractAnatomyLabels(example.product, example.options);
      for (const callout of model.callouts) {
        const targets = new Set(callout.details.map(shutterDetailTarget));
        expect(targets.size).toBe(1);
        expect(callout.shutterTarget || null).toBe([...targets][0]);
      }
      for (const detail of model.specifications) expect(model.callouts.flatMap(c=>c.details).filter(d=>d.label===detail.label&&d.value===detail.value)).toHaveLength(1);
    }
  });
  it('points hidden tilt at a stile, louvers at a blade, hinges at a hinge, and frame descriptions at the frame', () => {
    const model = contractAnatomyLabels(anatomyAttachmentExamples[0].product, anatomyAttachmentExamples[0].options);
    for (const [label,target] of [['Tilt Type','stile'],['Louver Size','louver'],['Hinge Color','hinge'],['Frame Type','frame'],['Panel Config','panel']]) {
      expect(model.callouts.find(c=>c.details.some(d=>d.label===label))?.shutterTarget).toBe(target);
    }
  });
});
