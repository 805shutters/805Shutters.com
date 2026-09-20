# Sundance production verification — September 20, 2026

Production draft **805-0335**, customer **Sundance Catalog Verification 2026-09-20**, is internal and unsent. Its notes prohibit sending, selling, payment collection and ordering. Manual values 123.45 and 234.56 are persistence fixtures, not price authority.

## Verified in production

The draft was saved, closed to Quotes, and reopened through **Open quote 805-0335**.

| Line | Persisted configuration | Pricing proof limit |
|---|---|---|
| Living Room | Cellular 36×60; 3/4-inch; Blackout; exact PU422SS-766, Cell-In-A-Cell Classic Gray | Manual fixture 123.45 persists; no automatic-price certification. Changing cell size removes incompatible identities and clears the previous selection. |
| Office | Glydea drapery track 96×84; IRISMO 45 lithium-ion rechargeable 0.8Nm; Bronze; Motor Right; curved track No; Split; Ripple Fold; Situo 5 | Manual fixture 234.56 persists; missing dimensional-grid warning remains. |
| Kitchen | Stock vertical 42×60; Off-White; Square corner valance; width cut-down Yes; height cut-down No | Intentionally unpriced. Pickup-only and manual-charge notice visible. |
| Family Room | Walden Premier 36×60; Black-out liner `sundance_walden_premier_option_p20_t2`; wide twill binding `sundance_walden_premier_option_p21_t2`; Chocolate liner; movable liner Yes | Intentionally unpriced. Exact fabric identity proof awaits the subsequent fabric-selector deployment. |

After reopening the four-line draft, production correctly displays **Pricing incomplete**, **Total unavailable**, and **2 windows need pricing**. All four lines retain Sundance's **QUOTE ONLY** account/configuration gate. The previously priced two-line draft total was 358.01 before adding the two unpriced lines.

On release `8f78c858`, the customer Contract preview retained exact cellular identity and complete neutral track descriptions: rechargeable 45/lithium-ion/0.8Nm motor, Motor Right, five-channel remote, Split, Straight, Bronze and Ripple Fold. This confirms presentation and persistence, not supplier price approval.

On release `bc4bea39`, with the full Sundance product list selected, a normal direct click on **36×60** opened the Width dialog with the correct measurements. No keyboard workaround was needed. The exact-product picker has its own bounded scroll area; the quote header no longer obscures line controls.

## Preserved dealer evidence

Authenticated KEN HILL account, unsubmitted order **805 CATALOG AUDIT 0920 DO NOT ORDER**, order ID `a2cb0fbf-e522-4509-b094-8129dea40dda`, contains seven saved comparison lines. The five cellular comparisons are described in the cellular ledger. Walden line 6 (`a2cb280a-74ae-489b-aaf8-1fbb8f9d14bd`) preserves Aires White 36×60 without liner; line 7 (`a2cb2818-4d0f-4dab-84f4-5155205879a8`) preserves the Blackout comparison. Reopened order list confirms their respective net values 318.60 and 357.75. The latter exposes the published-versus-portal liner discrepancy recorded in the Walden audit. No order was submitted.

This evidence does not mark any complete Sundance family verified for automatic pricing. Full compatibility, account terms, unresolved dealer identities and exact option charges remain explicit exceptions.
