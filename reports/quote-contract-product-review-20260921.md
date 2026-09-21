# Quote and contract product review — September 21, 2026

## Scope and outcome

Reviewed every currently selectable product: **86 product IDs**, spanning **24 product-family types** and all five manufacturers. This is a product-detail/quote-input review, not a fresh certification of every supplier price. Existing account-specific price evidence gaps remain governed by their original pricing/manual-quote rules.

| Manufacturer | Offered product IDs reviewed |
|---|---:|
| Norman | 25 |
| Onyx | 9 |
| Polar | 12 |
| Lotus | 11 |
| Sundance | 29 |

### Customer documents

Keep room, product, sold dimensions, quantity, fabric/color, customer-selected appearance, operating system, purchased accessories, customer notes and amounts. Preserve the existing manufacturer-branding policy. Hide factory clearances/recess depths, support/bracket placement instructions, net-panel schedules, cutout coordinates, internal assembly/network IDs, source/program routing and internal financial metadata. Remove repeated fabric descriptions and valance-return rows when there is no valance.

A shared presentation boundary applies to CRM contract previews, customer links, mobile customer documents, email HTML/text and printed PDFs. The signed-document projection uses a fresh copy; immutable signed records and amounts stay intact. Unknown structured configuration records are never printed as arbitrary object dumps; known commercial records get readable summaries.

### Quote entry and pricing

Remove installation-only inputs in dedicated Norman Contract, San Clemente, Lotus parts and Sundance specialty/cutout forms. Restore the priced SmartDrape charging-wand selection/color and customer purchase choices including Roman banding, wood valance returns and Palladian shelf depth. Preserve billed cutout counts, specialty shape selection, grid dimensions, fabric/control choices, quantities and accessories. No grid values, rate factors, selling-price formulas, discount/shipping policy, or saved quote prices are rewritten by this change. Existing $25 blind/shade installation, manual-price overrides and line deletion remain in place.

### Verification

Focused tests cover customer filtering, retained commercial choices, immutable signed snapshots, unchanged quote amounts and pricing-only form edits. Full test/build results, release identity and authenticated production checks are reported with this task's final delivery. This ledger is the exhaustive product/field review, not proof that all 86 products were individually saved in production.

---

## Product inventory and classification

Inventory of the current CRM selector/catalog. **86 selectable product IDs**; counts: Lotus 11, Norman 25, Onyx 9, Polar 12, Sundance 29. Excluded from selector: `polar_exterior_clutch_unavailable`. This is presentation coverage, not source-price certification, availability certification, or live contract proof. Manual-required items remain selectable and must retain their exact product identity.

## Enumeration method

Executed buildUiCatalog(), projected productType through quoteLabProductType(), then applied the exact selectableQuoteProducts() used by ManufacturerProductButtons. Rules: manufacturer required; unavailable products excluded; manual_required destinations admitted; other products require at least one non-unavailable program. Product IDs below are all returned rows, not name guesses. Source files: src/lib/quote/catalog/index.ts, src/lib/quote/ui-catalog.ts, src/lib/quote-lab/builder.ts, src/mts-quote/lib/manufacturerProductWorkflow.ts, src/lib/quote/product-options.ts, custom product components, src/mts-quote/lib/quoteDesignDetails.ts.

## Contract presentation policy

Keep one clear product/material identity using the existing customer-branding policy (manufacturer names remain available to staff), customer-selected color/fabric (code + name once), visible style/finish, light/privacy characteristic, operation, sold configuration, selected accessories, room, sold dimensions, quantity, unit/line amount and explicit customer notes. Separate installation/service charges belong in pricing/service lines once. Do not show every default or repeated None/No/zero. Preserve a meaningful negative such as no valance/no motor only when needed to state what was purchased; do not blanket remove semantic choices.

Hide manufacturing and installation evidence: recess/depth/clearances, net-panel/louver schedules, required support, measurement confirmations, source pages/rule versions, factory order identifiers, internal program/grid/group/assembly UUIDs, donor candidates, calculated bracket/shim recipes, cost/margin/factor/reconciliation records. Hiding is presentation-only: do not clear saved configuration or alter prices. Unknown raw options and objects must not be dumped onto contracts.

**Do not confuse unpriced with customer-irrelevant:** banding layout, fabric orientation/pattern, visible end-cap/hem colors, customer-selected valance return appearance, chain/wand finish and controls can describe the delivered appearance/operation even if included at no charge. Conversely priced shims can be summarized as installation accessories rather than a technical layer-per-bracket recipe.

