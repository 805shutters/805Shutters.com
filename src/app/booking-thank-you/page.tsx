import type { Metadata } from "next";
import { BookingThankYou } from "./receipt";
export const metadata: Metadata = {
  title: "Booking confirmation | 805 Shutters",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <BookingThankYou />;
}
