"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import { QUOTE_ACCOUNTS } from "@mts/lib/quoteConstants";
import { matchingQuoteCustomers } from "@mts/lib/quoteCustomerSearch";
import type { CrmCustomer } from "@/lib/crm/types";

type QuoteAccountOption = (typeof QUOTE_ACCOUNTS)[number];
const EMPTY_CUSTOMERS: CrmCustomer[] = [];

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
  customers = EMPTY_CUSTOMERS,
}: NewQuoteDialogProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [mounted, setMounted] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const resultsRef = useRef<HTMLDivElement>(null);
  const matchingCustomers = useMemo(
    () => matchingQuoteCustomers(customers, customerName),
    [customers, customerName],
  );
  const showSuggestions = suggestionsOpen && !selectedCustomerId && Boolean(customerName.trim());
  const activeCustomer = showSuggestions ? matchingCustomers[activeIndex] : undefined;

  useEffect(() => setMounted(true), []);

  const resetForm = useCallback(() => {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setCustomerEmail("");
    setSelectedCustomerId(null);
    setSuggestionsOpen(false);
    setActiveIndex(-1);
  }, []);

  // A successful submit closes the dialog from its parent, too.
  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (activeCustomer) {
      resultsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    }
  }, [activeCustomer]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const selectCustomer = (customer: CrmCustomer) => {
    setCustomerName(customer.display_name);
    setCustomerPhone(customer.phone || "");
    setCustomerEmail(customer.email || "");
    setCustomerAddress(customer.address || "");
    setSelectedCustomerId(customer.id);
    setSuggestionsOpen(false);
    setActiveIndex(-1);
  };

  // Esc to close + lock background scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) handleClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, handleClose]);

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
          <div className="crm-field-row crm-new-quote-customer-row">
            <div
              className="crm-customer-name-field"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setSuggestionsOpen(false);
              }}
            >
              <label htmlFor="new-quote-customer-name">Customer</label>
              <input
                id="new-quote-customer-name"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showSuggestions && matchingCustomers.length > 0}
                aria-controls={showSuggestions && matchingCustomers.length ? "new-quote-customer-results" : undefined}
                aria-activedescendant={activeCustomer ? `new-quote-customer-${activeCustomer.id}` : undefined}
                placeholder="Customer name"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setSelectedCustomerId(null);
                  setActiveIndex(-1);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => setSuggestionsOpen(true)}
                onKeyDown={(event) => {
                  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !selectedCustomerId && matchingCustomers.length) {
                    event.preventDefault();
                    setSuggestionsOpen(true);
                    setActiveIndex((index) => {
                      if (!showSuggestions || index < 0) return event.key === "ArrowDown" ? 0 : matchingCustomers.length - 1;
                      return (index + (event.key === "ArrowDown" ? 1 : -1) + matchingCustomers.length) % matchingCustomers.length;
                    });
                  } else if (event.key === "Enter" && activeCustomer) {
                    event.preventDefault();
                    selectCustomer(activeCustomer);
                  } else if (event.key === "Escape" && showSuggestions) {
                    event.preventDefault();
                    event.stopPropagation();
                    setSuggestionsOpen(false);
                    setActiveIndex(-1);
                  }
                }}
                autoComplete="off"
                autoFocus
              />
              {showSuggestions ? (
                matchingCustomers.length ? (
                  <div
                    id="new-quote-customer-results"
                    className="crm-customer-name-field__results crm-customer-name-field__results--quote"
                    role="listbox"
                    aria-label="Matching customers"
                    ref={resultsRef}
                  >
                    {matchingCustomers.map((customer, index) => (
                      <button
                        id={`new-quote-customer-${customer.id}`}
                        key={customer.id}
                        type="button"
                        role="option"
                        aria-selected={index === activeIndex}
                        tabIndex={-1}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectCustomer(customer)}
                      >
                        <strong>{customer.display_name}</strong>
                        <span>{[customer.phone, customer.email, customer.address].filter(Boolean).join(" • ")}</span>
                      </button>
                    ))}
                  </div>
                ) : <p className="crm-customer-name-field__empty" role="status">No matching customers. Enter details for a new customer.</p>
              ) : null}
            </div>
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
