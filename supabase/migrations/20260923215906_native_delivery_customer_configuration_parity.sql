-- Customer-safe field list matches V2_CUSTOMER_CONFIGURATION_FIELDS.
-- A database regression compares every field with the application projection.
-- Preserve all validation, grants, prices, immutable snapshots, and delivery state.
CREATE OR REPLACE FUNCTION public.quote_v2_customer_safe_configuration(p_selection jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_allowed_keys constant text[] := array[
    'roller_valance_width',
    'roller_valance_return_length',
    'roller_valance_fascia_color',
    'roller_valance_end_cap_color',
    'roller_valance_joinery',
    'roller_valance_keystone_centers',
    'standalone_valance_inner_length',
    'standalone_valance_returns',
    'standalone_valance_return_length',
    'standalone_valance_joinery',
    'standalone_valance_layout',
    'standalone_valance_keystone_positions',
    'standalone_valance_piece_lengths',
    'replacement_pack_style',
    'replacement_price_shade_length',
    'replacement_vane_length',
    'replacement_shade_type',
    'replacement_stack',
    'replacement_color_mode',
    'replacement_second_color',
    'replacement_pack_contents',
    'ancillary_unit',
    'ancillary_yards',
    'ancillary_cover_size',
    'ancillary_edge',
    'ancillary_pattern',
    'temporary_shade',
    'shutter_type',
    'track_type',
    'track_system',
    'bypass_type',
    'folding_direction',
    'supplier',
    'material',
    'color',
    'color_name',
    'fabric',
    'fabric_collection',
    'fabric_group',
    'fabric_color_collection',
    'fabric_color_name',
    'fabric_color_code',
    'vertical_color',
    'vertical_hardware_color',
    'vertical_wand_drop_inches',
    'vertical_shim_layers',
    'rear_fabric_class',
    'rear_fabric_collection',
    'rear_fabric_color_name',
    'rear_fabric_color_code',
    'back_fabric',
    'back_fabric_collection',
    'back_fabric_color_name',
    'back_fabric_color_code',
    'back_color',
    'cell_size',
    'rear_cell_size',
    'day_night_top_layer',
    'slope_angle_degrees',
    'back_cell_size',
    'application',
    'window_application',
    'shade_type',
    'roller_application',
    'mount_type',
    'onyx_mount',
    'measurement_basis',
    'size_type',
    'order_type',
    'onyx_order_type',
    'lift_system',
    'honeycomb_operating_system',
    'operating_system',
    'control_type',
    'control_side',
    'chain_location',
    'draw_direction',
    'valance',
    'valance_returns',
    'hem_bar',
    'back_hem_bar',
    'roller_top_treatment',
    'top_treatment_class',
    'roller_tube',
    'tube_class',
    'tube',
    'motor_type',
    'motor_position',
    'dc_power_supply',
    'shared_power_panel_id',
    'fold_size',
    'perfectsheer_light_guard',
    'perfectsheer_light_guard_color',
    'perfectsheer_magnetic_hold_down',
    'perfectsheer_magnet_color',
    'perfectsheer_shim_layers',
    'perfectsheer_side_by_side_id',
    'perfectsheer_common_valance_id',
    'perfectsheer_common_position',
    'perfectsheer_common_gap_after',
    'perfectsheer_valance_width',
    'perfectsheer_valance_returns',
    'perfectsheer_valance_return_size',
    'perfectsheer_valance_joinery',
    'perfectsheer_keystone_count',
    'perfectsheer_keystone_layout',
    'perfectsheer_splice_span_offset',
    'perfectsheer_keystone_location_1',
    'perfectsheer_keystone_location_2',
    'perfectsheer_keystone_location_3',
    'perfectsheer_keystone_location_4',
    'perfectsheer_keystone_location_5',
    'perfectsheer_wand_length',
    'perfectsheer_installed_on_door',
    'perfectsheer_extra_charging_kits',
    'perfectsheer_extension_cables',
    'perfectsheer_extension_color',
    'perfectsheer_extra_harnesses',
    'smartdrape_pair_id',
    'smartdrape_pair_position',
    'smartdrape_center_keystone',
    'smartdrape_extra_vane_packs',
    'smartdrape_vane_pack_style',
    'smartdrape_extra_wands',
    'smartdrape_ceiling_attachment',
    'smartdrape_keystone_joints',
    'smartdrape_charging_wand_length',
    'smartdrape_extra_charging_kits',
    'smartdrape_repeaters',
    'smartdrape_remote_quantity',
    'smartdrape_remote_channel',
    'smartdrape_color_ring_sets',
    'smartdrape_hub_quantity',
    'smartdrape_headrail_color',
    'smartdrape_wand_color',
    'smartdrape_charging_wand_color',
    'smartdrape_second_color',
    'perfectsheer_remote_quantity',
    'perfectsheer_remote_channel',
    'perfectsheer_color_ring_sets',
    'perfectsheer_repeaters',
    'perfectsheer_solar_panel',
    'perfectsheer_motor_network',
    'perfectsheer_shared_hub_id',
    'shared_automate_hub_id',
    'perfectsheer_installation',
    'perfectsheer_valance_height',
    'perfectsheer_valance_fabric',
    'perfectsheer_wood_finish',
    'perfectsheer_wand_color',
    'perfectsheer_tube_diameter',
    'perfectsheer_chain_length',
    'perfectsheer_chain_unobstructed',
    'smartfold_installation',
    'smartfold_shim_layers',
    'smartfold_hold_down',
    'smartfold_magnet_color',
    'smartfold_pole',
    'smartfold_light_guard_color',
    'smartfold_fabric_pattern',
    'smartfold_hardware_color',
    'smartfold_hem_style',
    'smartfold_hem_color',
    'smartfold_hem_end_cap',
    'smartfold_fascia_style',
    'smartfold_fascia_color',
    'smartfold_fascia_end_cap',
    'smartfold_valance_fabric_code',
    'smartfold_wood_valance_color',
    'smartfold_chain_color',
    'smartfold_light_guard_recess',
    'smartfold_full_recess_depth_inches',
    'smartfold_fascia_recess',
    'smartfold_fascia_recess_depth_inches',
    'smartfold_wand_length',
    'smartfold_wand_color',
    'smartfold_chain_length',
    'smartfold_chain_unobstructed',
    'full_fold_required',
    'smartfold_side_by_side_id',
    'smartfold_common_valance_id',
    'smartfold_common_position',
    'smartfold_common_gap_after',
    'smartfold_valance_width',
    'smartfold_valance_returns',
    'smartfold_valance_return_size',
    'smartfold_valance_joinery',
    'smartfold_keystone_count',
    'smartfold_keystone_layout',
    'smartfold_splice_span_offset',
    'smartfold_keystone_location_1',
    'smartfold_keystone_location_2',
    'smartfold_keystone_location_3',
    'shelf_depth',
    'shelf_measurement_basis',
    'shelf_supported_weight_lbs',
    'wood_cutout_left_type',
    'wood_cutout_left_width',
    'wood_cutout_left_top',
    'wood_cutout_left_bottom',
    'wood_cutout_right_type',
    'wood_cutout_right_width',
    'wood_cutout_right_top',
    'wood_cutout_right_bottom',
    'installation_method',
    'pocket_depth_inches',
    'pocket_height_inches',
    'aluminum_shim',
    'long_l_bracket',
    'remote_type',
    'power_configuration',
    'roller_power_configuration',
    'motorization_selections',
    'hub_required',
    'roller_coupling_count',
    'coupled_shade_count',
    'lightguard_360_shade_count',
    'coupling_arrangement',
    'fold_style',
    'lining',
    'fabric_orientation',
    'seaming',
    'seamed',
    'railroaded',
    'banding_color',
    'common_valance_panel_widths',
    'common_valance_panel_1_width',
    'common_valance_panel_2_width',
    'common_valance_gap',
    'frame_type',
    'honeycomb_frame_type',
    'frame_extension_inches',
    'mount_depth_inches',
    'finish_type',
    'contract_mount_fit',
    'contract_wand_drop_inches',
    'contract_headrail_color',
    'contract_valance_length_inches',
    'contract_return_inches',
    'contract_hold_down_brackets',
    'contract_spacer_blocks',
    'contract_shim_layers',
    'san_clemente_mount_fit',
    'san_clemente_pole_36_quantity',
    'san_clemente_pole_60_quantity',
    'san_clemente_attachment_quantity',
    'available_depth_inches',
    'panel_config',
    'panel_configuration',
    'panel_widths_inches',
    'panel_heights_inches',
    'honeycomb_panel_net_widths',
    'honeycomb_panel_net_heights',
    'stacking_configuration',
    'vertical_stacking',
    'honeycomb_side_mount_kit',
    'honeycomb_extra_charging_kits',
    'honeycomb_extension_cables',
    'honeycomb_extension_color',
    'honeycomb_charging_extension_poles',
    'honeycomb_extra_harnesses',
    'honeycomb_repeaters',
    'honeycomb_color_ring_sets',
    'honeycomb_remote_quantity',
    'honeycomb_remote_channel',
    'honeycomb_solar_panel',
    'smartprivacy_wand_drop',
    'wood_wand_drop',
    'wood_mount_fit',
    'wood_valance_returns',
    'wood_return_inches',
    'wood_valance_width_inches',
    'wood_shim_layers',
    'wood_bracket_installation',
    'wood_hold_down',
    'wood_common_group',
    'wood_common_position',
    'wood_common_gap_after',
    'wood_matching_group',
    'wood_keystone_count',
    'wood_keystone_layout',
    'wood_keystone_location_1',
    'wood_keystone_location_2',
    'wood_keystone_location_3',
    'citylights_wand_drop',
    'citylights_mount_fit',
    'citylights_shim_layers',
    'citylights_bracket_installation',
    'citylights_hold_down',
    'citylights_matching_group',
    'ultimate_wand_drop',
    'smartprivacy_mount_fit',
    'ultimate_mount_fit',
    'smartprivacy_valance_returns',
    'ultimate_valance_returns',
    'smartprivacy_return_inches',
    'ultimate_return_inches',
    'smartprivacy_valance_width_inches',
    'ultimate_valance_width_inches',
    'smartprivacy_shim_layers',
    'ultimate_shim_layers',
    'smartprivacy_side_mount',
    'ultimate_side_mount',
    'smartprivacy_bracket_installation',
    'ultimate_bracket_installation',
    'smartprivacy_hold_down',
    'ultimate_hold_down',
    'ultimate_common_group',
    'ultimate_common_position',
    'ultimate_common_gap_after',
    'ultimate_matching_group',
    'ultimate_keystone_count',
    'ultimate_keystone_layout',
    'ultimate_keystone_location_1',
    'ultimate_keystone_location_2',
    'ultimate_keystone_location_3',
    'ultimate_cutout_left_type',
    'ultimate_cutout_left_width',
    'ultimate_cutout_left_top',
    'ultimate_cutout_left_bottom',
    'ultimate_cutout_right_type',
    'ultimate_cutout_right_width',
    'ultimate_cutout_right_top',
    'ultimate_cutout_right_bottom',
    'honeycomb_wand_length',
    'honeycomb_wand_color',
    'honeycomb_motor_network',
    'honeycomb_power_cable_exit',
    'honeycomb_shim_layers',
    'honeycomb_mounting_plate',
    'honeycomb_pole_quantity',
    'honeycomb_pole_length',
    'honeycomb_light_guard',
    'honeycomb_light_guard_color',
    'honeycomb_magnet_color',
    'vertical_pair_mode',
    'vertical_pair_group',
    'vertical_pair_position',
    'vertical_mounting',
    'vertical_shim_layers',
    'vertical_left_width_inches',
    'vertical_right_width_inches',
    'split_splice',
    'specialty_shape',
    'left_leg_height_inches',
    'right_leg_height_inches',
    'leg_height_inches',
    't_post',
    't_post_count',
    't_post_positions_inches',
    'divider_rail',
    'divider_rail_count',
    'divider_rail_location_mode',
    'divider_rail_positions_inches',
    'louver_size',
    'louver_size_inches',
    'tilt_type',
    'split_tilt',
    'divider_rail_location',
    'divider_rail_height',
    'offset_tilt_distance_inches',
    'tilt_rod_section_lengths_inches',
    'hidden_tilt_notch_back_of_louver',
    'hinge_color',
    'chain_color',
    'rail_color',
    'magnet_color',
    'premium_hardware_color',
    'non_operable',
    'french_door_cutout',
    'handle_center_from_bottom_inches',
    'lock_center_from_bottom_inches',
    'horizontal_t_post',
    'opening_diagonal_difference_inches',
    'flat_mounting_area_inches',
    'hardware_clearance_inches',
    'hard_surface_install',
    'ladder_over_15ft',
    'requires_takedown',
    'side_by_side',
    'side_by_side_position',
    'side_by_side_wand_orientation',
    'expedited'
  ]::text[];
  v_manufacturer text;
  v_key text;
  v_value jsonb;
  v_component jsonb;
  v_component_safe jsonb;
  v_motor_components jsonb := '[]'::jsonb;
  v_safe_selections jsonb := '{}'::jsonb;
  v_units numeric;
begin
  if jsonb_typeof(p_selection) is distinct from 'object'
    or jsonb_typeof(p_selection -> 'configuration') is distinct from 'object'
    or jsonb_typeof(p_selection -> 'options') is distinct from 'object'
  then
    raise exception 'The canonical Quote V2 selection cannot be projected safely.'
      using errcode = '22023';
  end if;

  v_manufacturer := btrim(coalesce(p_selection ->> 'manufacturerId', ''));
  if v_manufacturer = '' then
    raise exception 'The canonical Quote V2 selection is missing its manufacturer.'
      using errcode = '22023';
  end if;

  for v_key, v_value in
    select key, value
      from jsonb_each(p_selection -> 'configuration')
  loop
    if not (v_key = any(v_allowed_keys))
      and v_key <> 'motorization_selections'
    then
      continue;
    end if;

    -- Match conditional customer visibility in customerConfigurationFromSelection.
    -- Expedited is taken exclusively from canonical options below.
    if v_key = 'expedited' then continue; end if;
    if v_key in ('smartfold_light_guard_recess', 'smartfold_full_recess_depth_inches')
      and not (
        coalesce(p_selection #>> '{configuration,mount_type}', '') = 'Inside Mount'
        and (lower(coalesce(p_selection #>> '{configuration,basic_light_guard}', '')) in ('yes','true','basic','basic light guard','basic_light_guard')
          or lower(coalesce(p_selection #>> '{configuration,light_guard}', '')) in ('yes','true','basic','basic light guard','basic_light_guard'))
      ) then continue; end if;
    if v_key in ('smartfold_fascia_recess', 'smartfold_fascia_recess_depth_inches')
      and not (
        coalesce(p_selection #>> '{configuration,mount_type}', '') = 'Inside Mount'
        and coalesce(p_selection #>> '{configuration,valance}', '') in ('Curved Fascia','Square Fascia')
      ) then continue; end if;
    if v_key in ('smartfold_wand_length', 'smartfold_wand_color')
      and not (
        coalesce(p_selection #>> '{configuration,lift_system}', '') = 'Motorized'
        and coalesce(p_selection #>> '{configuration,motor_type}', '') = 'AutoWand'
      ) then continue; end if;
    if v_key ~ '^wood_cutout_(left|right)_(width|top|bottom)$' then
      if trim(both '_' from regexp_replace(lower(coalesce(
        p_selection -> 'configuration' ->> ('wood_cutout_' || split_part(v_key, '_', 3) || '_type'), ''
      )), '[^a-z0-9]+', '_', 'g')) not in ('corner_bottom','side_middle') then continue; end if;
      if split_part(v_key, '_', 4) = 'bottom' and trim(both '_' from regexp_replace(lower(coalesce(
        p_selection -> 'configuration' ->> ('wood_cutout_' || split_part(v_key, '_', 3) || '_type'), ''
      )), '[^a-z0-9]+', '_', 'g')) <> 'side_middle' then continue; end if;
    end if;

    if v_key = 'motorization_selections' then
      if jsonb_typeof(v_value) is distinct from 'array' then
        raise exception 'Customer motorization selections are malformed.'
          using errcode = '22023';
      end if;
      v_motor_components := '[]'::jsonb;
      for v_component in select value from jsonb_array_elements(v_value)
      loop
        if jsonb_typeof(v_component) is distinct from 'object'
          or jsonb_typeof(v_component -> 'groupId') is distinct from 'string'
          or btrim(coalesce(v_component ->> 'groupId', '')) = ''
          or jsonb_typeof(v_component -> 'optionId') is distinct from 'string'
          or btrim(coalesce(v_component ->> 'optionId', '')) = ''
          or jsonb_typeof(v_component -> 'role') is distinct from 'string'
          or btrim(coalesce(v_component ->> 'role', '')) = ''
          or jsonb_typeof(v_component -> 'units') is distinct from 'number'
        then
          raise exception 'A customer motorization component is malformed.'
            using errcode = '22023';
        end if;
        begin
          v_units := (v_component ->> 'units')::numeric;
        exception
          when invalid_text_representation or numeric_value_out_of_range then
            raise exception 'A customer motorization component has invalid units.'
              using errcode = '22023';
        end;
        if v_units < 1 or trunc(v_units) <> v_units then
          raise exception 'A customer motorization component has invalid units.'
            using errcode = '22023';
        end if;
        v_component_safe := jsonb_build_object(
          'groupId', v_component ->> 'groupId',
          'optionId', v_component ->> 'optionId',
          'role', v_component ->> 'role',
          'units', v_units
        );
        v_motor_components := v_motor_components || jsonb_build_array(v_component_safe);
      end loop;
      v_safe_selections := v_safe_selections
        || jsonb_build_object(v_key, v_motor_components);
    else
      if jsonb_typeof(v_value) not in ('string', 'number', 'boolean', 'null')
        and not (
          jsonb_typeof(v_value) = 'array'
          and not exists (
            select 1
              from jsonb_array_elements(v_value) item
             where jsonb_typeof(item.value) not in (
               'string', 'number', 'boolean', 'null'
             )
          )
        )
      then
        raise exception 'Customer configuration field % is malformed.', v_key
          using errcode = '22023';
      end if;
      v_safe_selections := v_safe_selections
        || jsonb_build_object(v_key, v_value);
    end if;
  end loop;

  if (p_selection -> 'options') ? 'expedited' then
    v_value := p_selection #> '{options,expedited}';
    if jsonb_typeof(v_value) not in ('string', 'number', 'boolean', 'null') then
      raise exception 'Customer configuration field expedited is malformed.'
        using errcode = '22023';
    end if;
    v_safe_selections := v_safe_selections
      || jsonb_build_object('expedited', v_value);
  end if;

  return jsonb_build_object(
    'manufacturerId', v_manufacturer,
    'selections', v_safe_selections
  );
end;
$function$;
