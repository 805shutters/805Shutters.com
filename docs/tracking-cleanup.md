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
4. Submit a test form and verify one Lead/generate_lead event.
5. Check GA4 Realtime for source/medium and event name.
6. Check Meta Events Manager test events.
