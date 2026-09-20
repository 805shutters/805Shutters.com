"use client";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { lotusVerticalColors, lotusVerticalProfile } from "@/lib/quote/lotus-vertical";
export function LotusVerticalOptions({ design, programId, width, height, onUpdateFields }: { design: Partial<SalesQuoteDesign> | undefined; programId: string; width?: number; height?: number; onUpdateFields: (patch: Partial<SalesQuoteDesign>) => void }) {
  const profile = lotusVerticalProfile(programId);
  if (!profile) return null;
  const options = (design?.options_json ?? {}) as Record<string, unknown>;
  const update = (patch: Record<string, unknown>) => onUpdateFields({ options_json: { ...options, ...patch } });
  const colors = lotusVerticalColors(programId, width, height);
  return <div className="space-y-3">
    <p>{profile.kind}{profile.rail ? ` · ${profile.rail} headrail · ${profile.draw} · White headrail` : " · 3½-inch smooth PVC vanes"}</p>
    <label className="block text-sm">Color<select aria-label="Lotus vertical color" className="w-full rounded border p-2" value={String(options.color ?? "")} onChange={e => update({ color: e.target.value || null })}><option value="">Select source color</option>{colors.map(color => <option key={color}>{color}</option>)}</select></label>
    {!colors.length && <p>No exact ordering color is published for these dimensions.</p>}
    {profile.draw === "One-way" && <label className="block text-sm">Stack<select aria-label="Lotus vertical stack" className="w-full rounded border p-2" value={String(options.lotus_vertical_stack ?? "")} onChange={e => update({ lotus_vertical_stack: e.target.value })}><option value="">Select stack</option><option>Left</option><option>Right</option></select></label>}
    {profile.draw === "Center draw" && <p>Center draw; stack at both ends.</p>}
    {profile.rail && <label className="block text-sm">Wand length (inches)<select aria-label="Lotus vertical wand length" className="w-full rounded border p-2" value={String(options.lotus_vertical_wand_inches ?? "")} onChange={e => update({ lotus_vertical_wand_inches: Number(e.target.value), lotus_vertical_wand_color: null })}><option value="">Select wand length</option>{(profile.rail === "Steel" ? [30, 48, 60, 72] : [30]).map(length => <option key={length} value={length}>{length}{length === 30 ? " — standard" : " — accessory price confirmation required"}</option>)}</select></label>}
    {profile.rail === "Steel" && Number(options.lotus_vertical_wand_inches) > 30 && <label className="block text-sm">Accessory wand color<select aria-label="Lotus vertical wand color" className="w-full rounded border p-2" value={String(options.lotus_vertical_wand_color ?? "")} onChange={e => update({ lotus_vertical_wand_color: e.target.value })}><option value="">Select wand color</option><option>White</option><option>Alabaster</option></select></label>}
    <p>{profile.valance === null ? "Valance inclusion for this custom center-draw package requires confirmation." : profile.valance === "None" ? "No valance included in this component selection." : "Matching valance is included in the documented complete package."}</p>
    <p>Enter exact finished dimensions. Lotus applies no inside-mount deduction to vertical blinds or their components. {profile.kind === "Headrail only" ? "Vanes are sold separately; this is a width-only grid." : profile.kind === "Vanes only" ? "This is a length-only grid. Per-vane versus carton quantity and compatible headrail require confirmation." : "Custom cut feasibility and package components require confirmation."} Current pricing remains on hold.</p>
  </div>;
}