## Family classification

| Family | Customer detail / omission boundary |
|---|---|
| Shutters | Material/program, finish, louver, tilt, frame, panel layout, track/special shape, selected appearance/accessories. Hide manufacturing panels/louvers/hinge counts, geometry, support and templates. |
| Roller Shades | Fabric/code/color/opacity, lift/motor, roll direction, fascia/valance/hem color, single/dual/coupled arrangement, purchased guards/remotes. Hide tube/load checks, recess, donor stock, group IDs. |
| Roman Shades | Fabric/color, fold/style, lining or second fabric, banding appearance, lift/motor, valance, single/dual/twin arrangement. Hide chain safety, net-size evidence, seam/matching checks and group IDs. |
| Honeycomb Shades | Fabric/color/opacity, cell size, application (incl Day & Night/vertical/shape), control, rear fabric, stack, selected accessories. Hide cell-grid routing, net legs, cutout geometry, recess/charging clearances. |
| Sheer Shades | Fabric/color/opacity/vane size, control/motor, cassette/valance/hem, selected accessories. Hide tube size, recess, alignment/chain safety and manufacturing limits. |
| Mini Blinds | Color, material/slat size/finish/privacy, lift, valance, single/multiple blinds, purchased accessories. Hide net widths/donor candidates/support hardware. |
| Faux Wood Blinds | Color/finish/slat size, privacy/route, control, valance, multiple-blind arrangement, cutout choice, purchased accessories. Hide donor lists, custom cutout coordinates, return geometry and bracket counts. |
| Wood Blinds | Wood/finish/color/slat size, lift, valance, multiple-blind arrangement, cutout choice and purchased accessories. Hide finished net dimensions, return/keystone coordinates, brackets. |
| Vertical Blinds | Vane/fabric/color, complete blind vs track/vane-only, draw/stack, control, valance/headrail appearance and purchased accessories. Show component length and quantity for component-only sales; hide install calculations. |
| Smart Drapes | Fabric/color/alternating fabric, opacity, draw/stack, operation/motor, visible rail/wand finish, extra vane packs and purchased accessories. Hide pocket/ceiling clearances, joint/group IDs. |
| SmartFold Shades | Fabric/color/pattern, fold size, lift/motor, valance/fascia/hem appearance, Light Guard/hold-downs and purchased accessories. Hide mounting area/space, raceway/shim installation recipe, charging clearance, matching IDs. |
| Palladian Shelf | Shelf finish, sold dimensions and quantity; paired product context only when meaningful. Hide load checks, depth tolerances, with/without-product price program IDs. |
| Drapery Tracks | Track model/finish, straight/curved selection, stack, motor/control and purchased remotes. Hide motor/channel IDs, brackets/curvature fabrication coordinates. |
| Tension Shades | Fabric/color/opacity, control/motor, visible frame/guide finish and purchased accessories. Hide tension/anchor/load calculations. |
| Retractable Screens | Screen material/color, system/finish, motor/control and accessories. Hide installation/guide geometry and source pricing basis. |
| Awnings | Model, fabric/color, projection, frame finish, motor/control, selected sensors/lights/accessories. Hide mounting confirmations, bracket load/geometry, internal control codes. |
| Vinyl Blinds | Color/slat size, lift, valance, finished product identity and accessories. Hide donor SKU lists/cut allowances/net-size recipe. |
| Fabric Blinds | Fabric/color/opacity, vane/slat width, operation, valance and accessories. Hide price-group routing and supplier source records. |
| Woven Wood Shades | Fabric/color, shade style, lining/backing/edge binding, control, valance and accessories. Hide option table IDs and sewing/measurement schedules. |
| Parts & Accessories | Exact sold item/SKU, plain-language part name, color/model compatibility, sold quantity and applicable length. Hide observed offering IDs, compatibility evidence/reference notes and stock/cost records. |
| Vane Packs | Exact fabric/color, pack style A/B, pack count/contents and requested sold vane length. Hide original work order, source/internal request records. |
| Valances | Valance style/material/fabric/color, sold width/height and quantity, selected keystones/returns when visually relevant. Hide associated-line UUIDs, bracket/recess/return calculations. |
| Fabric by Yard | Fabric/code/color and ordered yardage. Hide fabricated width/height placeholders and source program/price-group records. |
| Decorative Pillow Covers | Fabric/code/color, cover shape/size, quantity and chosen trim. Hide factory template or price-table routing. |

