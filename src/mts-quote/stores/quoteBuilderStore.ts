import { create } from "zustand";
import { ACCOUNT_IDS } from "@mts/lib/accounts";
import type {
  SalesQuoteLineItem as _SalesQuoteLineItem,
  SalesQuoteDesign as _SalesQuoteDesign,
} from "@mts/types/quote";

export type MeasurementStep =
  | "idle"
  | "width_whole"
  | "width_fraction"
  | "height_whole"
  | "height_fraction";

interface QuoteBuilderStore {
  // Active quote
  activeQuoteId: string | null;
  activeAccountId: string;
  activeTab: string;

  // Room Builder state
  selectedProductType: string | null;
  selectedRoom: string | null;
  measurementStep: MeasurementStep;
  pendingWidth: { whole: number; fraction: string } | null;
  pendingHeight: { whole: number; fraction: string } | null;
  showMeasurementGrid: boolean;

  // Design state
  activeVariant: string;
  copyMode: "none" | "all" | "some";
  copySourceItemId: string | null;
  selectedCopyTargets: string[];

  // Actions
  setActiveQuote: (id: string | null) => void;
  setAccountId: (id: string) => void;
  setActiveTab: (tab: string) => void;

  // Room builder actions
  selectProduct: (type: string | null) => void;
  selectRoom: (name: string) => void;
  openMeasurementGrid: () => void;
  closeMeasurementGrid: () => void;
  setWidthWhole: (n: number) => void;
  setWidthFraction: (f: string) => void;
  setHeightWhole: (n: number) => void;
  setHeightFraction: (f: string) => void;
  resetMeasurement: () => void;

  // Design actions
  setActiveVariant: (v: string) => void;
  setCopyMode: (mode: "none" | "all" | "some") => void;
  setCopySource: (id: string | null) => void;
  toggleCopyTarget: (id: string) => void;
  clearCopyTargets: () => void;

  // Reset
  resetBuilder: () => void;
}

const initialState = {
  activeQuoteId: null,
  activeAccountId: ACCOUNT_IDS.SHUTTERS_805,
  activeTab: "dashboard",
  selectedProductType: null,
  selectedRoom: null,
  measurementStep: "idle" as MeasurementStep,
  pendingWidth: null,
  pendingHeight: null,
  showMeasurementGrid: false,
  activeVariant: "A",
  copyMode: "none" as const,
  copySourceItemId: null,
  selectedCopyTargets: [],
};

export const useQuoteBuilderStore = create<QuoteBuilderStore>((set, _get) => ({
  ...initialState,

  setActiveQuote: (id) => set({ activeQuoteId: id }),
  setAccountId: (id) => set({ activeAccountId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  selectProduct: (type) => set({ selectedProductType: type }),
  selectRoom: (name) => {
    set({
      selectedRoom: name,
      showMeasurementGrid: true,
      measurementStep: "width_whole",
      pendingWidth: null,
      pendingHeight: null,
    });
  },

  openMeasurementGrid: () => set({ showMeasurementGrid: true }),
  closeMeasurementGrid: () =>
    set({
      showMeasurementGrid: false,
      measurementStep: "idle",
      pendingWidth: null,
      pendingHeight: null,
    }),

  setWidthWhole: (n) =>
    set({
      pendingWidth: { whole: n, fraction: "0" },
      measurementStep: "width_fraction",
    }),

  setWidthFraction: (f) =>
    set((state) => ({
      pendingWidth: state.pendingWidth
        ? { ...state.pendingWidth, fraction: f }
        : { whole: 0, fraction: f },
      measurementStep: "height_whole",
    })),

  setHeightWhole: (n) =>
    set({
      pendingHeight: { whole: n, fraction: "0" },
      measurementStep: "height_fraction",
    }),

  setHeightFraction: (f) =>
    set((state) => ({
      pendingHeight: state.pendingHeight
        ? { ...state.pendingHeight, fraction: f }
        : { whole: 0, fraction: f },
      measurementStep: "idle",
      showMeasurementGrid: false,
    })),

  resetMeasurement: () =>
    set({
      measurementStep: "idle",
      pendingWidth: null,
      pendingHeight: null,
      showMeasurementGrid: false,
    }),

  setActiveVariant: (v) => set({ activeVariant: v }),
  setCopyMode: (mode) => set({ copyMode: mode, selectedCopyTargets: [] }),
  setCopySource: (id) => set({ copySourceItemId: id }),
  toggleCopyTarget: (id) =>
    set((state) => ({
      selectedCopyTargets: state.selectedCopyTargets.includes(id)
        ? state.selectedCopyTargets.filter((t) => t !== id)
        : [...state.selectedCopyTargets, id],
    })),
  clearCopyTargets: () =>
    set({ selectedCopyTargets: [], copyMode: "none", copySourceItemId: null }),

  resetBuilder: () => set(initialState),
}));
