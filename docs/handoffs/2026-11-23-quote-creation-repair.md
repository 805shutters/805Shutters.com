# Quote creation repair — November 23, 2026

Mike supplied the production error “function gen_random_bytes(integer) does not exist” and reported quoting still broken. Current project instructions authorize completion through production. Scope is this creation failure; pricing and performance behavior remain unchanged.

## Cause and repair
Dedicated805 evuxqsaucmvgyuvjpqlo has pgcrypto in extensions. allocate_805_quote_id has search_path public,pg_temp but called gen_random_bytes unqualified. New-ID migration was applied as20261121210948 on November21. The morning pricing rollback retained this unrelated ID allocator. Reproduced exact failure through production create_quote_v2_draft with synthetic inputs inside a rolled-back subtransaction.

Forward migration schema-qualifies extensions.gen_random_bytes(1). Automated comparison proves that is the only executable difference. Owner, authenticated/service grants, authorization, restricted search path, collision lock/checks, ID alphabet/length and existing issued IDs remain unchanged. No change to pricing, vendor policies or customer quotes. Security advisor reviewed: existing authenticated SECURITY DEFINER execution is unchanged and guarded; no new grants or access expansion.

## Verification
Focused15 tests pass. New PGlite regression installs real pgcrypto in extensions, reproduces old failure, allocates100 unique formatted IDs after fix, preserves existing quote rows and rejects unauthorized/oversized requests. Full suite11,277 passed/37 skipped; typecheck passed; production build passed.

Migration applied successfully to dedicated805 as20261124001554 at16:15:54PST. Production draft creation/side mark/idempotent retry passed in rolled-back subtransaction; counts confirmed no fixture remains. Real authenticated New quote button created INTERNAL TEST Quote Creation20261123, quote805-ATP, and opened the builder. No customer contacts, lines, sends or payments. This single internal zero-value draft was archived, not deleted. Screenshot: outputs/quote-creation-repair/live-created-quote.jpg. The side mark is blank for the intentionally numeric-ended internal test name; separate transactional Verification-surname case confirms auto side mark.

## Remaining
Finish source commit/push and mandated Vercel release, verify domain SHA. Existing canonical and prior rollback worktrees untouched. Independent performance audit remains proposal-only.
