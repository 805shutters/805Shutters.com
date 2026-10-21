# Closed and paid job drawer

Requested by Mike on 2026-10-20: build the selected File drawer design from the UI examples.

Job Status card view now collapses jobs only when the existing operations model marks both `closed` and `paid`. The summary keeps customer, project/job number, closed/paid status, contract total and right-side chevron visible. Click, Enter or Space expands the original header, financials, workflow, contract and job actions. Reopened or unpaid jobs retain their expanded presentation. The existing list view and business classification are unchanged.

Verification:

- Focused workflow/UI/filter tests: 78 passed.
- Full Vitest run: 10,527 passed; 31 skipped, across 817 passing files and 5 skipped files.
- Typecheck and production build passed.
- Isolated browser fixture with synthetic data: three passes at 1440, 768 and 390 pixels. Verified default collapse, reopened/unpaid visibility, full expand/collapse cycle, Enter/Space, original Open job action, right-side arrow, compact height and no page overflow or API writes.
- Desktop/mobile screenshots inspected under `test-results/closed-jobs/` (local generated evidence).
- Initial Vite fixture exposed a server-only Next import. A fixture-only `next/server` adapter resolved it; application imports were not modified.

Release and authenticated production verification remain pending until recorded below.
