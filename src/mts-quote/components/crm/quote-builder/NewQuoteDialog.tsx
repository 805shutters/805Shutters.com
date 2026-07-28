"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import { QUOTE_ACCOUNTS } from "@mts/lib/quoteConstants";

type QuoteAccountOption = (typeof QUOTE_ACCOUNTS)[number];

interface NewQuoteDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: NewQuoteData) => void;
  isPending?: boolean;
  accountOptions?: readonly QuoteAccountOption[];
}

export interface NewQuoteData {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerEmail: string;
  accountId: string;
}

export function NewQuoteDialog({
  open,
  onClose,
  onSubmit,
  isPending,
  accountOptions = QUOTE_ACCOUNTS,
}: NewQuoteDialogProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleClose = () => {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setCustomerEmail("");
    onClose();
  };

  // Esc to close + lock background scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const nameReady = Boolean(customerName.trim());

  const submitForAccount = (accountId: string) => {
    if (!nameReady || isPending) return;
    onSubmit({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerAddress: customerAddress.trim(),
      customerEmail: customerEmail.trim(),
      accountId,
    });
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="crm-slot-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nq-modal-title"
    >
      <button
        type="button"
        className="crm-slot-modal__backdrop"
        aria-label="Close new quote form"
        onClick={handleClose}
      />
      <section className="crm-slot-form-panel">
        <div className="crm-slot-form-head">
          <div>
            <p className="eyebrow">New Quote</p>
            <h2 id="nq-modal-title">Customer Details</h2>
          </div>
          <button
            type="button"
            className="crm-slot-close"
            aria-label="Close new quote form"
            onClick={handleClose}
          >
            ×
          </button>
        </div>
        <p className="crm-slot-time-summary">Choose an account to create the quote</p>
        <form className="crm-form" onSubmit={(e) => e.preventDefault()}>
          <div className="crm-field-row">
            <label>
              Customer
              <input
                placeholder="Customer name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              Phone
              <input
                placeholder="805-000-0000"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </label>
          </div>
          <div className="crm-field-row">
            <label>
              Email
              <input
                type="email"
                placeholder="customer@email.com"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </label>
            <label>
              Address
              <AddressAutocomplete
                placeholder="Project address"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                onResolved={(address) => setCustomerAddress(address.fullAddress)}
              />
            </label>
          </div>
          {!nameReady && (
            <p
              style={{
                margin: 0,
                color: "var(--muted)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Enter a customer name to continue
            </p>
          )}
          <div className="crm-slot-actions">
            <button type="button" className="crm-ghost-button" onClick={handleClose}>
              Cancel
            </button>
            {accountOptions.map((account) => (
              <button
                key={account.id}
                type="button"
                disabled={!nameReady || isPending}
                onClick={() => submitForAccount(account.id)}
              >
                {isPending ? "Creating..." : account.name}
              </button>
            ))}
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
