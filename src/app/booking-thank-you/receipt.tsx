"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  takeBookingReceipt,
  type BookingReceipt,
} from "@/lib/booking/browser-receipt";
import { ConsultationConfirmation } from "@/components/booking/ConsultationConfirmation";
import { site } from "@/lib/site-data";

export function BookingThankYou() {
  const [receipt, setReceipt] = useState<BookingReceipt | null | undefined>(
    undefined,
  );
  useEffect(() => {
    const next = takeBookingReceipt();
    setReceipt((current) => current ?? next);
  }, []);
  return (
    <section className="content-wrap section-stack">
      <p className="eyebrow">805 Shutters</p>
      {receipt ? (
        <>
          <h1>Thank you for booking.</h1>
          {receipt.variant === "standard" ? (
            <ConsultationConfirmation {...receipt} />
          ) : (
            <>
              <h2>Commercial shade audit confirmed</h2>
              <p>
                {receipt.dateLabel} at {receipt.timeLabel} Pacific time
                <br />
                {receipt.address}
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <h1>Booking confirmation</h1>
          {receipt === null && (
            <p>
              Have a question about an appointment? Call{" "}
              <a href={site.phoneHref}>{site.phone}</a>. To schedule a visit,{" "}
              <Link href="/book-consultation/">choose an appointment time</Link>
              .
            </p>
          )}
        </>
      )}
    </section>
  );
}
