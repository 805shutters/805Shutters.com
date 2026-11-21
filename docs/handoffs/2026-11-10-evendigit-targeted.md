# Website repairs for local review, November 10

The owner rejected the redesign. This patch starts from original site revision cc21a65d and keeps the existing homepage, navigation, products, typography, pictures and footer.

- Header About Us opens the existing About page. TEXT opens the existing text-request form on desktop or the SMS link on supported mobile devices. CALL is unchanged.
- Header EMAIL opens the existing contact form. Visitors can also choose the direct email address. A successful form submission now continues to the inquiry confirmation reliably.
- The homepage no longer displays the admin login control. Staff CRM access is unchanged. Existing Facebook, Instagram and Yelp icons remain.
- Ask 805 keeps both choices. “Text us a question” tracks the mobile SMS handoff or the desktop form opening and accepted submission. “General inquiry” tracks the assistant opening and returning an answer. These are not bookings.
- Successful standard and commercial bookings open /booking-thank-you/ with appointment details. The booking response supplies the identifier for booking_confirmed and, when the existing Ads ID and label are configured, a Google Ads conversion. Reloads, direct visits, alternate-time requests and general inquiries do not generate a booking event.

The production build passed. 10,709 unit tests passed (36 skipped); six local browser tests passed with all external destinations intercepted. No real appointment, communication or Ads configuration change. Google account receipt is unverified. The homepage first screen matched the baseline pixel for pixel at 1440 × 900 and 390 × 664 using the same carousel image and reduced motion. No push or deployment.
