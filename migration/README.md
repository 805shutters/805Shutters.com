# Migration workspace

This folder tracks the WordPress-to-Vercel migration inventory.

- `current-url-inventory.csv` is generated from `reports/site-audit.json`.
- `redirects-draft.csv` is a starter redirect queue for URLs that should not
  become standalone pages in the rebuild.

Regenerate after refreshing the live audit:

```bash
npm run audit:site
npm run migration:inventory
```

Before DNS cutover, every currently indexable URL should be marked as one of:

- `rebuilt`
- `redirect`
- `noindex_or_remove`
- `needs_review`
