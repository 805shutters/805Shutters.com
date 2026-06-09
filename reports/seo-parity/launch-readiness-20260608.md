# 805 Shutters SEO Launch Readiness

Generated June 8, 2026 from the live WordPress site and the local production build.

## Result

The rebuild is now SEO-parity ready for the existing WordPress sitemap URLs.

## Verification

- Live WordPress sitemap URLs checked: 86
- Rebuilt sitemap URLs checked: 90
- Old sitemap URLs missing from the rebuild: 0
- Old sitemap URLs with less searchable content than WordPress: 0
- Local technical SEO flagged pages: 0
- Missing image alt issues in local audit: 0
- Vague-link issues in local audit: 0
- First-party HTTP asset issues in local audit: 0

## Redirect Coverage

Legacy WordPress URLs outside the rebuilt sitemap now redirect to relevant pages:

- Old blog and inspiration URLs redirect to `/recent-projects/`
- Old product URLs redirect to `/window-coverings/`
- Old contact/about/FAQ URLs redirect to their rebuilt equivalents
- Old gallery and portfolio attachment URLs redirect to `/gallery/`
- Old shutter, shade, and blind attachment URLs redirect to their product category pages
- Old service URLs redirect to `/window-treatments/`

## Launch Notes

- The Vercel preview domain should remain `noindex` until the real domain is pointed at Vercel.
- After DNS cutover, verify `https://www.805shutters.com/robots.txt`, `https://www.805shutters.com/sitemap.xml`, and several legacy redirects on the production domain.
- Keep the old hosting active for a short overlap window during DNS propagation.
