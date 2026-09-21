# Norman floating and frame-hinged Bi-fold source closure

Status: implemented and locally tested; deployment and live verification pending parent integration. This closes subtype selection and documented constraints, not factory manufacturing geometry or account pricing. Existing specialized-application and shutter-rate holds remain active.

## Evidence

Current source binders in `outputs/catalog-audit-2026-09-17/current-sources` (captured September 2026; this increment applies with the existing September 20 construction rules; the drawings do not assert a new price effective date):

| Source | PDF pages reviewed | SHA-256 |
|---|---|---|
| One PDF-Woodlore.pdf | 32, 65–74 | e6b946da8bb729df36e130347149aefe0e8c8cb688580bee2614c35949c25469 |
| One PDF-Woodlore Plus.pdf | 38, 82–90 | 92e547a134faa6b4757b7ad16cd8357eca30ae7b828b37e7f1423eca0bf0c45e |
| One PDF-Brightwood.pdf | 32, 75–86 | 7e9aa8956fda910d1d72ce2a542a109154aa9cd916cbab92e4f2acb50b2ec7e7 |
| One PDF-Normandy.pdf | 32, 77–88 | da7cd86212dcce45b87ca623af3f1549d1ddaccc0854dd90847056d5bd93803f |

Frame cross-sections were inspected visually in all four binders, as were floating and unequal-panel drawings. Text extraction alone omits the frame buildout labels and drawing relationships.

## Exact CRM destinations and controls

Existing `norman_shutters` programs `woodlore`, `woodlore_plus`, `woodlore_aquashield`, `brightwood`, `normandy_painted`, `normandy_stained` retain IDs. Versioned `norman_shutter_panels_v1.bifold90` gains optional subtype records; older records remain readable.

| Subtype | Saved choices / validation |
|---|---|
| Floating 90, all six programs | Explicit FF groups; wood also allows FFFF, including mixed group sequences. Slash separators do not count as panels. The existing 64-panel record capacity is a software bound, not a claimed manufacturer maximum. Individual actual panel widths/heights remain required. |
| Floating framing | Exact mount, side boards yes/no, header and fascia, extension and flat support. AquaShield plain fascia only. Normalized persisted mount aliases compare to their display labels without conflating Semi-Inside with Inside. |
| Floating hardware | Wheel carrier, spring-loaded guide and floor track retained as source references. Outside/Semi-Inside without side boards gets the source default 2016 end-stopper reference. Optional top-track stopper positions are separately saved; no invented quantity or charge. Rabbet's unhinged meeting stile remains Butt per guide. |
| Frame-hinged, five programs | AquaShield unavailable. LL/RR/LLRR; Brightwood and Normandy additionally LLLL/RRRR/LLLLRRRR. Rabbet only; Vintage L frame with none/½-inch/1-inch buildout. Three sides + bottom light block or three sides + 3-inch Deco Sill; no four-sided frame. |
| Frame hinge / panels | Woodlore supports 2⅜-inch Self Mortise; Plus/Brightwood/Normandy also Invisible. Other panels in each stack must be hinged end-panel A +34.5mm or +29.5mm respectively. Exact factory dimensions are required; no division of opening width or rounding the millimetre difference. Center-opening source drawings use equal anchor A; unequal anchors remain held. |
| Frame-hinged door / pulls | Explicit Used As Door, 19mm default bottom-gap reference; optional ring pull and floor-to-center height, with stale inactive heights rejected. Ring-pull finish matches hinge. Single-direction even layouts use source wood Vintage Hang Strip with 13mm light block; unknown surcharge remains held. |

The separate wood multi-fold 20-inch cap is not transplanted into floating/frame-hinged layouts. Existing program Bi-fold width and panel-height constraints continue to apply. Source maximum-frame width drawings and side-view elevations are not used as retail-grid or manufactured cut dimensions.

## Finite unresolved evidence

1. Floating text says 5mm end gap; drawing labels 5.1mm / 3⁄16 inch. Factory cut/fit resolution is needed before an exact manufacturing deduction.
2. Factory track length, carriers/pivots/stoppers/magnets/screws quantities and exact cut dimensions are not authorized by the illustrated hardware inventory alone. The 90-degree standard/specialized geometry hold remains.
3. Frame-hinged unequal left/right anchors, unusual site geometry, measured sill/door elevations and actual factory panel dimensions need a factory schedule. No automatic opening-to-panel conversion is asserted.
4. 805-specific shutter base rates, hang-strip/buildout/ring-pull/track and other surcharge schedule remain externally unverified. No dealer factors or selling policy changed.

The documented subtype choices and prohibitions above have CRM destinations. Remaining specialized geometry/quantities are manufacturer evidence gaps, not silently guessed engineering defaults. Broader shutter motor/specialty work belongs to its independent ledger.

## Verification

Focused tests cover all eligible program/subtype pairs, serialization, legacy records, floating mixed groups/counts, exact panel endpoints, forbidden AquaShield/hinges, 34.5/29.5mm independent arithmetic, equal-A center diagrams, buildouts, door/pull requirements, stopper positions, visible controls, saved-backend mount normalization and preservation of factory pricing holds. Full parent release and actual CRM save/reopen proof remain separate milestones.
