"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { QuotePaymentType } from "@/lib/crm/quote-payment-state";
import styles from "./QuoteSelection.module.css";

export type QuoteWalletConfig = {
  applicationId: string;
  locationId: string;
  sdkUrl: string;
};

type TokenResult = {
  status: string;
  token?: string;
  errors?: Array<{ message?: string }>;
};

type WalletMethod = {
  tokenize: () => Promise<TokenResult>;
  destroy?: () => Promise<boolean>;
};

type GooglePayMethod = WalletMethod & {
  attach: (
    selector: string,
    options?: { buttonColor?: "default" | "black" | "white"; buttonType?: "long" | "short" },
  ) => Promise<void>;
};

type QuoteSquarePayments = {
  paymentRequest: (options: {
    countryCode: "US";
    currencyCode: "USD";
    total: { amount: string; label: string };
  }) => unknown;
  googlePay: (request: unknown) => Promise<GooglePayMethod>;
  applePay: (request: unknown) => Promise<WalletMethod>;
  verifyBuyer?: (
    sourceId: string,
    details: {
      amount: string;
      currencyCode: "USD";
      intent: "CHARGE";
      billingContact: {
        givenName?: string;
        familyName?: string;
        email?: string;
        phone?: string;
        countryCode: "US";
      };
    },
  ) => Promise<{ token?: string } | null>;
};

type QuoteSquareGlobal = {
  payments: (applicationId: string, locationId: string) => QuoteSquarePayments;
};

const sdkLoads = new Map<string, Promise<void>>();

function squareGlobal() {
  return (window as unknown as { Square?: QuoteSquareGlobal }).Square;
}

function loadSquareSdk(sdkUrl: string) {
  if (squareGlobal()) return Promise.resolve();
  const pending = sdkLoads.get(sdkUrl);
  if (pending) return pending;

  const load = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${sdkUrl}"]`);
    const script = existing || document.createElement("script");
    const loaded = () => (squareGlobal() ? resolve() : reject(new Error("Square SDK did not initialize.")));
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", () => reject(new Error("Square SDK failed to load.")), { once: true });
    if (!existing) {
      script.src = sdkUrl;
      script.async = true;
      script.dataset.squarePaymentsSdk = "true";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    sdkLoads.delete(sdkUrl);
    throw error;
  });
  sdkLoads.set(sdkUrl, load);
  return load;
}

function customerNames(customerName: string) {
  const parts = customerName.trim().split(/\s+/).filter(Boolean);
  return {
    givenName: parts[0] || undefined,
    familyName: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
  };
}

