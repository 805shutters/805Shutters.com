"use client";

import { useState } from "react";
import { CalendarDays, CircleCheck, MapPin } from "lucide-react";
import { brandIdentity } from "@/lib/brand-identity";
import styles from "./ConsultationConfirmation.module.css";

export const bookingConsultant = {
  name: "Jessica",
  role: "Design consultant",
  bio: "Jessica brings nine years of design consulting experience to help you find the right window treatments for your home. From shutters to shades and drapery, she’ll guide you through light control, privacy, insulation, and material choices that suit your style.",
  // Set to the approved portrait's public URL when Jessica's photo is supplied.
  photoSrc: null as string | null,
};

function ConsultantPortrait({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return <div className={styles.portrait}>
    {src && !failed
      ? <img src={src} alt="Jessica, your design consultant" width={72} height={72}
          onError={() => setFailed(true)} />
      : <span aria-hidden="true">J</span>}
  </div>;
}

type Props = {
  dateLabel: string;
  timeLabel: string;
  address: string;
  followUpRequested: boolean;
  onDone: () => void;
  doneLabel: string;
  photoSrc?: string | null;
};

export function ConsultationConfirmation({ dateLabel, timeLabel, address, followUpRequested,
  onDone, doneLabel, photoSrc = bookingConsultant.photoSrc }: Props) {
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
    <button className={styles.done} type="button" onClick={onDone}>{doneLabel}</button>
  </div>;
}
