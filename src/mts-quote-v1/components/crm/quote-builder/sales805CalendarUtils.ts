import { ACCOUNT_IDS } from "@mts-v1/lib/accounts";
import { normalizePhone } from "@mts-v1/lib/customerGrouping";

export type Sales805Appointment = {
  id: string;
  quote_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string;
  appointment_date: string;
  start_time: string | null;
  end_time: string | null;
  assigned_to: "Mike" | "Jessica";
  status: "scheduled" | "completed" | "cancelled";
  notes: string | null;
  source: string;
};

export type Sales805Assignee = "Mike" | "Jessica";

export type Sales805CalendarDay = {
  date: Date;
  isoDate: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
};

export type ManualSales805AppointmentForm = {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  assignedTo: Sales805Assignee;
  notes: string;
};

export function buildMonthCalendarDays(monthDate: Date, today = new Date()): Sales805CalendarDay[] {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);

    return {
      date,
      isoDate: toIsoDate(date),
      dayOfMonth: date.getDate(),
      isCurrentMonth: date.getMonth() === monthDate.getMonth(),
      isToday: toIsoDate(date) === toIsoDate(today),
    };
  });
}

export function groupSales805AppointmentsByDate(
  appointments: Sales805Appointment[]
): Record<string, Sales805Appointment[]> {
  return appointments.reduce<Record<string, Sales805Appointment[]>>((acc, appointment) => {
    if (!acc[appointment.appointment_date]) acc[appointment.appointment_date] = [];
    acc[appointment.appointment_date].push(appointment);
    return acc;
  }, {});
}

export function buildManualSales805AppointmentPayload(form: ManualSales805AppointmentForm) {
  const trimmedPhone = form.customerPhone.trim();

  return {
    account_id: ACCOUNT_IDS.SHUTTERS_805,
    customer_name: form.customerName.trim(),
    customer_phone: trimmedPhone || null,
    customer_phone_normalized: normalizePhone(trimmedPhone) || null,
    customer_address: form.customerAddress.trim(),
    appointment_date: form.appointmentDate,
    start_time: form.startTime,
    end_time: form.endTime || null,
    assigned_to: form.assignedTo,
    notes: form.notes.trim() || null,
    source: "manual_calendar",
    metadata: {
      created_from: "805_calendar_manual",
    },
  };
}

export function buildJessicaSalesAppointmentSms(appointment: Sales805Appointment): string {
  const timeLabel =
    appointment.start_time && appointment.end_time
      ? `${appointment.start_time} to ${appointment.end_time}`
      : appointment.start_time || "Time TBD";

  return [
    "New appointment scheduled",
    `Customer: ${appointment.customer_name}`,
    `Phone: ${appointment.customer_phone || "No phone provided"}`,
    `Address: ${appointment.customer_address}`,
    `Date: ${appointment.appointment_date}`,
    `Time: ${timeLabel}`,
  ].join("\n");
}

export function formatSales805AppointmentTime(value: string | null | undefined): string {
  if (!value) return "Time TBD";

  const [hourValue, minuteValue = "00"] = value.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "Time TBD";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2026, 0, 1, hour, minute));
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
