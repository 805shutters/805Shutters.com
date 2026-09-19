import type { SalesQuoteDesign } from "@mts/types/quote";

type DesignPatch = Partial<SalesQuoteDesign> & { line_item_id: string; variant: string };
type Options = Record<string, unknown>;
export type QuoteDesignEdit = {
  design: DesignPatch;
  optionChanges?: { set: Options; remove: string[] };
};

/** Capture user intent against the row rendered when the control was used. */
export function captureQuoteDesignEdit(design: DesignPatch, rendered?: Partial<SalesQuoteDesign>): QuoteDesignEdit {
  if (design.options_json === undefined) return { design };
  const before = (rendered?.options_json ?? {}) as Options;
  const after = (design.options_json ?? {}) as Options;
  return {
    design,
    optionChanges: {
      set: Object.fromEntries(Object.entries(after).filter(([key, value]) =>
        !Object.prototype.hasOwnProperty.call(before, key) || JSON.stringify(before[key]) !== JSON.stringify(value))),
      remove: Object.keys(before).filter(key => !Object.prototype.hasOwnProperty.call(after, key)),
    },
  };
}

/** Rebase a queued edit onto the latest row, retaining other controls' edits. */
export function applyQuoteDesignEdit(edit: QuoteDesignEdit, latest?: Partial<SalesQuoteDesign>): DesignPatch {
  if (!edit.optionChanges) return edit.design;
  const options = { ...((latest?.options_json ?? {}) as Options), ...edit.optionChanges.set };
  for (const key of edit.optionChanges.remove) delete options[key];
  return { ...edit.design, options_json: options as SalesQuoteDesign["options_json"] };
}
