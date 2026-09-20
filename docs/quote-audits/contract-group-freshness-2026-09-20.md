# Contract grouped-query freshness

The grouped Contract view could permanently retain `Pricing incomplete` after a new alternative or line became valid. Its group-lines and group-designs keys depended only on group ID while their fetch functions captured changing parent ID arrays. Updating a query function with the same key does not fetch a new dependency result. Builder saves also refresh the active detail record while the sibling list can remain older.

The repair keys group lines by sorted sibling IDs and their persisted revision/update time, preferring the refreshed active detail version. Group designs additionally depend on sorted line IDs. Active-quote design reads now depend on their line IDs as well. IDs and revisions form the cache identity; no quotes, prices, selections, accepted snapshots, or historical locks are rewritten.

Four QueryObserver/helper regressions reproduce the old fixed-key race, fetch newly arriving D lines/designs, replace an incomplete result at unchanged IDs after a saved revision restores a $543 authoritative price, and preserve historical inputs and stable ordering. Existing accepted/historical contract tests remain passing: 20 tests across four files. TypeScript passes.

Production verification remains required after integration: open the internal HC alternative D with the saved valid specialty configuration, view Contract without a full reload, invalidate and restore a configuration, and confirm the valid price returns after save. Preserve all internal drafts; do not send or sell.
