# Tracking cleanup

Date: 2026-06-01

## Live-site findings

The homepage source currently shows:

- PixelYourSite Meta Pixel: `549342503537516`
- Older inline Facebook Pixel: `117872572252906`
- GA4 via PixelYourSite: `G-4L4QDRNG4B`
- Additional GA4 tag: `G-CJEBNQJY81`
- Google Ads tag: `AW-1009321066`
- Mobile call button tracking exists for `tel:805-806-9344`

## Rebuild tracking implementation

The Next.js rebuild now supports:

- Browser Meta Pixel PageView from `NEXT_PUBLIC_META_PIXEL_ID`.
- Route-change PageView tracking for client-side navigation.
- Browser Meta `Lead` event after a successful `/api/leads/` submission.
- Browser Meta `Contact` event for tracked phone clicks.
- GA4 `generate_lead` event after a successful lead submission.
- GA4 `phone_click` event for tracked phone clicks.
- Optional Google Ads lead and phone conversion labels.
- Optional server-side Meta Conversions API `Lead` event from `/api/leads/`,
  deduplicated with the browser event by lead ID.

Production env vars:

```text
NEXT_PUBLIC_GA4_ID=
NEXT_PUBLIC_GOOGLE_ADS_ID=
NEXT_PUBLIC_GOOGLE_ADS_LEAD_CONVERSION_LABEL=
NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION_LABEL=
NEXT_PUBLIC_META_PIXEL_ID=
META_PIXEL_ID=
META_CAPI_ACCESS_TOKEN=
META_CAPI_TEST_EVENT_CODE=
```

`META_CAPI_TEST_EVENT_CODE` is only for Events Manager testing and should be
removed before normal production traffic.

## Immediate decision

Pick one source of truth for each platform:

- Meta: keep PixelYourSite if it owns browser plus server events.
- GA4: keep one production GA4 property unless the second property has a clear role.
- Google Ads: keep `AW-1009321066` if it is tied to the active Ads account.

## Events to configure

| User action | Meta event | GA4 event | Google Ads conversion |
| --- | --- | --- | --- |
| Page view | PageView | page_view | no |
| Service page visit | ViewContent | view_item or page_view | no |
| Phone click | Contact | phone_click | yes |
| Contact form submit | Lead | generate_lead | yes |
| Thank-you page load | Lead | generate_lead | yes |

## PixelYourSite settings to check

1. Remove duplicate Meta Pixel IDs unless both are intentionally needed.
2. Enable form tracking for Forminator if available.
3. Add a custom event for successful Forminator form `1607`.
4. Add a Lead event on `/thank-you/`.
5. Confirm Advanced Matching and Conversions API are connected only to the active Meta dataset.

## GA4 and Ads settings to check

1. Mark `generate_lead` as a key event in GA4.
2. Import the lead key event into Google Ads only once.
3. Use a separate Ads conversion action for phone clicks.
4. Do not count both form submit and thank-you page as separate primary conversions unless they are deduplicated.

## Test protocol

1. Open the site in an incognito browser with Meta Pixel Helper.
2. Visit homepage, service page, consultation page, and contact page.
3. Click the phone link and verify one Contact/phone event.
4. Submit a test form and verify one browser Lead/generate_lead event.
5. In Meta Events Manager, verify the matching server Lead event is deduplicated
   with the same event ID.
6. Check GA4 Realtime for source/medium and event name.
7. Confirm the user lands on `/thank-you/` after submit.
