import type { Metadata } from "next";
import Link from "next/link";
import { SMS_OPT_IN_NO_SHARING_STATEMENT, staffBookingSmsNotice } from "@/lib/sms/staff-booking-notice";

export const metadata: Metadata = {
  title: "Staff booking text terms | 805 Shutters",
  description: "Terms for staff-only text alerts when SNS Interiors dba 805 Shutters confirms a consultation.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/staff-booking-sms/" },
};

export default function StaffBookingSmsPage() {
  const notice = staffBookingSmsNotice;
  return (
    <main className="content-wrap section-stack">
      <p className="eyebrow">Staff text messages</p>
      <h1>Staff booking text terms</h1>
      <p>
        {notice.legalName} sends {notice.program}. A message is sent only to designated 805 Shutters staff after a consultation is confirmed. These are not customer marketing texts.
      </p>
      <p>{notice.frequency} {notice.rates}</p>
      <p>
        Reply <strong>STOP</strong> to unsubscribe from these staff alerts.
      </p>
      <p>
        Reply <strong>HELP</strong> for help, or contact <a href={`mailto:${notice.email}`}>{notice.email}</a> or <a href={notice.phoneHref}>{notice.phoneDisplay}</a>.
      </p>
      <p>{notice.carrierNotice}</p>
      <p>{SMS_OPT_IN_NO_SHARING_STATEMENT}.</p>
      <p>{notice.consentGap}</p>
      <p>
        <Link href="/privacy-policy/">Privacy Policy</Link>
      </p>
    </main>
  );
}
