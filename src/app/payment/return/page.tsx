import Link from "next/link";
export default function PaymentReturn() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <h1 className="text-3xl font-semibold">Return to your contract</h1>
      <p className="mt-5">
        Your payment status is confirmed securely with the card processor.
        Returning to this page does not by itself confirm a payment.
      </p>
      <p className="mt-4">
        Open your original contract link to see the updated balance. If you
        cancelled checkout, no payment is confirmed here.
      </p>
      <Link className="mt-6 inline-block underline" href="/contact/">
        Contact 805 Shutters
      </Link>
    </main>
  );
}
