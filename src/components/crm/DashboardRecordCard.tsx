"use client";

import type { CrmJob } from "@/lib/crm/types";

type DashboardRecordCardProps = {
  customerName: string;
  meta?: string | null;
  value?: string | null;
  address?: string | null;
  phone?: string | null;
  active: boolean;
  onSelect: () => void;
};

function cleanContactValue(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned || null;
}

export function dashboardRecordContact(address?: string | null, phone?: string | null) {
  return {
    address: cleanContactValue(address),
    phone: cleanContactValue(phone)
  };
}

export function dashboardRecordContactFromJob(job: Pick<CrmJob, "address" | "phone"> | null | undefined) {
  return dashboardRecordContact(job?.address, job?.phone);
}

export function DashboardRecordCard({
  customerName,
  meta,
  value,
  address,
  phone,
  active,
  onSelect
}: DashboardRecordCardProps) {
  const contact = dashboardRecordContact(address, phone);

  return (
    <button type="button" role="option" aria-selected={active} className={active ? "active" : ""} onClick={onSelect}>
      <strong>{customerName}</strong>
      <span>{meta || "Customer record"}</span>
      <em>{value || "Open"}</em>
      {contact.address || contact.phone ? (
        <span className="crm-dashboard-record-contact">
          {contact.address ? <span>{contact.address}</span> : null}
          {contact.phone ? <span>{contact.phone}</span> : null}
        </span>
      ) : null}
    </button>
  );
}
