# Installation policy repair

New manual inputs are merchandise prices per window/line unit. Eligible physical blinds and shades carry $25 installation and the existing $14 customer shipping per physical unit, multiplied by line quantity. Both fixed charges remain outside percentage discounts; existing tax and extra-fee policy is retained.

- New manual saves store `manual_merchandise_unit_price`, `manual_customer_charge_policy`, and validated `customer_charges` separately. The inclusive `unit_price` and immutable customer snapshot contain the fixed charges once.
- Custom Mode uses the current saved quantity and configuration, keeps internal margin/cost calculations separate, and validates merchandise plus charges again inside its database RPC.
- Source cost and manufacturer freight are unchanged. Shutters and component-only parts/accessories do not acquire these blind/shade service charges.
- Physical counts follow explicit split/coupled configurations. SmartFit Dual represents two installed shades; horizontal Day & Night represents one shade, regardless of fabric grid count.
- Automatic reapply preserves older all-in overrides without the new policy marker. Old immutable snapshots are not updated. Non-draft/sent quote manual-price mutations are rejected.
- Manual override idempotency stores the input merchandise price, so retries do not add installation or shipping twice. New override rows persist their policy separately from editable configuration.

## Evidence

Focused tests exercise the actual SQL functions in PostgreSQL/PGlite, plus TypeScript helpers: 48 tests across five files pass. Typecheck is run separately before commit. A $100 merchandise line containing three physical blinds and quantity two saves at $217 per window and $434 total; quantity four becomes $868. The old snapshot retains quantity two and its original $150 installation/$84 shipping. Zero merchandise retains fixed charges. Custom Mode with two $100 shades and 10% merchandise discount saves quote total $258 ($180 merchandise plus $50 installation and $28 shipping).

## Production integration

Apply these migrations in order before live manual-price verification:

1. `20260921120000_manual_customer_installation_policy.sql`
2. `20260921121000_custom_mode_customer_installation_policy.sql`

They add a nullable policy column and replace the draft save functions; no existing quote rows, overrides, or price snapshots are backfilled. The first migration preserves existing catalog and replay guards with narrowly checked function-source changes. Parent owns engine integration and deployment; UI must display the merchandise input separately and use the new merchandise key when reopening an override.

Required live proof after release: save an internal single shade, a split blind with quantity two, and a zero merchandise override; close/reopen; verify installation $25 per physical unit, shipping $14, discount treatment, and customer preview. No customer sends or orders are required.
