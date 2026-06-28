import { Metadata } from "next";
import { MobileAppointmentApp } from "@/components/crm/MobileAppointmentApp";

export const metadata: Metadata = {
  title: "805 Appointments",
  robots: {
    index: false,
    follow: false
  }
};

export default function MobileAppointmentsPage() {
  return <MobileAppointmentApp />;
}
