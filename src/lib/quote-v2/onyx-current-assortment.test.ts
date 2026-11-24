import { expect, it } from 'vitest';
import { validateOnyxCurrentAssortment } from './onyx-current-assortment';
import type { SelectionContext } from './core';

const selection = (tilt_type: string): SelectionContext => ({
  manufacturerId: 'onyx', productId: 'onyx_shutters', programId: 'painted_basswood',
  catalogAsOf: '2026-11-23', catalogVersion: 'audit', widthInches: 36, heightInches: 48,
  quantity: 1, options: {}, configuration: {
    tilt_type, color: '100_Pure White', frame_type: 'Z Fine', frame_sides: '4',
    mount_type: 'inside', louver_size_inches: 3.5, hinge_color: 'White', shutter_type: 'Regular',
  },
});

it('accepts the builder standard-tilt label as the explicit front-center portal option', () => {
  expect(validateOnyxCurrentAssortment(selection('C - Front Center Tiltrod'))).toEqual([]);
  expect(validateOnyxCurrentAssortment(selection('Standard Tilt'))).toEqual([]);
});
it('does not guess which hidden-tilt construction an ambiguous label means', () => {
  expect(validateOnyxCurrentAssortment(selection('Invisible Tilt')))
    .toEqual(expect.arrayContaining([expect.objectContaining({ruleId:'onyx.current_assortment.tilt'})]));
});
