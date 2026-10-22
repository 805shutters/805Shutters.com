# 805 Shutters Repo Instructions

## Coding Agent

- Use Codex directly with the latest, most capable model available to this account. Verify the current model catalog rather than retaining an older model pin; never silently downgrade. Hermes is no longer used.
- A coding request from Mike includes authorization to complete the full verified production workflow unless he explicitly says `draft`, `do not push`, or `do not deploy`.
- Do not stop after editing files. Keep working until the change passes validation, is committed and pushed, and the production deployment is verified.

## Deployment

- When the user says `Push`, push `main`.
- When the user says `deploy`, deploy this repo to the new Vercel project only.
- Do not route normal deploy work through HostGator or WordPress.
- Deployment target:
  - GitHub repo: `805shutters/805Shutters.com`
  - Branch: `main`
  - Vercel project: `805`
  - Website URL for verification: `https://www.805shutters.com`
- Full coding and deploy flow:
  1. Inspect the existing implementation and repository status.
  2. Implement the requested change.
  3. Run `npm run typecheck`, `npm test`, and `npm run build`.
  4. Review the final diff and stage only intentional source changes.
  5. Commit to `main` using a concise conventional commit message.
  6. Push `origin main`.
  7. Run `npm run deploy:vercel`.
  8. Verify the production change at `https://www.805shutters.com` before reporting completion.
- Database migrations, authentication, payment behavior, destructive operations, and production-secret changes require an additional safety review before execution.
- If validation or deployment fails, fix it and rerun the checks. If an external blocker remains, report the exact blocker instead of claiming completion.

## Official quote artwork — owner requirement, 2026-10-22

- Every quote/contract product category must use its dedicated 805 signature pencil sketch. Reuse the existing collection; the owner explicitly authorized recreating missing sketches in the same catalog style on 2026-10-22. No photographs, stock art, generic document icons, or improvised technical diagrams.
- Use the dedicated specialty shutter renderer and its official graphite components for the 46 specialty shapes and six French-door cutout profiles. A French-door cutout must visibly include the cutout, never a plain rectangular panel.
- `OFFICIAL_CATEGORY_SKETCHES` in `src/lib/quote/anatomy-reference-artwork.ts` maps the category references. Keep both compact and contract layouts covered by `contract-product-coverage.test.ts`. A new category requires an official mapped sketch before release.
- Preserve recorded configuration and pricing. When exact artwork choices are missing or conflicting, show an explicitly labeled official category/profile reference; never write a demonstration type, handle side, frame, or control back into the quote. An unmapped product must say “Official 805 sketch required” instead of silently substituting artwork.
- Do not ask the owner to identify A–F to recover the catalog. The recreated French-door category sketch is in `french-door-v1`; it visibly includes the shaped handle-clearance stile without selecting a missing factory cutout type. Preserve the source PNG and generation prompt. Keep the complete collection findable at `/quote/sketch-catalog/`, including individual specialty exports. Deployment and routing tests alone do not prove visual correctness.
