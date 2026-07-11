"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import { QUOTE_ACCOUNTS } from "@mts/lib/quoteConstants";
import type { CrmCustomer } from "@/lib/crm/types";

type QuoteAccountOption = (typeof QUOTE_ACCOUNTS)[number];

interface NewQuoteDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: NewQuoteData) => void;
  isPending?: boolean;
  accountOptions?: readonly QuoteAccountOption[];
  customers?: CrmCustomer[];
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
  customers = [],
}: NewQuoteDialogProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [mounted, setMounted] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const matchingCustomers = useMemo(() => {
    const query = customerSearch.trim().toLocaleLowerCase();
    if (query.length < 2) return [];
    return customers
      .filter((customer) =>
        [customer.display_name, customer.phone, customer.email, customer.address, customer.city]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase().includes(query))
      )
      .slice(0, 8);
  }, [customerSearch, customers]);

  useEffect(() => setMounted(true), []);

  const handleClose = () => {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setCustomerEmail("");
    setCustomerSearch("");
    setSelectedCustomerId(null);
    onClose();
  };

  const selectCustomer = (customer: CrmCustomer) => {
    setCustomerName(customer.display_name || "");
    setCustomerPhone(customer.phone || "");
    setCustomerEmail(customer.email || "");
    setCustomerAddress(customer.address || "");
    setCustomerSearch(customer.display_name || "");
    setSelectedCustomerId(customer.id);
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
          <div className="crm-customer-lookup">
            <label htmlFor="new-quote-customer-search">Find an existing customer</label>
            <input
              id="new-quote-customer-search"
              type="search"
              placeholder="Search by name, phone, email, or address"
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setSelectedCustomerId(null);
              }}
              autoComplete="off"
              autoFocus
            />
            {customerSearch.trim().length >= 2 && !selectedCustomerId ? (
              <div className="crm-customer-lookup__results" role="listbox" aria-label="Matching customers">
                {matchingCustomers.length ? matchingCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    role="option"
                    aria-selected="false"
                    onClick={() => selectCustomer(customer)}
                  >
                    <strong>{customer.display_name}</strong>
                    <span>{[customer.phone, customer.email, customer.address].filter(Boolean).join(" • ")}</span>
                  </button>
                )) : <p>No existing customers found. Enter new customer details below.</p>}
              </div>
            ) : null}
            {selectedCustomerId ? <p className="crm-customer-lookup__selected">Existing customer selected — their saved information is filled in below.</p> : null}
          </div>
          <p className="crm-customer-lookup__divider"><span>Customer details</span></p>
          <div className="crm-field-row">
            <label>
              Customer
              <input
                placeholder="Customer name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
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
