# Portfolio Photo Intake

This chat is the intake lane for new 805 Shutters portfolio photos.

When photos are sent here, add them to the website portfolio by following this path:

1. Place the received originals in `portfolio-inbox/`.
2. Keep only photos that are useful for the public website and do not expose private customer information.
3. Convert approved images into the existing gallery asset pattern:
   - Originals: `public/images/portfolio-originals/`
   - Website-ready images: `public/images/portfolio-enhanced/`
   - Card image names should end in `-card.jpg`
   - Wider editorial images should end in `-wide.jpg` when needed
   - Natural aspect versions should end in `-natural.jpg` when needed
4. Add the live gallery entry to `oldWebsitePortfolioGallery` in `src/lib/site-data.ts`.
5. Use descriptive alt text with the product, room, and Ventura County/local context when accurate.
6. Check the rendered `/gallery/` page locally before deploy or push.

Keep unreviewed originals out of `public/` so they are not directly served by the website. Do not add new portfolio photos to the homepage or product story rail unless that is specifically requested. The portfolio gallery is the default destination.
