import { MobileAppointmentApp } from "@/components/crm/MobileAppointmentApp";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const metadata = privatePageMetadata("805 Appointments");

export default function MobileAppointmentsPage() {
  return <MobileAppointmentApp />;
}
