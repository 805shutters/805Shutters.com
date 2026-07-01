# Portfolio Photo Inbox

Use this folder as the staging area for new portfolio photos sent in the Codex chat.

Keep raw or unreviewed photos here instead of under `public/`, because files in `public/` can be served directly by the website.

Workflow:

1. Save incoming originals here first.
2. Review each photo for customer privacy, duplicate content, orientation, and portfolio fit.
3. Move approved originals into `public/images/portfolio-originals/`.
4. Create optimized gallery versions in `public/images/portfolio-enhanced/`.
5. Add approved gallery cards to `oldWebsitePortfolioGallery` in `src/lib/site-data.ts`.
6. Verify `/gallery/` before publishing.

Filename pattern for incoming files:

`YYYY-MM-DD-short-description-original.ext`

Examples:

- `2026-07-01-ventura-shutters-living-room-original.jpg`
- `2026-07-01-camarillo-roller-shades-bedroom-original.heic`
