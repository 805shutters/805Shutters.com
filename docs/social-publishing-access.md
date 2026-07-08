# Social Publishing Access

Last checked: 2026-07-08

This repo can prepare website/social packets for project photos. Live social/search publishing has two supported paths:

1. API publishing through `scripts/publish_social_from_packet.mjs` after tokens are saved.
2. Browser-session publishing through the logged-in Chrome profiles when API credentials are not available.

## Meta

- Business portfolio: 805 Shutters
- Business ID: `1695855623965388`
- Facebook Page: 805 Shutters
- Facebook Page ID: `410263192496355`
- Instagram account: `805shutters`
- System user visible in Business Settings: `Conversions API System User`
- System user ID: `61591524700748`
- Installed app visible for the system user: `Conversions API Application`

Useful browser pages:

- Meta Business Suite: `https://business.facebook.com/latest/home?asset_id=410263192496355&business_id=1695855623965388`
- Page asset settings: `https://business.facebook.com/latest/settings/pages/?business_id=1695855623965388&selected_asset_id=410263192496355&selected_asset_type=page`
- System user settings: `https://business.facebook.com/latest/settings/system_users?business_id=1695855623965388`

Current API blocker:

- Meta Developer Apps and Graph API Explorer show "You don't have access" in the current Chrome account context.
- The existing system user is assigned to pixel/dataset assets, not Page/Instagram publishing.
- A usable API setup still needs a Page access token with Page publishing permissions and an Instagram publishing token/account ID.

## Google Business Profile

- Chrome account index with access: `authuser=2`
- Business Profile: 805 Shutters Shades & Blinds
- Business status: verified
- Store code shown in GBP Manager: `7070892628080768735`

Useful browser pages:

- GBP location list: `https://business.google.com/u/2/locations`
- Google Business Profile APIs: `https://developers.google.com/my-business`
- Google Cloud API library: `https://console.cloud.google.com/apis/library?authuser=2`
- Google Cloud OAuth credentials: `https://console.cloud.google.com/apis/credentials?authuser=2`

Current API blocker:

- `.env.local` does not currently contain a Google OAuth client/secret/refresh token for the `https://www.googleapis.com/auth/business.manage` scope.
- API publishing still needs `GOOGLE_BUSINESS_ACCOUNT_ID`, `GOOGLE_BUSINESS_LOCATION_ID`, `GOOGLE_BUSINESS_CLIENT_ID`, `GOOGLE_BUSINESS_CLIENT_SECRET`, and `GOOGLE_BUSINESS_REFRESH_TOKEN`.

## Required Environment Variables

```env
SOCIAL_PUBLIC_BASE_URL=https://www.805shutters.com
META_GRAPH_VERSION=v23.0
FACEBOOK_PAGE_ID=410263192496355
FACEBOOK_PAGE_ACCESS_TOKEN=
INSTAGRAM_BUSINESS_ACCOUNT_ID=
INSTAGRAM_ACCESS_TOKEN=
GOOGLE_BUSINESS_ACCOUNT_ID=
GOOGLE_BUSINESS_LOCATION_ID=
GOOGLE_BUSINESS_CLIENT_ID=
GOOGLE_BUSINESS_CLIENT_SECRET=
GOOGLE_BUSINESS_REFRESH_TOKEN=
```

Run a dry-run before any live publish:

```bash
node scripts/publish_social_from_packet.mjs content/social/recent-projects/2026-07-08-kitchen-roman-shade.md
```

Only run live publishing after the website images are deployed and the user has approved the post:

```bash
node scripts/publish_social_from_packet.mjs content/social/recent-projects/2026-07-08-kitchen-roman-shade.md --live
```
