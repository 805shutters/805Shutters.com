# Facebook and Instagram launch checklist

Date: 2026-06-01

## Account setup

- Business Manager access confirmed.
- Ad account payment method active.
- Facebook page connected.
- Instagram account connected.
- Pixel/dataset selected.
- Domain verified if available.
- Privacy policy URL available for instant forms.

## Website setup

- `/free-window-treatment-consultation/` live.
- Rebuild lead form or Forminator form `1607` embedded.
- Form redirects to `/thank-you/`.
- Thank-you page noindexed if it should not rank.
- `/privacy-policy/` is live and linked from the form and footer.
- Phone links use `tel:8058069344`.
- UTMs preserved through landing page and form submission where possible.

## Tracking setup

- One active Meta Pixel strategy selected.
- Duplicate legacy pixel reviewed.
- `Lead` fires once on form submit or thank-you page.
- `Contact` fires once on phone click.
- Optional server-side Meta Conversions API Lead event is deduplicated.
- GA4 sees `generate_lead` and `phone_click`.
- Google Ads conversions do not double-count the same lead.

## Creative setup

- At least 5 static ads exported.
- At least 3 short videos or slideshows exported.
- At least 1 carousel built.
- 4:5, 1:1, and 9:16 versions available.
- Text and CTA are inside safe zones.

## Launch setup

- Campaigns built from `content/ads/heavy-launch-campaigns.csv`.
- Ads built from `content/ads/ad-variants.csv`.
- Instant form built from `content/ads/instant-form-blueprint.md`.
- UTM links checked.
- Daily budget starts at Validation or Heavy Launch tier.
- First 72-hour review time blocked on calendar.
