import { CrmCalendarEvent } from "@/lib/crm/types";
import { sendCrmSms } from "@/lib/crm/sms";

type AlertDelivery = {
  channel: "sms" | "webhook";
  target: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export type AppointmentAlertResult = {
  message: string;
  deliveries: AlertDelivery[];
  smsSent: number;
  smsSkipped: number;
  webhookSent: boolean;
};

const defaultJessicaSalesNumber = "+18059144917";

function parseList(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatAppointmentDateTime(event: CrmCalendarEvent) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(event.start_at));
}

function metaText(event: CrmCalendarEvent, key: string) {
  const value = event.meta?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildCrmAppointmentAlertMessage(event: CrmCalendarEvent) {
  const customerName = metaText(event, "customer_name") || event.customer_name || event.title;
  const customerPhone = metaText(event, "customer_phone");
  const productInterest = metaText(event, "productInterestLabel") || metaText(event, "productInterest");
  const lines = [
    "New 805 appointment scheduled",
    `Customer: ${customerName}`,
    customerPhone ? `Phone: ${customerPhone}` : null,
    productInterest ? `Product: ${productInterest}` : null,
    event.location ? `Address: ${event.location}` : null,
    `Date/Time: ${formatAppointmentDateTime(event)}`,
    `Assigned: ${event.assigned_to}`,
    event.notes ? `Notes: ${event.notes}` : null
  ];

  return lines.filter(Boolean).join("\n");
}

function appointmentSmsRecipients(event: CrmCalendarEvent) {
  const recipients = new Set<string>(parseList(process.env.CRM_APPOINTMENT_ALERT_SMS_NUMBERS));
  const assigned = event.assigned_to.toLowerCase();

  if (assigned.includes("jessica")) {
    recipients.add(process.env.JESSICA_805_SALES_SMS_NUMBER || defaultJessicaSalesNumber);
  }

  if (assigned.includes("mike") && process.env.MIKE_805_SALES_SMS_NUMBER) {
    recipients.add(process.env.MIKE_805_SALES_SMS_NUMBER);
  }

  return Array.from(recipients);
}

export async function dispatchCrmAppointmentAlerts(event: CrmCalendarEvent): Promise<AppointmentAlertResult> {
  const message = buildCrmAppointmentAlertMessage(event);
  const deliveries: AlertDelivery[] = [];

  for (const recipient of appointmentSmsRecipients(event)) {
    try {
      const result = await sendCrmSms(recipient, message);
      deliveries.push({
        channel: "sms",
        target: recipient,
        ok: result.ok,
        skipped: result.skipped,
        error: result.error
      });
    } catch (error) {
      deliveries.push({
        channel: "sms",
        target: recipient,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const webhookUrl = process.env.CRM_APPOINTMENT_ALERT_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "805_crm_appointment",
          event,
          message
        })
      });
      deliveries.push({
        channel: "webhook",
        target: webhookUrl,
        ok: response.ok,
        error: response.ok ? undefined : await response.text()
      });
    } catch (error) {
      deliveries.push({
        channel: "webhook",
        target: webhookUrl,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    message,
    deliveries,
    smsSent: deliveries.filter((item) => item.channel === "sms" && item.ok).length,
    smsSkipped: deliveries.filter((item) => item.channel === "sms" && item.skipped).length,
    webhookSent: deliveries.some((item) => item.channel === "webhook" && item.ok)
  };
}