## Exhaustive selectable-product ledger

Every row uses the family rule above plus the exception below. Shared-field count excludes specialized React forms: zero does **not** mean no options.

| Manufacturer | Product ID | Offered name | Family | Shared fields | Basis / exception |
|---|---|---|---|---:|---|
| Lotus | `lotus_dealer_listed_faux` | Exact dealer-listed item | Faux Wood Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Exact dealer SKU and item description required. |
| Lotus | `lotus_dealer_listed_mini` | Exact dealer-listed item | Mini Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Exact dealer SKU and item description required. |
| Lotus | `lotus_dealer_listed_parts` | Exact dealer-listed item | Parts & Accessories | 0 | Manual/held destination; retain chosen SKU/program identity. Exact dealer SKU and item description required. |
| Lotus | `lotus_dealer_listed_roller` | Exact dealer-listed item | Roller Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Exact dealer SKU and item description required. |
| Lotus | `lotus_dealer_listed_vertical` | Exact dealer-listed item | Vertical Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Exact dealer SKU and item description required. |
| Lotus | `lotus_dealer_listed_vinyl` | Exact dealer-listed item | Vinyl Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Exact dealer SKU and item description required. |
| Lotus | `lotus_faux_wood_blinds` | Lotus Faux Wood Blinds | Faux Wood Blinds | 5 | Existing retail route; no certification implied. |
| Lotus | `lotus_mini_blinds` | Lotus Aluminum Mini Blinds | Mini Blinds | 0 | Existing retail route; no certification implied. |
| Lotus | `lotus_roller_shades` | Lotus Roller Shades | Roller Shades | 0 | Existing retail route; no certification implied. |
| Lotus | `lotus_vertical_blinds` | Lotus Vertical Blinds | Vertical Blinds | 0 | Existing retail route; no certification implied. Seven complete/headrail/vane programs; dimensions and units vary. |
| Lotus | `lotus_vinyl_blinds` | Lotus Vinyl Blinds | Vinyl Blinds | 0 | Existing retail route; no certification implied. |
| Norman | `citylights_aluminum` | CityLights Cordless Aluminum Blinds | Mini Blinds | 11 | Existing retail route; no certification implied. |
| Norman | `faux_wood` | Ultimate Cordless Faux Wood Blinds | Faux Wood Blinds | 13 | Existing retail route; no certification implied. |
| Norman | `honeycomb` | Portrait Honeycomb Shades | Honeycomb Shades | 15 | Existing retail route; no certification implied. |
| Norman | `norman_contract_faux_wood` | Contract Cordless Faux Wood Blinds | Faux Wood Blinds | 9 | Manual/held destination; retain chosen SKU/program identity. |
| Norman | `norman_contract_vertical` | Contract 3.5-inch Vertical Blinds | Vertical Blinds | 8 | Manual/held destination; retain chosen SKU/program identity. |
| Norman | `norman_roller_separate_valance` | Soluna Roller Separate Valance | Valances | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Norman | `norman_roller_valance_only` | Soluna Roller Valance Only | Valances | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Norman | `norman_roman_fabric_by_yard` | Centerpiece Roman Fabric by Yard | Fabric by Yard | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Norman | `norman_roman_pillow_covers` | Centerpiece Decorative Pillow Covers | Decorative Pillow Covers | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Norman | `norman_shutters` | Norman Shutters | Shutters | 32 | Existing retail route; no certification implied. Six programs: woodlore, woodlore_plus, woodlore_aquashield, brightwood, normandy_painted, normandy_stained. |
| Norman | `norman_smartdrape_replacement_vanes` | SmartDrape Extra / Replacement Vane Packs | Vane Packs | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Norman | `norman_smartprivacy_valance_only` | SmartPrivacy Standalone Valance | Valances | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Norman | `norman_ultimate_faux_valance_only` | Ultimate Faux Wood Standalone Valance | Valances | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Norman | `palladian_shelf` | Palladian Window Shelf | Palladian Shelf | 4 | Existing retail route; no certification implied. |
| Norman | `perfectsheer` | PerfectSheer Shades | Sheer Shades | 32 | Existing retail route; no certification implied. |
| Norman | `roller` | Soluna Roller Shades | Roller Shades | 24 | Existing retail route; no certification implied. |
| Norman | `roman` | Centerpiece Roman Shades | Roman Shades | 16 | Existing retail route; no certification implied. |
| Norman | `san_clemente_faux_wood` | San Clemente Faux Wood | Faux Wood Blinds | 5 | Manual/held destination; retain chosen SKU/program identity. |
| Norman | `san_clemente_honeycomb` | San Clemente Honeycomb | Honeycomb Shades | 6 | Manual/held destination; retain chosen SKU/program identity. |
| Norman | `smartdrape` | SmartDrape | Smart Drapes | 13 | Existing retail route; no certification implied. |
| Norman | `smartfold` | SmartFold Shades | SmartFold Shades | 46 | Existing retail route; no certification implied. |
| Norman | `smartprivacy_faux` | SmartPrivacy Cordless Faux Wood Blinds | Faux Wood Blinds | 11 | Existing retail route; no certification implied. |
| Norman | `synchrony_vertical` | Synchrony Vertical Blinds | Vertical Blinds | 11 | Existing retail route; no certification implied. |
| Norman | `vertical_honeycomb` | Portrait Vertical Honeycomb Shades | Honeycomb Shades | 8 | Existing retail route; no certification implied. |
| Norman | `wood_blinds` | Ultimate Normandy Cordless Wood Blinds | Wood Blinds | 13 | Existing retail route; no certification implied. |
| Onyx | `onyx_ash_shutters` | Onyx Ash Shutters | Shutters | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Onyx | `onyx_lux_fabric_blinds` | Onyx Lux Fabric Blinds | Fabric Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Onyx | `onyx_lux_honeycomb` | Onyx Lux Honeycomb Shades | Honeycomb Shades | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Onyx | `onyx_lux_sheerview` | Onyx Lux Sheerview Shades | Sheer Shades | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Onyx | `onyx_shutters` | Onyx Shutters | Shutters | 25 | Existing retail route; no certification implied. Seven programs: painted_basswood, stained_basswood, secamore, vinyl, vlo_hybrid, onyx_us_made_vinyl, poly_composite. |
| Onyx | `onyx_signature_roller` | Onyx Signature Roller Shades | Roller Shades | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Onyx | `onyx_signature_sunscreen` | Onyx Signature Sunscreen Shades | Roller Shades | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Onyx | `onyx_signature_zebra` | Onyx Signature Zebra Shades | Sheer Shades | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Onyx | `onyx_woven` | Onyx Woven Wood Shades | Woven Wood Shades | 0 | Manual/held destination; retain chosen SKU/program identity. |
| Polar | `polar_all_seasons_screen` | All Seasons Single / Double | Retractable Screens | 1 | Existing retail route; no certification implied. Polar quote-only workflow. |
| Polar | `polar_awning_drop_arm` | Drop Arm Window | Awnings | 17 | Existing retail route; no certification implied. Polar quote-only workflow. |
| Polar | `polar_awning_premium` | Premium | Awnings | 17 | Existing retail route; no certification implied. Polar quote-only workflow. |
| Polar | `polar_awning_premium_plus` | Premium Plus | Awnings | 16 | Existing retail route; no certification implied. Polar quote-only workflow. |
| Polar | `polar_awning_premium_pro` | Premium Pro | Awnings | 16 | Existing retail route; no certification implied. Polar quote-only workflow. |
| Polar | `polar_awning_select` | Select | Awnings | 18 | Existing retail route; no certification implied. Polar quote-only workflow. |
| Polar | `polar_drapery_track` | Motorized Drapery Track | Drapery Tracks | 11 | Existing retail route; no certification implied. Polar quote-only workflow. |
| Polar | `polar_elite_patio` | Elite Patio | Roller Shades | 7 | Existing retail route; no certification implied. Polar quote-only workflow. |
| Polar | `polar_interior_roller` | Interior Roller | Roller Shades | 33 | Existing retail route; no certification implied. Polar quote-only workflow. |
| Polar | `polar_mega_exterior` | Mega Exterior | Roller Shades | 7 | Existing retail route; no certification implied. Polar quote-only workflow. |
| Polar | `polar_tension_shade` | Motorized Tension Shade | Tension Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Polar quote-only workflow. |
| Polar | `polar_titan_patio` | Titan Patio | Roller Shades | 8 | Existing retail route; no certification implied. Polar quote-only workflow. |
| Sundance | `sundance_advantage_ii_2` | Advantage II 2-inch faux wood | Faux Wood Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_advantage_ii_2_5` | Advantage II 2.5-inch faux wood | Faux Wood Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_aluminum_1` | 1-inch aluminum variants | Mini Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_aluminum_2` | 2-inch aluminum 8-gauge | Mini Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_basicvue` | BasicVue 2-inch faux wood | Faux Wood Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_cellular` | Cellular horizontal | Honeycomb Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_cellular_shapes` | Cellular specialty shapes | Honeycomb Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_chateau_woods` | Chateau Woods 2/2.5-inch | Wood Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_drapery_track` | GLYDEA TRACK | Drapery Tracks | 7 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_europanels` | Sundance Europanels | Vertical Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_exterior_cable` | Exterior cable-guided | Roller Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_exterior_zip` | Exterior ZipScreen | Roller Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_flat_roman` | Sundance flat Roman | Roman Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_louvolite_europanels` | Louvolite Europanels | Vertical Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_louvolite_flat_roman` | Louvolite flat Roman | Roman Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_louvolite_roller` | Louvolite roller | Roller Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_louvolite_zebra` | Louvolite Zebra | Sheer Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_portfolio_roman` | Portfolio Roman | Roman Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_premium_ii_2` | Premium II 2-inch wood | Wood Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_premium_ii_2_5` | Premium II 2.5-inch wood | Wood Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_roller` | Sundance roller | Roller Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_sheerview` | Sheerview | Sheer Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_vertical_essence` | Vertical Essence custom/stock | Vertical Blinds | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_verticell` | Verticell | Honeycomb Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_vinyl_shutters` | Solid vinyl shutters | Shutters | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_walden_premier` | Walden Premier woven | Roman Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_walden_select` | Walden Select woven | Roman Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_wood_shutters` | Custom wood shutters | Shutters | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |
| Sundance | `sundance_zebra` | Sundance Zebra | Sheer Shades | 0 | Manual/held destination; retain chosen SKU/program identity. Custom configuration records, not shared option fields. |

## Shared option key inventory (all products with shared fields)

These are exact source keys for formatter coverage; apply the family policy rather than displaying raw keys. Typed component records are covered separately below.

- `lotus_faux_wood_blinds`: `mount_type`, `lotus_blind_count`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`.
- `citylights_aluminum`: `mount_type`, `slat_size`, `slat_finish`, `privacy`, `control_side`, `lift_system`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`, `side_mount_bracket_available_in_2in_only`, `shim`.
- `faux_wood`: `mount_type`, `slat_size`, `color`, `valance`, `cut_out_sides`, `control_side`, `lift_system`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`, `shim`, `side_mount_bracket`, `keystone`.
- `honeycomb`: `mount_type`, `control_side`, `lift_system`, `light_control`, `cell_size`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`, `shim`, `side_mount_bracket`, `lightguard_pole_attachment_only`, `magnetic_hold_down`, `cut_out_cordless_operating_pole`, `specialty_shapes`, `room_darkening_sheer_solus_fr_essentials`.
- `norman_contract_faux_wood`: `mount_type`, `lift_system`, `slat_size`, `control_side`, `contract_mount_fit`, `contract_wand_drop_inches`, `valance`, `contract_hold_down_brackets`, `contract_spacer_blocks`.
- `norman_contract_vertical`: `mount_type`, `lift_system`, `slat_size`, `control_side`, `contract_mount_fit`, `contract_wand_drop_inches`, `contract_headrail_color`, `contract_shim_layers`.
- `norman_shutters`: `frame_type`, `louver_size`, `tilt_type`, `color`, `hinge_color`, `panel_config`, `divider_rail`, `t_post`, `extension`, `frame_upgrade`, `t_post_upgrade`, `track_system`, `specialty_shape`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`, `custom_work`, `stainless_steel_hinges`, `batten_back_fd_e_and_f`, `invisiblehinge`, `floating_panels`, `interlocking_bottom_guide`, `shutter_pole`, `pole_attachment`, `keystone`, `frame_and_light_block_notch_out`, `hand_carved_rail`, `invisibletilt`, `raised_panel`, `ring_pulls_or_handles`, `panel_locks`, `custom_divider_rail`.
- `palladian_shelf`: `mount_type`, `shelf_measurement_basis`, `accompanying_product_id`, `color`.
- `perfectsheer`: `mount_type`, `control_side`, `lift_system`, `light_control`, `valance`, `perfectsheer_installation`, `perfectsheer_valance_height`, `perfectsheer_valance_fabric`, `perfectsheer_wood_finish`, `perfectsheer_light_guard`, `perfectsheer_light_guard_color`, `perfectsheer_magnetic_hold_down`, `perfectsheer_magnet_color`, `perfectsheer_shim_layers`, `perfectsheer_tube_diameter`, `perfectsheer_valance_returns`, `perfectsheer_valance_joinery`, `perfectsheer_keystone_count`, `perfectsheer_keystone_layout`, `perfectsheer_wand_length`, `perfectsheer_installed_on_door`, `perfectsheer_solar_panel`, `perfectsheer_extension_color`, `perfectsheer_wand_color`, `perfectsheer_chain_unobstructed`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`, `light_guard`, `shim`, `magnetic_hold_down`, `keystone`.
- `roller`: `mount_type`, `window_type`, `shade_type`, `coupled_shade_count`, `lightguard_360_shade_count`, `control_side`, `lift_system`, `valance`, `fabric_roll`, `raceway`, `hardware_type`, `hardware_color`, `hem_bar`, `hem_bar_color`, `bottomrail`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`, `light_guard`, `shim`, `additional_fiberglass_pole`, `magnetic_hold_down`, `pole_attachment_only`, `keystone`.
- `roman`: `mount_type`, `control_side`, `lift_system`, `roman_style`, `lining`, `valance`, `decorative_trim`, `day_and_night`, `decorative_pillow_cover`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`, `magnetic_hold_down`, `pole_attachment_only`, `cordless_operating_pole`, `shim`.
- `san_clemente_faux_wood`: `lift_system`, `slat_size`, `control_side`, `installation_method`, `san_clemente_mount_fit`.
- `san_clemente_honeycomb`: `lift_system`, `cell_size`, `san_clemente_mount_fit`, `san_clemente_pole_36_quantity`, `san_clemente_pole_60_quantity`, `san_clemente_attachment_quantity`.
- `smartdrape`: `mount_type`, `stack_option`, `vane_style`, `additional_vanes`, `control_side`, `lift_system`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`, `aluminum_shim`, `long_l_bracket`, `keystone`, `additional_wand`.
- `smartfold`: `mount_type`, `smartfold_installation`, `smartfold_shim_layers`, `fold_size`, `smartfold_hold_down`, `smartfold_magnet_color`, `smartfold_pole`, `smartfold_fascia_recess`, `smartfold_wand_length`, `smartfold_wand_color`, `smartfold_light_guard_recess`, `smartfold_light_guard_color`, `smartfold_valance_returns`, `smartfold_valance_joinery`, `smartfold_keystone_count`, `smartfold_keystone_layout`, `smartfold_common_position`, `smartfold_fabric_pattern`, `smartfold_hardware_color`, `smartfold_hem_style`, `smartfold_hem_color`, `smartfold_hem_end_cap`, `smartfold_fascia_style`, `smartfold_fascia_color`, `smartfold_fascia_end_cap`, `smartfold_valance_fabric_code`, `smartfold_wood_valance_color`, `smartfold_chain_color`, `smartfold_chain_unobstructed`, `full_fold_required`, `smartfold_side_by_side_id`, `control_side`, `lift_system`, `fabric_category`, `valance`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`, `light_guard`, `shim`, `additional_fiberglass_pole`, `magnetic_hold_down`, `pole_attachment_only`, `keystone`, `cordless_operating_pole`, `premium_hem_bar`.
- `smartprivacy_faux`: `mount_type`, `slat_size`, `color`, `valance`, `control_side`, `lift_system`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`, `shim`, `side_mount_bracket`.
- `synchrony_vertical`: `mount_type`, `stack_option`, `draw_direction`, `control_type`, `vertical_hardware_color`, `vertical_wand_drop_inches`, `vertical_shim_layers`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`, `shim`.
- `vertical_honeycomb`: `mount_type`, `stack_option`, `light_control`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`, `shim`, `room_darkening_sheer_fr_essentials_fabric_surcharge`.
- `wood_blinds`: `mount_type`, `slat_size`, `color`, `valance`, `cut_out_sides`, `control_side`, `lift_system`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`, `shim`, `side_mount_bracket`, `keystone`.
- `onyx_shutters`: `onyx_order_type`, `onyx_mount`, `frame_type`, `louver_size`, `tilt_type`, `color`, `hinge_color`, `panel_config`, `divider_rail`, `t_post`, `extension`, `frame_upgrade`, `t_post_upgrade`, `track_system`, `specialty_shape`, `hard_surface_install`, `ladder_over_15ft`, `requires_takedown`, `track_type`, `custom_work`, `h2_tilt`, `poly_composite_h3_per_panel`, `flat_slade_fixed_louver`, `bay_corner_window`, `flush_rail_raised_panel_solid_flat_panel`.
- `polar_all_seasons_screen`: `sliding_glass_door`.
- `polar_awning_drop_arm`: `somfy_orea_550`, `somfy_altus_550`, `alpha_remote_50`, `somfy_std_550`, `alpha_manual_50`, `premium_fabric`, `drop_valance_motor`, `led_motor_package`, `led_arm_6_11`, `led_arm_8_6`, `led_arm_10_2`, `led_arm_11_9`, `led_arm_13_5`, `recover`, `valance_recover_up_to_8`, `valance_recover_over_8`, `cassette`.
- `polar_awning_premium`: `somfy_orea_550`, `somfy_altus_550`, `alpha_remote_50`, `somfy_std_550`, `alpha_manual_50`, `premium_fabric`, `drop_valance_motor`, `led_motor_package`, `led_arm_6_11`, `led_arm_8_6`, `led_arm_10_2`, `led_arm_11_9`, `led_arm_13_5`, `recover`, `valance_recover_up_to_8`, `valance_recover_over_8`, `drop_valance`.
- `polar_awning_premium_plus`: `somfy_orea_550`, `somfy_altus_550`, `alpha_remote_50`, `somfy_std_550`, `alpha_manual_50`, `premium_fabric`, `drop_valance_motor`, `led_motor_package`, `led_arm_6_11`, `led_arm_8_6`, `led_arm_10_2`, `led_arm_11_9`, `led_arm_13_5`, `recover`, `valance_recover_up_to_8`, `valance_recover_over_8`.
- `polar_awning_premium_pro`: `somfy_orea_550`, `somfy_altus_550`, `alpha_remote_50`, `somfy_std_550`, `alpha_manual_50`, `premium_fabric`, `drop_valance_motor`, `led_motor_package`, `led_arm_6_11`, `led_arm_8_6`, `led_arm_10_2`, `led_arm_11_9`, `led_arm_13_5`, `recover`, `valance_recover_up_to_8`, `valance_recover_over_8`.
- `polar_awning_select`: `somfy_orea_550`, `somfy_altus_550`, `alpha_remote_50`, `somfy_std_550`, `alpha_manual_50`, `premium_fabric`, `drop_valance_motor`, `led_motor_package`, `led_arm_6_11`, `led_arm_8_6`, `led_arm_10_2`, `led_arm_11_9`, `led_arm_13_5`, `recover`, `valance_recover_up_to_8`, `valance_recover_over_8`, `hood`, `drop_valance`.
- `polar_drapery_track`: `bracket_one_touch`, `bracket_swivel`, `bracket_adjustable_white`, `bracket_adjustable_bronze`, `bracket_double_white`, `bracket_double_bronze`, `silent_master_side`, `silent_master_split`, `silent_runner`, `custom_bend`, `curved_packaging`.
- `polar_elite_patio`: `polar_exterior_guide_type`, `elite_cassette`, `shade_pocket`, `vortex_36_96`, `vortex_108_plus`, `u_channel`, `ral_custom_color`.
- `polar_interior_roller`: `fascia_3`, `fascia_4`, `fascia_5`, `fascia_7`, `fascia_3_76_cm`, `head_pocket_4`, `head_pocket_5_5`, `hang_strip`, `interior_cassette`, `specialty_hem_bar`, `metal_chain`, `cm_clutch`, `spring_assist`, `pt_signature_metal`, `bottom_up`, `pt_signature_plastic`, `coupler_manual`, `coupler_motor_min_gap`, `coupler_motor_adjustable`, `duo_5_manual`, `duo_5_motorized`, `duo_7`, `cordless_coulisse`, `cordless_zero_gravity`, `ral_fascia_3`, `ral_fascia_4`, `ral_fascia_5`, `ral_fascia_7`, `ral_head_pocket_4`, `ral_head_pocket_5`, `ral_head_pocket_7`, `ral_light_channels_pair`, `ral_hang_strip`.
- `polar_mega_exterior`: `polar_exterior_guide_type`, `patriot_hood`, `mega_cassette`, `vortex_36_96`, `vortex_108_plus`, `u_channel`, `ral_custom_color`.
- `polar_titan_patio`: `polar_exterior_guide_type`, `patriot_hood`, `titan_cassette`, `shade_pocket`, `vortex_36_96`, `vortex_108_plus`, `u_channel`, `ral_custom_color`.
- `sundance_drapery_track`: `sundance_track_motor_type`, `sundance_track_headrail_colors`, `sundance_track_motor_position`, `sundance_track_curved_track`, `sundance_track_stack_type`, `sundance_track_drapery_style_track`, `sundance_track_remote_control`.

## Typed records and exceptions requiring explicit summaries

- Norman shutters: norman_shutter_panels_v1 contains application/motor/layout/shape/frame choices together with fabrication geometry. Summarize the former; never dump panel widths/heights, wholePanelLouverCount, divider center measurements, hinge counts, bottomSupport, casing/header/baseboard/pivot, template references or source-derived requirements. Preserve selected paid divider/custom-work/accessory identities and quantities; explain actual customer price exception outside the contract detail list.
- Norman Roller: roller_light_guard_v1, roller_pole_v1, roller_chain_v1, roller_accessories_v1 and roller_hardware_v1 records mix purchased items and installation evidence. Keep guard type/color, operating pole kind and quantity, selected chain appearance, hold-down/color, visible raceway if material to appearance; omit clearances, safety confirmation and calculated mounting recipe. Shared-valance/dual components may need a simple component summary, never UUIDs.
- Norman SmartFold charging: retain bought charging-kit/cable counts, not mounting clearance. SmartFold/PerfectSheer common/matching records: describe shared valance or paired shades and selected keystone quantity, not group IDs, source offsets or splice coordinate arrays.
- Norman Roman: keep front/rear fabric, fold/lining/banding color/layout and customer operation. Common-valance/Day & Night components need distinct readable fabric/control descriptions. Do not print fixed motor/chain positions merely because internally derived, and do not print source program IDs. Yard/pillow destinations use natural sold units.
- Norman SmartDrape replacement request: keep fabric/color, style A/B and pack count/length; omit originalWorkOrder/source record. Extra vane packs sold with a shade should be summarized once.
- Lotus: lotus_observed_offering_id resolves an exact offered item; display human item/SKU/color, not the internal record ID. Hide lotus_*_configuration_version, donor candidate SKU arrays and price authority records. For headrail-only use rail length; vanes-only use vane length and vane quantity; parts dimensionless where appropriate. Intended compatible model is useful for a sold replacement part; installed mechanism reference is internal.
- Onyx: onyx_baseline_options_v1 and woven options require profile-aware label resolution. Keep visible valance/rail/backing/edge-binding appearance and bought accessories; omit profileId, grid/source IDs and manufacturing-only confirmation. Ash remains exact Ash identity, never generic basswood substitution.
- Sundance sundance_assembly_v1: summarize two/three-on-one or dual/coupled, each component fabric/control and sold dimensions when necessary. Suppress component IDs/sharedMotorComponentId and internal configuration.
- Sundance sundance_walden_twin_v1: summarize front fabric and liner material/color/control (and sold component sizes if different), not internal gridId/fabricId/component UUID.
- Sundance sundance_vertical_component_v1: keep Track only/Vanes only, actual sold length and quantity; omit opening deduction instructions from customer detail and preserve them for production.
- Sundance sundance_privacy_pieces_v1: keep accessory kind, purchased length/count; omit piece IDs, sourceNet/rounding/evidence and calculations.
- Sundance sundance_europanel_layout_v1: keep panel count and sold component dimensions if part of specification; omit channel assignments, IDs and manufacturing notes.
- Sundance order power/shared accessories/alignment records: summarize purchased shared motor/power/accessory quantities once, not network/channel IDs, source records, capacity calculations or alignment schedules.
- Polar manual quote products: retain actual system/model/fabric, guide type, purchased controls/accessories and human-readable selected motorization names. Never treat manual-required as permission to show dealer costs, price evidence or arbitrary JSON.

## Findings before this revision

Before this revision, getQuoteDesignDetails() emitted most unknown options through humanizeKey()/formatOptionValue(); this permits obsolete manufacturing/internal fields to leak. It explicitly emits Roller light-guard channel lengths, chain default length, bracket installation, shim layer recipe, SmartFold clearance, and derived Roman chain/motor positions. A shared customer-contract formatter should use explicit identity/appearance/operation/accessory projections and safe family-aware typed records. Unknown records remain staff-only. Reuse the same formatter for desktop/native/mobile/email/customer preview outputs; staff audit details may retain full evidence separately. Customer-charge rows should not be repeated as option strings.

This inventory covers every offered product ID. The shared presentation cleanup preserves stored configurations, catalog IDs, price formulas and source eligibility. Live verification and release evidence are recorded above.
