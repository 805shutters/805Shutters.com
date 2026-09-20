# Sundance Zebra motor accessory reconciliation

Source: `G-Zebra-Shades-V2.pdf`, source ID `sundance-g-zebra-shades-v2-2e3b46c6b809`, printed effective August 1, 2024. PDF pages 10–14 contain 28 accessory schedule entries: 3 Somfy power, 10 Somfy control/interface, 7 Alpha, 5 Simphony, and 3 Quiet Touch/Bond. Every row now has a named CRM quantity destination under `sundance_zebra_accessory_<key>_qty`.

The motor determines available accessories. Somfy rechargeable charger/solar and 24V DC supply are separated; Alpha, Simphony, and Quiet Touch controls/power cannot silently carry across a motor change. Changing the operating system clears these allocations. Shared validation checks nonnegative whole quantities and incompatible stored selections. Displayed totals combine only source net option amounts, remain ineligible as automatic customer prices, and exclude base shades, unselected requirements, account terms and taxes.

Smoove remains held because the table says 5-channel and image says 4-channel. Bond Bridge and Sidekick appear as compatibility-unverified source choices for radio motor configurations, with explicit validation holds; the generic RF text cannot establish the selected motor's protocol or bridge pairing. Shared accessory allocation remains line-based and requires order-wide review/deduplication.

Verification: 477 Sundance/shared-rule tests pass; TypeScript passes. Independent arithmetic checks include Somfy motor 220 + charger 36 + Situo 5-channel 83 = 339 net; Alpha 5Nm 250 + charger 28 + two remotes at 55 = 388 net; Quiet Touch 100 + charger 35 = 135 net. Production save/reopen remains pending deployment.
