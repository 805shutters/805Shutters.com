import { bookingEndIso, zonedTimeToUtc } from "@/lib/booking/availability";
import type { CrmCalendarEvent } from "@/lib/crm/types";

export type Sales805BookingAppointment = {
  id: string;
  quote_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string;
  appointment_date: string;
  start_time: string | null;
  end_time: string | null;
  assigned_to: "Mike" | "Jessica" | string;
  status: "scheduled" | "completed" | "cancelled" | string;
  notes: string | null;
  source: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function appointmentStatus(status: string): CrmCalendarEvent["status"] {
  if (status === "cancelled") return "canceled";
  if (status === "completed") return "complete";
  return "scheduled";
}

function appointmentEndIso(appointment: Sales805BookingAppointment, startAt: string) {
  if (!appointment.end_time) return bookingEndIso(appointment.appointment_date, appointment.start_time || "08:00");

  const endAt = zonedTimeToUtc(appointment.appointment_date, appointment.end_time).toISOString();
  return new Date(endAt).getTime() > new Date(startAt).getTime()
    ? endAt
    : bookingEndIso(appointment.appointment_date, appointment.start_time || "08:00");
}

export function sales805AppointmentsToCalendarEvents(
  appointments: Sales805BookingAppointment[]
): CrmCalendarEvent[] {
  return appointments
    .filter((appointment) => appointment.appointment_date && appointment.start_time)
    .map((appointment) => {
      const startAt = zonedTimeToUtc(appointment.appointment_date, appointment.start_time || "08:00").toISOString();
      const endAt = appointmentEndIso(appointment, startAt);

      return {
        id: `sales-805:${appointment.id}`,
        created_at: appointment.created_at || startAt,
        updated_at: appointment.updated_at || appointment.created_at || startAt,
        job_id: null,
        title: `${appointment.customer_name} consultation`,
        event_type: "sales_consult",
        status: appointmentStatus(appointment.status),
        assigned_to: appointment.assigned_to || "Unassigned",
        start_at: startAt,
        end_at: endAt,
        location: appointment.customer_address || null,
        notes: appointment.notes || null,
        meta: {
          ...(appointment.metadata || {}),
          source: "sales_805_appointments",
          sales_805_appointment_id: appointment.id,
          sales_805_appointment_status: appointment.status,
          sales_805_appointment_source: appointment.source,
          mts_quote_id: appointment.quote_id,
          customer_name: appointment.customer_name,
          customer_phone: appointment.customer_phone,
          customer_address: appointment.customer_address
        },
        customer_name: appointment.customer_name,
        customer_phone: appointment.customer_phone,
        customer_address: appointment.customer_address
      };
    });
}

export function sales805AppointmentDateRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const next =
    monthNumber === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;

  return { start, end: next };
}
