import { describe, expect, it, vi } from "vitest";
import {
  INSTALLER_CUSTOMER_BALANCE_META_KEY,
  calculateInstallerCustomerBalance,
  refreshInstallerCustomerBalance,
} from "./installer-balance";

const SIGNED_AT = "2026-07-30T12:00:00.000Z";
const CALCULATED_AT = "2026-07-30T13:00:00.000Z";

describe("installer customer balance", () => {
  it("shows zero balance when recorded payments equal the current contract total", () => {
    expect(calculateInstallerCustomerBalance({
      contractId: "contract-1",
      contractTotal: 4_000,
      contractSignedAt: SIGNED_AT,
      payments: [{ amount: 1_000 }, { amount: 3_000 }],
      calculatedAt: CALCULATED_AT,
    })).toMatchObject({
      contract_total: 4_000,
      recorded_payments_total: 4_000,
      payment_record_count: 2,
      remaining_customer_balance: 0,
    });
  });

  it("shows the unpaid remainder after a partial payment", () => {
    expect(calculateInstallerCustomerBalance({
      contractId: "contract-1",
      contractTotal: "4000.00",
      contractSignedAt: SIGNED_AT,
      payments: [{ amount: "1250.25" }],
      calculatedAt: CALCULATED_AT,
    })).toMatchObject({
      contract_total: 4_000,
      recorded_payments_total: 1_250.25,
      payment_record_count: 1,
      remaining_customer_balance: 2_749.75,
    });
  });

  it("shows the full contract total when the verified ledger has no payments", () => {
    expect(calculateInstallerCustomerBalance({
      contractId: "contract-1",
      contractTotal: 4_000,
      contractSignedAt: SIGNED_AT,
      payments: [],
      calculatedAt: CALCULATED_AT,
    })).toMatchObject({
      recorded_payments_total: 0,
      payment_record_count: 0,
      remaining_customer_balance: 4_000,
    });
  });

  it("uses the current ledger and replaces a stale stored balance before delivery", async () => {
    const updates: Record<string, unknown>[] = [];
    const form = {
      id: "form-1",
      quote_id: "quote-1",
      meta: {
        [INSTALLER_CUSTOMER_BALANCE_META_KEY]: {
          remaining_customer_balance: 999.99,
          calculated_at: "2026-07-01T00:00:00.000Z",
        },
      },
    };
    const table = (name: string) => {
      if (name === "crm_customer_contracts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              not: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: { id: "contract-1", total_amount: 4_000, signed_at: SIGNED_AT },
                      error: null,
                    })),
                  })),
                })),
              })),
            })),
          })),
        };
      }
      if (name === "crm_quote_bookkeeping_payments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [{ amount: 1_250 }], error: null })),
          })),
        };
      }
      if (name === "crm_quote_bookkeeping_credits") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
        };
      }
      return {
        update: vi.fn((patch: Record<string, unknown>) => ({
          eq: vi.fn(async () => {
            updates.push(patch);
            return { error: null };
          }),
        })),
      };
    };
    const refreshed = await refreshInstallerCustomerBalance(
      { from: vi.fn(table) } as never,
      form,
    );
    expect(refreshed.meta?.[INSTALLER_CUSTOMER_BALANCE_META_KEY]).toMatchObject({
      contract_total: 4_000,
      recorded_payments_total: 1_250,
      remaining_customer_balance: 2_750,
    });
    expect(updates).toHaveLength(1);
  });

  it("fails closed when the signed contract or payment ledger is missing or unreadable", async () => {
    expect(() => calculateInstallerCustomerBalance({
      contractId: "contract-1",
      contractTotal: null,
      contractSignedAt: SIGNED_AT,
      payments: [],
      calculatedAt: CALCULATED_AT,
    })).toThrow("contract total is missing");
    expect(() => calculateInstallerCustomerBalance({
      contractId: "contract-1",
      contractTotal: 4_000,
      contractSignedAt: SIGNED_AT,
      payments: [{ amount: null }],
      calculatedAt: CALCULATED_AT,
    })).toThrow("Customer payment row 1 is missing");

    const table = (name: string) => {
      if (name === "crm_customer_contracts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              not: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: null,
                      error: { message: "ledger unavailable" },
                    })),
                  })),
                })),
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: [], error: null })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      };
    };
    await expect(refreshInstallerCustomerBalance(
      { from: vi.fn(table) } as never,
      { id: "form-1", quote_id: "quote-1", meta: {} },
    )).rejects.toThrow("current installer customer balance could not be verified");
  });
});
