import { describe, expect, it } from 'vitest';
import { isQuotePricingInput, quotePricingInputs } from './quote-input-policy';

describe('pricing-only quote input policy', () => {
  it.each([
    ['Roman', ['mount_depth_inches', 'roman_mount_fit', 'roman_chain_unobstructed']],
    ['Honeycomb and vertical honeycomb', ['honeycomb_mount_fit', 'honeycomb_recess_depth_inches', 'honeycomb_charging_port_recess_inches', 'honeycomb_charging_opening_height_inches', 'honeycomb_charging_obstruction', 'honeycomb_semi_inside_tensioner_holder']],
    ['SmartFold', ['smartfold_chain_unobstructed', 'smartfold_light_guard_recess', 'smartfold_full_recess_depth_inches', 'smartfold_fascia_recess', 'smartfold_fascia_recess_depth_inches']],
    ['SmartFold and PerfectSheer magnets', ['magnet_left_clearance_inches', 'magnet_right_clearance_inches', 'magnet_bottom_clearance_inches']],
    ['CityLights, wood and faux wood', ['mount_depth_inches', 'citylights_mount_fit', 'smartprivacy_mount_fit', 'ultimate_mount_fit', 'wood_mount_fit']],
    ['SmartDrape', ['smartdrape_ceiling_attachment', 'pocket_depth_inches', 'pocket_height_inches']],
    ['Unpriced construction details', ['shelf_depth', 'shelf_supported_weight_lbs', 'wood_cutout_left_width', 'wood_return_inches', 'roman_banding_layout', 'wood_keystone_location_1']],
    ['Motorized products', ['existing_remote_work_order_number']],
    ['Onyx shutter installation evidence', ['available_depth_inches', 'opening_diagonal_difference_inches', 'flat_mounting_area_inches', 'hardware_clearance_inches', 'onyx_panel_1_width_inches', 'onyx_panel_24_height_inches', 'onyx_t_post_5_position_inches', 'onyx_tilt_section_3_inches']],
  ])('omits %s order measurements from quote controls', (_family, fields) => {
    for (const field of fields) {
      expect(isQuotePricingInput(field), field).toBe(false);
      expect(isQuotePricingInput(`json:${field}`), `json:${field}`).toBe(false);
    }
  });

  it.each([
    'supplier', 'product_type', 'fabric', 'fabric_color_code', 'price_group', 'width', 'height',
    'mount_type', 'roman_shim_layers', 'wood_shim_layers', 'honeycomb_side_mount_kit',
    'honeycomb_light_guard', 'installation_method', 'smartfold_installation', 'motor_type', 'lift_system',
    'wood_cutout_left_type', 'wood_keystone_count', 'smartfold_common_gap_after', 'roman_remote_quantity',
    'frame_type', 'louver_size', 'split_tilt', 'panel_config', 'roller_valance_width', 'unrecognized_priced_option',
  ])('preserves grid or priced option %s', field => {
    expect(isQuotePricingInput(field)).toBe(true);
    expect(isQuotePricingInput(`json:${field}`)).toBe(true);
  });

  it('filters both incomplete inputs and populated confirmation chips without erasing saved data', () => {
    const saved = Object.freeze({ mount_depth_inches: 4, shelf_depth: 8, fabric_color_code: 'F0183' });
    const options = Object.freeze([
      Object.freeze({ field: 'json:mount_depth_inches', label: 'Mounting depth', value: saved.mount_depth_inches }),
      Object.freeze({ field: 'json:shelf_depth', label: 'Shelf depth', value: saved.shelf_depth }),
      Object.freeze({ field: 'json:fabric_color_code', label: 'Fabric', value: saved.fabric_color_code }),
    ]);
    const visible = quotePricingInputs(options);
    expect(visible).toEqual([options[2]]);
    expect(visible[0]).toBe(options[2]);
    expect(saved.mount_depth_inches).toBe(4);
    expect(options).toHaveLength(3);
  });
});
