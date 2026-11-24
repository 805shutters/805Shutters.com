import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Card Payments | 805 Shutters",
  robots: { index: false, follow: false },
};
export default function AutopaySetupPage() {
  return (
    <main className="autopay-page">
      <h1>Card payments now use Stripe</h1>
      <p>This saved-card setup link has been retired. Use the Pay with card button on your current signed contract or your latest Stripe payment link.</p>
      <p>For a new payment link, call or text <a href="tel:+18058069344">805-806-9344</a>.</p>
    </main>
  );
}
