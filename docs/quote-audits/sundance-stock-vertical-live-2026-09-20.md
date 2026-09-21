# Sundance stock vertical production verification

Verified September20 on live4b2bd345, internal unsent quote805-0354, customer `Sundance Stock Vertical Internal Verification 2026-09-20`.

Office line: finished42×60 inches, quantity1, Stock White, no valance, left wand/right one-way draw, both cut-downs, actual larger blind45×66 inches, Pickup in Arcadia. The UI independently reports source retail base$185 at45×66 and$10 net cut charges ($5 each axis); these are not an approved customer-price total.

The quote reached Saved, was closed, fully reloaded and reopened from the quote list. All selections and both actual larger-blind dimensions persisted. Contract displayed Pricing incomplete, with no customer price available.

Negative checks: setting before-cut width42 (equal to finished width) displayed the exact larger-blind validation issue. Selecting square valance displayed$49 source retail at the requested width and the exact unresolved question whether cut-down valance pricing follows finished or original stock width. Both were restored to45 inches/no valance before final save and reopen.

The live staff pricing audit reports pricing mode none rather than a V2 validation snapshot. Therefore this proves visible validation and saved configuration persistence, not a live server-validation trace. The automated actual-backend serialization tests separately verify width-before-cut and pickup rejection. Dealer factors, availability, lower cut limits and valance-cut pricing scope remain unresolved. No order, customer send, payment, signature or sold action occurred.

A follow-up removes source retail evidence when an invalid before-cut dimension is entered, so an unusable price-cell example does not appear beside its validation issue. Seven focused stock tests passed; combined release verification follows.
