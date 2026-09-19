# Job Status shipping dates

## Scope and state
- Removed the Orders & shipping navigation item and its Sold Job Tracking view. Job Status remains the home route.
- Shipped displays confirmed dispatch dates per product type. Partial shipments retain an incomplete group check; existing checks without source dates display an unconfirmed-date label.
- Authenticated product-completion accepts optional shipment evidence (actual date, exact 805 mailbox, Gmail message ID, manufacturer order reference). Stores it in product metadata without a migration. Actual dispatch date is separate from the processing timestamp.
- Supports source-backed date backfill, conflict rejection, revision guards, duplicate suppression and exact product subsets. Email parsing/matching remains the daily agent's responsibility; this endpoint does not independently authenticate email contents. Automated updates must use exact real product IDs, never whole-job or generated rows.
- Existing daily heartbeat 805-daily-shipping-confirmations updated, ACTIVE at 09:00 America/Los_Angeles. Installation branch preserved. No duplicate automation created. Production-feature fallback retains evidence until deployment.
- At initial verification, no production code deployment or shipment-data write had been performed. Main checkout's unrelated work was preserved in a separate worktree.

## Verification
- 123 focused tests passed: product-completion, operations-overview, customer-files.
- Typecheck and production build passed.
- Browser verification used local sample data and the actual JobStatusOverview, ProductChecks, ProductShipmentEditor and CrmNavigation components.
- Desktop and 390px mobile: confirmed date beneath green check; unknown date label; pending state; source form; required fields; save transitions to completed; cancel preserves pending state; retired navigation absent. Shipment grid and form fit without horizontal overflow. Browser viewport restored.
- Production CRM authenticated navigation was inspected; it still has the old route until release.
- Gmail identity verified live as 805@805shutters.com. Recent shipping results include Norman references 8821133128, 8880985478 and 8880985476; these correspond to the morning automation's unresolved exact-link exceptions. No name-only CRM updates attempted.

## Release
The current repository AGENTS.md authorizes the full production workflow. Publish to origin/main and the configured 805 Vercel project after validation. After deployment verify the authenticated Job Status route, shipment-date write/readback on an exactly matched source, and removal of Orders & shipping.
