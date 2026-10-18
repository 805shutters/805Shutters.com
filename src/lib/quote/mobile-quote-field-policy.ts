/** Quote-only collection policy. Choice values still come from the exact manufacturer's
 * configurator; this module never supplies catalog values or changes pricing eligibility.
 * Pricing means a quote input, NOT a promise of a surcharge or automatic pricing support.
 */
export type MobileFieldPurpose = 'pricing' | 'contract' | 'build' | 'review';
export type MobileFieldContext = { productType?: string; manufacturer?: string | null; productId?: string; control?: string };
const pricing = new Set([
 'supplier','catalog_product_id','catalog_program_id','quote_lab_product_id','material','fabric','fabric_color_id','fabric_color_code','color','vertical_color','fabric_group','cell_size','light_control','shade_type',
 'louver_size','slat_size','frame_type','panel_config','shutter_type','size_type','lift_system','tilt_type','control_system','control_type','operating_system','motor_type','remote_type','valance',
 'split_tilt','divider_rail','sundance_cellular_system','sundance_cellular_shape','sundance_cellular_shape_geometry','sundance_cellular_bottom_fabric_id','sundance_blind_grade','sundance_blind_ladder','sundance_blind_tape_code','sundance_blind_valance',
]);
// Configuration identities and priced construction options used by the existing
// manufacturer engines. Their values continue to come from product-specific routes.
for(const key of ['widest_panel_width_inches','extension_rod','application','honeycomb_application','roller_application','product_line','onyx_order_type','onyx_t_post_count','t_post','frame_extension_inches','stile_width','stile_profile','stile_join','panel_closure','astragal','cutout','wood_cutout_left_type','wood_cutout_right_type','faux_blind_count','lotus_blind_count','fold_style','lining','roman_fabric_category','fabric_orientation','seaming','split_splice','top_treatment_class','hem_bar','premium_hardware','light_guard_rails','perfectsheer_light_guard','perfectsheer_valance_fabric','perfectsheer_valance_height','perfectsheer_valance_joinery','vane_style','smartdrape_extra_vane_packs','smartdrape_extra_wands','smartdrape_keystone_joints','sundance_blind_rounded_corners','sundance_blind_connection'])pricing.add(key);
for(const key of ['roman_style','vane_size','catalog_sundance_vertical_valance_id','sundance_portfolio_control','sundance_shade_control','sundance_sheerview_control','sundance_walden_control','sundance_zebra_control','sundance_vertical_type','sundance_zebra_cassette','sundance_sheerview_headrail','sundance_portfolio_liner','sundance_portfolio_front_valance','sundance_portfolio_back_valance','sundance_portfolio_interior_valance'])pricing.add(key);
const contract = new Set(['sundance_zebra_chain','sundance_zebra_cassette_color','sundance_sheerview_cord_option','sundance_sheerview_headrail_finish','sundance_sheerview_recess','sundance_portfolio_returns','installation_method','perfectsheer_installation','rail_color','vertical_hardware_color','smartdrape_headrail_color','smartdrape_wand_color','valance_returns','side_by_side_position','vertical_pair_mode','wood_matching_group','wood_common_group','side_by_side','perfectsheer_side_by_side_id','perfectsheer_common_valance_id',
 'mount_type','onyx_mount','control_side','chain_location','chain_side','wand_side','wand_location','tilt_side','tilt_location','sundance_blind_wand','folding_direction','draw_direction','stack_option','roll_type','roll_direction','hinge_color',
]);
const build = new Set([
 'hold_downs','wood_hold_down','perfectsheer_magnetic_hold_down','honeycomb_shim_layers','perfectsheer_shim_layers','wood_shim_layers','vertical_shim_layers','vertical_wand_drop_inches','wand_drop_inches','perfectsheer_valance_width','assembly','hold_down_brackets','spacer_blocks','side_cuts','extra_valance_charge',
 'sundance_blind_assembly','sundance_blind_hold_down','sundance_blind_spacer','sundance_blind_cutout_sides','sundance_blind_cutout_details','sundance_blind_extra_valance','sundance_blind_extra_valance_inches',
 'sundance_zebra_assembly','sundance_portfolio_assembly','sundance_portfolio_drop','sundance_portfolio_valance_depth','sundance_portfolio_valance_length','sundance_cellular_assembly','sundance_sheerview_assembly','sundance_assemblies',
 'honeycomb_wand_length','honeycomb_wand_color','roman_wand_length','roman_chain_length','smartfold_wand_length','perfectsheer_wand_length','contract_wand_drop_inches','citylights_wand_drop','smartprivacy_wand_drop','wood_wand_drop',
 'contract_hold_down_brackets','contract_spacer_blocks','contract_shim_layers','mount_depth_inches','available_depth_inches','opening_diagonal_difference_inches',
]);
export function mobileQuoteFieldPurpose(field: string, context: MobileFieldContext = {}): MobileFieldPurpose {
 const key=field.replace(/^json:/,'');
 if(build.has(key))return 'build';
 if(contract.has(key))return 'contract';
 // Blind slats and shutter louvers are pricing identities; don't apply them to unrelated products.
 if(['louver_size','slat_size'].includes(key)&&context.productType&&!/Shutters|Blinds/.test(context.productType))return 'review';
 if(pricing.has(key))return 'pricing';
 // Unmapped manufacturer-specific fields stay visible for review. Never label an
 // unknown field "not price affecting" or silently discard an existing selection.
 return 'review';
}
export const mobileFieldLabels:Record<MobileFieldPurpose,string>={pricing:'Pricing',contract:'Contract',build:'Build detail',review:'Product choice'};
