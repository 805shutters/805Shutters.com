"use client";

import { useState } from "react";
import Image from "next/image";
import { CalendarDays, CircleCheck, MapPin } from "lucide-react";
import { brandIdentity } from "@/lib/brand-identity";
import { googleCalendarUrl } from "@/lib/booking/google-calendar";
import styles from "./ConsultationConfirmation.module.css";

export const bookingConsultant = {
  name: "Jessica",
  role: "Design consultant",
  bio: "Jessica brings nine years of design consulting experience to help you find the right window treatments for your home. From shutters to shades and drapery, she’ll guide you through light control, privacy, insulation, and material choices that suit your style.",
  photoSrc: "/images/team/jessica-design-consultant.png",
};

function ConsultantPortrait({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return <div className={styles.portrait}>
    {src && !failed
      ? <Image src={src} alt="Jessica, your design consultant" width={96} height={96}
          sizes="(max-width: 560px) 88px, 96px"
          onError={() => setFailed(true)} />
      : <span aria-hidden="true">J</span>}
  </div>;
}

type Props = {
  date: string;
  time: string;
  dateLabel: string;
  timeLabel: string;
  address: string;
  followUpRequested: boolean;
  photoSrc?: string | null;
};

export function ConsultationConfirmation({ date, time, dateLabel, timeLabel, address, followUpRequested,
  photoSrc = bookingConsultant.photoSrc }: Props) {
  return <div className={styles.confirmation}>
    <div className={styles.status}>
      <CircleCheck className={styles.statusIcon} size={56} aria-hidden="true" />
      <div>
        <h2 className={styles.heading}>Appointment confirmed</h2>
        <p className={styles.subheading}>You’re all set.</p>
      </div>
    </div>
    <div className={styles.consultant}>
      <ConsultantPortrait key={photoSrc ?? "initial"} src={photoSrc} />
      <div className={styles.introduction}>
        <p className={styles.eyebrow}>Meet {bookingConsultant.name} · {bookingConsultant.role}</p>
        <h3 className={styles.name}>Jessica will be there.</h3>
        <p className={styles.bio}>{bookingConsultant.bio}</p>
      </div>
    </div>
    <div className={styles.details}>
      <div className={styles.detail}>
        <CalendarDays size={22} aria-hidden="true" />
        <div><strong>{dateLabel}</strong><p>{timeLabel} · 1 hour · Pacific time</p></div>
      </div>
      <div className={styles.detail}>
        <MapPin size={22} aria-hidden="true" />
        <div><strong>{address}</strong></div>
      </div>
    </div>
    <footer className={styles.footer}>
      <p>{followUpRequested ? "Follow-up from 805 requested." : "No follow-up necessary."}</p>
      <a href={brandIdentity.phoneHref}>{brandIdentity.phone}</a>
    </footer>
    <a className={styles.calendar} href={googleCalendarUrl(date, time, address)} target="_blank" rel="noopener noreferrer">
      <CalendarDays size={20} aria-hidden="true" /> Add to Google Calendar
    </a>
    <p className={styles.calendarHint}>Opens Google Calendar. Tap Save to add your appointment.</p>
  </div>;
}
