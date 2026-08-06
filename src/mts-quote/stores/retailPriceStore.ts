import { create } from "zustand";
import { persist } from "zustand/middleware";
import { NORMAN_SHUTTER_PROGRAMS, ONYX_SHUTTER_PROGRAMS } from "@mts/lib/pricingData";

// Key format: "supplier:programName" e.g. "Onyx:Painted Basswood"
type RetailPriceKey = string;

const ONYX_POLY_COMPOSITE_KEY = "Onyx:Poly Composite";
const STALE_ONYX_POLY_COMPOSITE_CENTS = 2900;

function makeKey(supplier: string, program: string): RetailPriceKey {
  return `${supplier}:${program}`;
}

/**
 * The V4 builder can retain a stale $29/sqft value under the independent Onyx
 * Poly Composite key. Drop only that known-bad value so the
 * source-backed $31/sqft program default is used; preserve every other staff
 * override.
 */
export function sanitizeRetailPriceOverrides(
  overrides: Record<RetailPriceKey, number> | null | undefined,
): Record<RetailPriceKey, number> {
  const next = { ...(overrides ?? {}) };
  if (next[ONYX_POLY_COMPOSITE_KEY] === STALE_ONYX_POLY_COMPOSITE_CENTS) {
    delete next[ONYX_POLY_COMPOSITE_KEY];
  }
  return next;
}

export function resolveRetailPrice(
  supplier: string,
  program: string,
  overrides: Record<RetailPriceKey, number> | null | undefined,
): number | null {
  const key = makeKey(supplier, program);
  const sanitized = sanitizeRetailPriceOverrides(overrides);
  const overrideCents = sanitized[key];
  return overrideCents === undefined
    ? getDefaultRetailPrice(supplier, program)
    : Math.round(overrideCents) / 100;
}

interface RetailPriceStore {
  // Overrides stored as cents (integers) to avoid floating point issues
  // Key: "supplier:programName", Value: price in cents
  overrides: Record<RetailPriceKey, number>;

  // Get retail price for a program — returns override if set, otherwise default
  // Returns price in dollars (converted from cents)
  getRetailPrice: (supplier: string, program: string) => number | null;

  // Set a retail price override (accepts dollars, stores as cents)
  setRetailPrice: (supplier: string, program: string, priceDollars: number) => void;

  // Reset a specific override back to default
  resetRetailPrice: (supplier: string, program: string) => void;

  // Reset all overrides
  resetAll: () => void;
}

// Build default price lookup from hardcoded constants
function getDefaultRetailPrice(supplier: string, program: string): number | null {
  const programs = supplier === "Norman" ? NORMAN_SHUTTER_PROGRAMS : ONYX_SHUTTER_PROGRAMS;
  const found = programs.find((p) => p.name === program);
  return found ? found.retailPrice : null;
}

export const useRetailPriceStore = create<RetailPriceStore>()(
  persist(
    (set, get) => ({
      overrides: {},

      getRetailPrice: (supplier, program) =>
        resolveRetailPrice(supplier, program, get().overrides),

      setRetailPrice: (supplier, program, priceDollars) => {
        const key = makeKey(supplier, program);
        // Store as cents (integer) to avoid floating point drift
        const priceCents = Math.round(priceDollars * 100);
        set((state) => ({
          overrides: { ...state.overrides, [key]: priceCents },
        }));
      },

      resetRetailPrice: (supplier, program) => {
        const key = makeKey(supplier, program);
        set((state) => {
          const { [key]: _, ...rest } = state.overrides;
          return { overrides: rest };
        });
      },

      resetAll: () => set({ overrides: {} }),
    }),
    {
      name: "retail-price-overrides",
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<RetailPriceStore>;
        return {
          ...currentState,
          ...persisted,
          overrides: sanitizeRetailPriceOverrides(persisted.overrides),
        };
      },
    }
  )
);

export { makeKey, getDefaultRetailPrice };
