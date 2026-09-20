/** Manufacturer identities from the complete 2026 shutter binders, section b.
 * These are assortment authorities, not approval of the provisional dealer rates.
 */
export const NORMAN_SHUTTER_PROGRAMS = [
  { id: "woodlore", name: "Woodlore", material: "Composite", sourceId: "norman-woodlore-binder-2026-09", pages: [7] },
  { id: "woodlore_plus", name: "Woodlore Plus", material: "Composite", sourceId: "norman-woodlore-plus-binder-2026-09", pages: [9] },
  { id: "woodlore_aquashield", name: "Woodlore Aquashield", material: "Composite", sourceId: "norman-woodlore-plus-binder-2026-09", pages: [9] },
  { id: "brightwood", name: "Brightwood", material: "Wood", sourceId: "norman-brightwood-binder-2026-09", pages: [7] },
  { id: "normandy_painted", name: "Normandy Painted", material: "Wood", sourceId: "norman-normandy-binder-2026-09", pages: [7] },
  { id: "normandy_stained", name: "Normandy Stained", material: "Wood", sourceId: "norman-normandy-binder-2026-09", pages: [7, 8] },
] as const;
export type NormanShutterProgramId = typeof NORMAN_SHUTTER_PROGRAMS[number]["id"];
export const NORMAN_SHUTTER_LOUVERS = ['1 7/8"', '2 1/2"', '3"', '3 1/2"', '4 1/2"'] as const;
const paint = [
  ["001", "Pure White"], ["002", "Extra White"], ["003", "Silk White"], ["004", "Bright White"],
  ["006", "Pearl"], ["007", "Ivory Lace"], ["009", "Creamy"], ["012", "Crisp Linen"],
  ["013", "Bisque"], ["017", "Gray Black"], ["019", "String"], ["032", "Sea Mist"],
  ["046", "Ice"], ["053", "Clay"], ["063", "Decorator’s White"], ["066", "Winchester White 2010"],
  ["076", "Aura White"], ["080", "Taupe Gray"], ["836", "Classic Black"], ["090", "TS White"],
  ["600", "True White"], ["601", "Chiffon"], ["603", "Natural Linen"], ["609", "Chateau Brown"],
] as const;
const stain = [
  ["108", "Rustic Gray"], ["110", "Limed White"], ["200", "Natural"], ["202", "Golden Oak"],
  ["205", "Goldenrod"], ["221", "Black Walnut"], ["227", "Red Oak"], ["229", "Rich Walnut"],
  ["230", "Old Teak"], ["237", "Wenge"], ["242", "Auburn"], ["246", "Matte Black"],
  ["248", "Pretzel"], ["250", "Sumatra"], ["252", "Toffee"], ["254", "Driftwood"],
  ["255", "Silver Gray"], ["862", "French Oak"],
] as const;
const premium = [["1003", "White Matte"], ["1109", "Silk Gray"], ["1111", "Granite Gray"], ["1203", "Black"], ["1204", "Ebony"], ["1502", "Teak"]] as const;
const normalize = (v: unknown) => String(v ?? "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]/g, "");
export function normanShutterProgram(value: unknown) {
  return NORMAN_SHUTTER_PROGRAMS.find(p => normalize(p.id) === normalize(value) || normalize(p.name) === normalize(value));
}
export function normanShutterColors(programId: string | null | undefined) {
  const program = normanShutterProgram(programId);
  if (!program) return [];
  const rows = program.id === "woodlore" ? paint.filter(([code]) => ["001", "002", "003", "006", "032", "063"].includes(code))
    : program.id === "normandy_stained" ? [...stain, ...premium] : paint;
  return rows.map(([code, name]) => ({ code, name, label: `${code} - ${name}`, premium: premium.some(([p]) => p === code), programId: program.id, sourceId: program.sourceId, pages: program.pages }));
}
export function normanShutterColor(programId: string | null | undefined, value: unknown) {
  return normanShutterColors(programId).find(c => [c.code, c.name, c.label].some(v => normalize(v) === normalize(value)));
}
export function normanShutterLouvers(programId: string | null | undefined) {
  return normanShutterProgram(programId)?.id === "woodlore_aquashield" ? NORMAN_SHUTTER_LOUVERS.slice(1) : [...NORMAN_SHUTTER_LOUVERS];
}