export function QuoteWalletButtons({
  config,
  token,
  paymentType,
  amount,
  selectedLineIds,
  customerName,
  customerEmail,
  customerPhone,
  disabled = false,
  onBusyChange,
  onPaid,
}: {
  config: QuoteWalletConfig;
  token: string;
  paymentType: QuotePaymentType;
  amount: number;
  selectedLineIds?: string[];
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onPaid?: () => void;
}) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const googleTargetId = `quote-google-pay-${reactId}`;
  const methodsRef = useRef<{ google: GooglePayMethod | null; apple: WalletMethod | null }>({
    google: null,
    apple: null,
  });
  const paymentsRef = useRef<QuoteSquarePayments | null>(null);
  const busyRef = useRef(false);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const [available, setAvailable] = useState({ google: false, apple: false });
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState<"google_pay" | "apple_pay" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const selectionKey = selectedLineIds?.join("|") || "all";
  const amountDisplay = Math.max(0, Number(amount) || 0).toFixed(2);

  useEffect(() => {
    let cancelled = false;
    const methods = methodsRef.current;
    setAvailable({ google: false, apple: false });
    setInitialized(false);
    setMessage(null);

    async function init() {
      try {
        await loadSquareSdk(config.sdkUrl);
        const square = squareGlobal();
        if (cancelled || !square) return;
        const payments = square.payments(config.applicationId, config.locationId);
        paymentsRef.current = payments;
        const paymentRequest = payments.paymentRequest({
          countryCode: "US",
          currencyCode: "USD",
          total: { amount: amountDisplay, label: `${paymentType === "deposit" ? "Deposit" : "Balance"} — 805 Shutters` },
        });

        try {
          const google = await payments.googlePay(paymentRequest);
          if (!cancelled) {
            await google.attach(`#${googleTargetId}`, { buttonColor: "black", buttonType: "long" });
            methods.google = google;
            const target = document.getElementById(googleTargetId);
            if (target) {
              target.onclick = (event) => {
                event.preventDefault();
                void startWalletPayment(google, "google_pay");
              };
            }
            setAvailable((current) => ({ ...current, google: true }));
          }
        } catch {
          // Square hides Google Pay when this browser, wallet, or account cannot use it.
        }

        try {
          const apple = await payments.applePay(paymentRequest);
          if (!cancelled) {
            methods.apple = apple;
            setAvailable((current) => ({ ...current, apple: true }));
          }
        } catch {
          // Square hides Apple Pay when this browser, wallet, domain, or account cannot use it.
        }
      } catch {
        if (!cancelled) setMessage("Express checkout is temporarily unavailable. Please use the card option.");
      } finally {
        if (!cancelled) setInitialized(true);
      }
    }

    void init();
    return () => {
      cancelled = true;
      const current = methodsRef.current;
      void current.google?.destroy?.();
      void current.apple?.destroy?.();
      current.google = null;
      current.apple = null;
      paymentsRef.current = null;
    };
    // selected line ids are represented by selectionKey so recalculated totals
    // rebuild the wallet request without depending on a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountDisplay, config.applicationId, config.locationId, config.sdkUrl, googleTargetId, paymentType, selectionKey]);

  async function startWalletPayment(method: WalletMethod, walletType: "google_pay" | "apple_pay") {
    if (busyRef.current || disabledRef.current) return;
    busyRef.current = true;

    // Apple requires tokenization to begin directly inside the click handler,
    // before any other awaited work.
    const tokenPromise = method.tokenize();
    setBusy(walletType);
    setMessage(null);
    onBusyChange?.(true);

    try {
      const tokenResult = await tokenPromise;
      if (tokenResult.status !== "OK" || !tokenResult.token) {
        throw new Error(tokenResult.errors?.[0]?.message || "The wallet did not authorize this payment.");
      }

      const names = customerNames(customerName);
      const verification = await paymentsRef.current?.verifyBuyer?.(tokenResult.token, {
        amount: amountDisplay,
        currencyCode: "USD",
        intent: "CHARGE",
        billingContact: {
          ...names,
          email: customerEmail || undefined,
          phone: customerPhone || undefined,
          countryCode: "US",
        },
      });
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch(`/api/quote/${encodeURIComponent(token)}/wallet-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: tokenResult.token,
          verificationToken: verification?.token,
          walletType,
          paymentType,
          idempotencyKey,
          ...(selectedLineIds?.length ? { selectedLineIds } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        receiptUrl?: string | null;
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Square could not complete this payment.");
      }
      setReceiptUrl(data.receiptUrl || null);
      setPaid(true);
      setMessage(null);
      onPaid?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Square could not complete this payment.");
    } finally {
      busyRef.current = false;
      setBusy(null);
      onBusyChange?.(false);
    }
  }

  if (paid) {
    return (
      <div className={styles.walletSuccess} role="status">
        <strong>Payment received.</strong>
        {receiptUrl ? <>{" "}<a href={receiptUrl} target="_blank" rel="noreferrer">View Square receipt</a></> : null}
      </div>
    );
  }

  return (
    <div
      className={styles.walletSection}
      aria-label="Express wallet payment options"
      data-hidden={initialized && !available.apple && !available.google && !message ? "true" : undefined}
    >
      {available.apple || available.google ? <span className={styles.walletHeading}>Express checkout</span> : null}
      <div
        className={styles.walletButtons}
        data-busy={busy ? "true" : undefined}
        data-disabled={disabled ? "true" : undefined}
      >
        <button
          type="button"
          className={styles.applePayButton}
          aria-label={`Pay ${paymentType} with Apple Pay`}
          hidden={!available.apple}
          disabled={disabled || busy !== null}
          onClick={() => {
            const apple = methodsRef.current.apple;
            if (apple) void startWalletPayment(apple, "apple_pay");
          }}
        >
          Apple Pay
        </button>
        <div
          id={googleTargetId}
          className={styles.googlePayButton}
          aria-label={`Pay ${paymentType} with Google Pay`}
          hidden={!available.google}
        />
      </div>
      {busy ? <p className={styles.walletStatus} role="status">Completing secure {busy === "apple_pay" ? "Apple Pay" : "Google Pay"} payment…</p> : null}
      {message ? <p className={styles.paymentError} role="alert">{message}</p> : null}
    </div>
  );
}
