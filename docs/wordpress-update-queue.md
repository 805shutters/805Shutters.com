# WordPress update queue

Date: 2026-05-30

These are the first edits to make inside WordPress. They are ordered by SEO and
lead-generation impact.

## 1. Homepage

URL: `https://www.805shutters.com/`

Current issues from audit:

- H1 is `Don't take our word for it...`, which should be a review-section
  heading, not the page's main heading.
- Three links use vague `learn more` anchor text.
- Page has about 167 detected words, which is light for the primary local
  service page.
- 28 visible images are missing alt text.

Recommended H1:

```text
Custom Shutters, Shades & Blinds in Ventura County
```

Recommended intro copy:

```text
805 Shutters, Shades & Blinds helps Ventura County homeowners and businesses
choose custom window treatments that fit their rooms, light, privacy, and
budget. Our family-owned local team measures, recommends, and installs
plantation shutters, roller shades, honeycomb shades, wood and faux wood
blinds, vertical blinds, and commercial window coverings across Camarillo,
Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Ojai, and nearby
communities.
```

Recommended CTA copy:

```text
Schedule a free in-home consultation or call 805-806-9344 to talk through your
project.
```

Replace homepage link text:

- `learn more` under Shutters -> `Explore custom shutters`
- `learn more` under Shades -> `Explore window shades`
- `learn more` under Blinds -> `Explore custom blinds`

Add homepage section:

```text
Popular Window Treatment Services

Custom shutters: Durable, low-maintenance shutters for living rooms, bedrooms,
sliding doors, specialty shapes, and whole-home upgrades.

Custom shades: Roller shades, honeycomb shades, woven wood shades, Roman
shades, layered shades, and motorized options for light control and privacy.

Custom blinds: Wood, faux wood, aluminum, vertical, and softwood blinds
measured and installed by a local Ventura County team.

Commercial window coverings: Roller shades and window treatments for offices,
storefronts, restaurants, schools, medical spaces, and shared workspaces.
```

Add internal links from this section:

- `/shutters/`
- `/shades/`
- `/blinds/`
- `/commercial-window-coverings/`
- `/commercial-roller-shades/`
- `/recent-projects/`
- `/reviews/`
- `/contact/`

## 2. Parent service pages missing H1s

Add one visible H1 near the top of each page:

- `/shutters/` -> `Custom Shutters in Ventura County`
- `/shades/` -> `Custom Window Shades in Ventura County`
- `/blinds/` -> `Custom Blinds in Ventura County`
- `/window-treatments/` -> `Window Treatments in Ventura County`
- `/window-coverings/` -> `Window Coverings in Ventura County`
- `/commercial-window-coverings/` -> `Commercial Window Coverings in Ventura County`
- `/commercial-roller-shades/` -> `Commercial Roller Shades in Ventura County`
- `/faq/` -> `Shutters, Shades & Blinds FAQ`
- `/contact/` -> `Contact 805 Shutters`
- `/gallery/` -> `Window Treatment Gallery`

If the page already has a large visual title that is not coded as H1, change
that element to H1 instead of adding a duplicate.

## 3. Thin page expansion

Add at least 350-600 words of useful local content to these indexable pages:

- `/`
- `/blinds/`
- `/contact/`
- `/gallery/`
- `/reviews/`
- `/shades/`
- `/shutters/`
- `/window-coverings/`
- `/window-treatments/`

Use this structure:

1. What the page is about.
2. Which service areas are covered.
3. What product options are available.
4. Why choose 805 Shutters.
5. Clear call to action.

## 4. Image alt text

Add descriptive alt text to visible images on:

- `/`
- `/shutters/`
- `/shades/`
- `/blinds/`
- `/gallery/`
- `/window-treatments/`
- `/window-coverings/`
- `/shutters/interior-shutters-camarillo/`
- `/shutters/wood-shutters-camarillo/`
- `/ventura-county-window-treatments-camarillo-blinds-shades-shutters/`

Alt text pattern:

```text
[product type] installed in [room or property type] in Ventura County
```

Examples:

- `White plantation shutters installed in a Ventura County dining room`
- `Roller shade installed on a large living room window`
- `Wood blinds installed in a Camarillo home`
- `Commercial roller shades installed in an office`

## 5. Paid-social landing page

Create a dedicated page for Facebook and Instagram ads instead of sending all
paid traffic to the homepage.

Recommended URL:

```text
/free-window-treatment-consultation/
```

Recommended title:

```text
Free Window Treatment Consultation in Ventura County | 805 Shutters
```

Recommended H1:

```text
Free In-Home Window Treatment Consultation
```

Required sections:

- Primary CTA with phone number and form.
- Short trust block: family-owned, local experience, review proof.
- Product cards: shutters, shades, blinds, commercial.
- Recent install photos.
- Service area list.
- FAQ.
- Form submit redirect to `/thank-you/`.

## 6. Tracking cleanup

In PixelYourSite and any theme/header injection area:

- Confirm whether Meta Pixel `549342503537516` is the active pixel.
- Confirm whether old Facebook Pixel `117872572252906` is still needed.
- Confirm whether both GA4 IDs are intentional:
  - `G-4L4QDRNG4B`
  - `G-CJEBNQJY81`
- Keep one intentional analytics setup and document the reason for any duplicate
  property.
- Add/verify conversion events:
  - Phone click -> `Contact`
  - Form submit -> `Lead`
  - Thank-you page view -> `Lead`
