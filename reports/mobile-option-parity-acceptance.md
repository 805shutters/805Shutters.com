# Required acceptance: full-builder option parity

User acceptance rule: “If the option is available on the actual quote builder system, it also needs to be available in the quote app that we’re building as an option.” The later explicit required-field list controls validation and colors. Other product details remain selectable and mostly optional for the quote; supplier draft-entry requirements are a separate gate.

## Implemented changes and source evidence

- Editable positive-integer quantity now reaches the full-card line, supplier specification and structural quote handoff. Old device drafts that omit quantity still represent one item. Quantity changes invalidate mutable estimates and retain explicit manual-price evidence. Legacy manual previews preserve stored unit price and multiply by actual quantity.
- Review used to open before the 180ms autosave committed. It now waits for the real IndexedDB transaction before showing review. Configurator callbacks update the latest draft instead of a captured older snapshot, so delayed changes do not restore stale quantity.
- Full/mobile pairing now uses one eligibility helper. Mobile routes reciprocal callbacks by the supplied real line ID, not the active opening. Group edits do not spread a reference-specific pair across unrelated selected openings.
- The shared configurator retains its offered fields, values, dependencies and defaults. Mobile no longer suppresses the legacy wood-route choice. Selected-chip metadata uses a separate marker so it cannot be mistaken for an editable input row. Explicit native edits supersede supplemental entries; automatic default changes preserve explicit user overrides.
- Required choices use gold; optional choices use the existing neutral/green palette. Visible Required/Optional labels and `aria-pressed` supplement color. Selected states, keyboard focus and disabled states remain distinct. Extra bottom space prevents the fixed action footer from intercepting fractional-measurement controls.
- All nine families and five manufacturers are retained. Internal Custom Mode, discounts and other financial actions were not copied into supplier-cost pricing. Their existing full-builder semantics remain intact.

## Required quote policy

| Products | Required | Applicability boundary |
| --- | --- | --- |
| Blinds/shades | Inside/outside mount, valid width/height, operating system and control side | Explicit Not applicable is permitted for motorized systems and cordless shades; cordless blinds still need an applicable tilt/control side. Supplier hardware-side rules require their own verification |
| Roller shades | Above plus fabric | Fabric remains optional for other quote families, though supplier entry may require it |
| Blinds | Above plus louver/slat size | Source-specific vertical/vane-size availability needs verification; no stock size is invented |
| Shutters | Dimensions and existing identity flow, louver, frame, color, folding configuration, inside/outside mount, explicit split-tilt or divider choice | No default None or hardware is added. An explicit existing Norman panel divider schedule can satisfy the choice |

Tracked Onyx source offers Center Open/Side Open. Norman bi-fold source uses its own layouts and panel schedules, not those Onyx labels. Where general folding applicability is unverified, the app says so and records only an explicit instruction; supplier entry must resolve it. It does not manufacture folding choices for regular/specialty configurations.

## Evidence and limits

The source-backed baseline regression renders full/mobile versions of the actual configurator for **61 supported products and 296 product/program baseline cases**. It compares instrumented option fields/value arrays plus native select/input controls, offered values, disabled/read-only status. The full builder's selected chips remain part of its manifest. Material/program identity is checked through the canonical mobile program chooser; desktop Fabric search and mobile Search fabric are an intentional presentation mapping. The generated `mobile-option-parity-baselines.json` records each case.

This covers those baseline states, not every conditional Cartesian product or supplier portal. Conditional checks include motorized power controls, Norman contract installation fields, explicit shutter controls, and actual reciprocal Honeycomb pairing. Browser contexts use synthetic source data and intercept backend/external requests; no installed-phone certification or production write is implied.

## Remaining gap matrix

| Area | Local result | Remaining evidence |
| --- | --- | --- |
| Quantity save/hydrate/reload | Real IndexedDB and browser reload tested; old missing-quantity compatibility retained | Production/installed phone verification after separately reviewed publication |
| Pair selection | Actual Honeycomb reciprocal pair and identities survive reload | Other pairing programs and complex combinations not exhaustively exercised |
| Required/optional colors | Nine-family keyboard/contrast checks and screenshots | Physical-device verification; native specialized controls outside exercised states |
| Baseline product/options | 61 products × 296 source cases compared | Exhaustive conditional combinations, obsolete/historical catalogs, every unavailable/custom case |
| Shutter folding | Scoped Onyx choices and Norman source layouts; unsupported applicability flagged | Regular/specialty/non-folding semantics need supplier/user confirmation |
| Vertical slat/vane size | Required known-size input is available and defaults blank | Some source builders do not model stock choices; exact product evidence and supplier validation are still needed |
| Supplier entry | Quote-minimum checks are separate from native order requirements | Actual account, valid source selections, draft save/cost/readback for each supplier |
| Processing/dispatch | Authenticated queue source remains hard-disabled | Deployed queue/RPC/fee/tax metadata, photo recovery, actual adapter bindings, supported direct wake |

## Release checklist

- [x] Compare the actual full builder and mobile baseline fields/values by supported product and program.
- [x] Preserve source defaults, selectable optional details, explicit overrides, notes and round-trip IDs.
- [x] Test quantity persistence and reciprocal paired selections.
- [x] Mark user-required fields with distinct color and visible/accessibility text.
- [x] Test real keyboard focus and text contrast across nine families.
- [ ] Exercise untested conditional combinations and verify supplier-specific applicability.
- [ ] Verify deployed queue, pricing RPCs, automatic fees, tax and photo recovery through existing authorized access.
- [ ] Verify a supported direct assistant wake and queue transport before claiming automatic processing.
- [ ] Publish only the separately reviewed tested scope; verify the installed app afterward.
