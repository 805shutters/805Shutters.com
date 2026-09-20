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

export const NORMAN_SHUTTER_HINGES = ["Silk White", "Stainless Steel", "Pearl", "Bisque", "Antique Brass", "Bright Brass", "Black", "Pure White", "Nickel-Plated", "Brushed Nickel", "Crisp Linen", "String", "Sea Mist", "Stone Gray", "Brown Gray", "Taupe Gray"];
const DIRECT_MOUNT_UNAVAILABLE_HINGES = ["Crisp Linen", "String", "Sea Mist", "Stone Gray", "Brown Gray", "Taupe Gray"];
export function normanShutterHinges(programId: string | null | undefined, frame: unknown) {
  if (normanShutterProgram(programId)?.id === "woodlore_aquashield") return ["Stainless Steel"];
  return /direct mount|no frame/i.test(String(frame ?? "")) ? NORMAN_SHUTTER_HINGES.filter(h => !DIRECT_MOUNT_UNAVAILABLE_HINGES.includes(h)) : [...NORMAN_SHUTTER_HINGES];
}
export function normanShutterTilts(programId: string | null | undefined) {
  return normanShutterProgram(programId)?.id === "woodlore_aquashield" ? ["Invisible Tilt"] : ["Standard Tilt", "Invisible Tilt", "Offset Tilt"];
}

/** Regular frame menu membership; mounting geometry and surcharges are separate rules.
 * Binder section e and the pinned September 19 dealer menus agree on these choices.
 * Codes can differ across programs even when customer-facing labels are identical.
 */
export const NORMAN_SHUTTER_FRAME_SOURCE = "norman-shutter-frame-menus-2026-09-19";
const shutterFrames: Record<NormanShutterProgramId, readonly (readonly [string, string])[]> = {
  "woodlore": [
    [
      "FD05",
      "3\" Ridge Deco Frame"
    ],
    [
      "FD15",
      "2 1/2\" Mission Deco Frame"
    ],
    [
      "FD08",
      "2\" Camber Deco Frame"
    ],
    [
      "FD04",
      "2\" Classic Deco Frame"
    ],
    [
      "FL01",
      "Beaded L Frame"
    ],
    [
      "FL41",
      "Beaded L Frame with 1/4\" Light Block"
    ],
    [
      "FL31",
      "Beaded L Frame with 1/2\" Buildout *"
    ],
    [
      "FL32",
      "Beaded L Frame with 1\" Buildout *"
    ],
    [
      "FL62",
      "Colonial L Frame"
    ],
    [
      "FL63",
      "Colonial L Frame with 1/4\" Light Block"
    ],
    [
      "FL64",
      "Colonial L Frame with 1/2\" Buildout *"
    ],
    [
      "FL04",
      "Vintage L Frame"
    ],
    [
      "FL49",
      "Vintage L Frame with 1/4\" Light Block"
    ],
    [
      "FL37",
      "Vintage L Frame with 1/2\" Buildout *"
    ],
    [
      "FL38",
      "Vintage L Frame with 1\" Buildout *"
    ],
    [
      "FL65",
      "Plain L Frame"
    ],
    [
      "FZ01",
      "3\" Crown Z Frame"
    ],
    [
      "FZ18",
      "2\" Bel Air Z Frame"
    ],
    [
      "FZ23",
      "2\" Bullnose Z Frame"
    ],
    [
      "FZ03",
      "1 1/2\" Bullnose Z Frame"
    ],
    [
      "FZ19",
      "1 1/4\" Beaded Z Frame"
    ],
    [
      "FZ04",
      "Tilt Out Z Frame"
    ],
    [
      "FH04",
      "7/8\" Vintage Hang Strip"
    ],
    [
      "FN01",
      "Direct Mount (No Frame)"
    ]
  ],
  "woodlore_plus": [
    [
      "FD05",
      "3\" Ridge Deco Frame"
    ],
    [
      "FD15",
      "2 1/2\" Mission Deco Frame"
    ],
    [
      "FD08",
      "2\" Camber Deco Frame"
    ],
    [
      "FD04",
      "2\" Classic Deco Frame"
    ],
    [
      "FL01",
      "Beaded L Frame"
    ],
    [
      "FL41",
      "Beaded L Frame with 1/4\" Light Block"
    ],
    [
      "FL31",
      "Beaded L Frame with 1/2\" Buildout *"
    ],
    [
      "FL32",
      "Beaded L Frame with 1\" Buildout *"
    ],
    [
      "FL62",
      "Colonial L Frame"
    ],
    [
      "FL63",
      "Colonial L Frame with 1/4\" Light Block"
    ],
    [
      "FL64",
      "Colonial L Frame with 1/2\" Buildout *"
    ],
    [
      "FL04",
      "Vintage L Frame"
    ],
    [
      "FL49",
      "Vintage L Frame with 1/4\" Light Block"
    ],
    [
      "FL37",
      "Vintage L Frame with 1/2\" Buildout *"
    ],
    [
      "FL38",
      "Vintage L Frame with 1\" Buildout *"
    ],
    [
      "FL65",
      "Plain L Frame"
    ],
    [
      "FZ01",
      "3\" Crown Z Frame"
    ],
    [
      "FZ18",
      "2\" Bel Air Z Frame"
    ],
    [
      "FZ23",
      "2\" Bullnose Z Frame"
    ],
    [
      "FZ03",
      "1 1/2\" Bullnose Z Frame"
    ],
    [
      "FZ19",
      "1 1/4\" Beaded Z Frame"
    ],
    [
      "FZ04",
      "Tilt Out Z Frame"
    ],
    [
      "FH04",
      "7/8\" Vintage Hang Strip"
    ],
    [
      "FN01",
      "Direct Mount (No Frame)"
    ]
  ],
  "woodlore_aquashield": [
    [
      "FD08",
      "2\" Camber Deco Frame"
    ],
    [
      "FL30",
      "Beaded L Frame"
    ],
    [
      "FL29",
      "Beaded L Frame with 1/2\" Buildout *"
    ],
    [
      "FL04",
      "Vintage L Frame"
    ],
    [
      "FL37",
      "Vintage L Frame with 1/2\" Buildout *"
    ],
    [
      "FL61",
      "Deep Plain L frame *"
    ],
    [
      "FL65",
      "Plain L Frame"
    ],
    [
      "FZ09",
      "3\" Crown Z Frame"
    ],
    [
      "FZ23",
      "2\" Bullnose Z Frame"
    ],
    [
      "FZ18",
      "2\" Bel Air Z Frame"
    ],
    [
      "FZ17",
      "1 1/2\" Bullnose Z Frame"
    ],
    [
      "FZ29",
      "1 1/2\" Deep Bullnose Z frame *"
    ],
    [
      "FH06",
      "7/8\" Traditional Hang Strip"
    ],
    [
      "FN01",
      "Direct Mount (No Frame)"
    ]
  ],
  "brightwood": [
    [
      "FD01",
      "3\" Ridge Deco Frame"
    ],
    [
      "FD15",
      "2 1/2\" Mission Deco Frame"
    ],
    [
      "FD08",
      "2\" Camber Deco Frame"
    ],
    [
      "FD04",
      "2\" Classic Deco Frame"
    ],
    [
      "FL30",
      "Beaded L Frame"
    ],
    [
      "FL41",
      "Beaded L Frame with 1/4\" Light Block"
    ],
    [
      "FL29",
      "Beaded L Frame with 1/2\" Buildout *"
    ],
    [
      "FL32",
      "Beaded L Frame with 1\" Buildout *"
    ],
    [
      "FL04",
      "Vintage L Frame"
    ],
    [
      "FL49",
      "Vintage L Frame with 1/4\" Light Block"
    ],
    [
      "FL37",
      "Vintage L Frame with 1/2\" Buildout *"
    ],
    [
      "FL38",
      "Vintage L Frame with 1\" Buildout *"
    ],
    [
      "FL65",
      "Plain L Frame"
    ],
    [
      "FZ01",
      "3\" Crown Z Frame"
    ],
    [
      "FZ18",
      "2\" Bel Air Z Frame"
    ],
    [
      "FZ23",
      "2\" Bullnose Z Frame"
    ],
    [
      "FZ17",
      "1 1/2\" Bullnose Z Frame"
    ],
    [
      "FZ19",
      "1 1/4\" Beaded Z Frame"
    ],
    [
      "FZ04",
      "Tilt Out Z Frame"
    ],
    [
      "FH04",
      "7/8\" Vintage Hang Strip"
    ],
    [
      "FN01",
      "Direct Mount (No Frame)"
    ]
  ],
  "normandy_painted": [
    [
      "FD01",
      "3\" Ridge Deco Frame"
    ],
    [
      "FD15",
      "2 1/2\" Mission Deco Frame"
    ],
    [
      "FD08",
      "2\" Camber Deco Frame"
    ],
    [
      "FD04",
      "2\" Classic Deco"
    ],
    [
      "FL01",
      "Beaded L Frame"
    ],
    [
      "FL41",
      "Beaded L Frame with 1/4\" Light Block"
    ],
    [
      "FL31",
      "Beaded L Frame with 1/2\" Buildout *"
    ],
    [
      "FL32",
      "Beaded L Frame with 1\" Buildout *"
    ],
    [
      "FL62",
      "Colonial L Frame"
    ],
    [
      "FL63",
      "Colonial L Frame with 1/4\" Light Block"
    ],
    [
      "FL64",
      "Colonial L Frame with 1/2\" Buildout *"
    ],
    [
      "FL09",
      "Vintage L Frame"
    ],
    [
      "FL49",
      "Vintage L Frame with 1/4\" Light Block"
    ],
    [
      "FL37",
      "Vintage L Frame with 1/2\" Buildout *"
    ],
    [
      "FL38",
      "Vintage L Frame with 1\" Buildout *"
    ],
    [
      "FL65",
      "Plain L Frame"
    ],
    [
      "FZ01",
      "3\" Crown Z Frame"
    ],
    [
      "FZ18",
      "2\" Bel Air Z Frame"
    ],
    [
      "FZ23",
      "2\" Bullnose Z Frame"
    ],
    [
      "FZ03",
      "1 1/2\" Bullnose Z Frame"
    ],
    [
      "FZ19",
      "1 1/4\" Beaded Z Frame"
    ],
    [
      "FZ04",
      "Tilt out Z"
    ],
    [
      "FH04",
      "7/8\" Vintage Hang Strip"
    ],
    [
      "FN01",
      "Direct Mount (No Frame)"
    ]
  ],
  "normandy_stained": [
    [
      "FD01",
      "3\" Ridge Deco Frame"
    ],
    [
      "FD15",
      "2 1/2\" Mission Deco Frame"
    ],
    [
      "FD08",
      "2\" Camber Deco Frame"
    ],
    [
      "FD04",
      "2\" Classic Deco"
    ],
    [
      "FL01",
      "Beaded L Frame"
    ],
    [
      "FL41",
      "Beaded L Frame with 1/4\" Light Block"
    ],
    [
      "FL31",
      "Beaded L Frame with 1/2\" Buildout *"
    ],
    [
      "FL32",
      "Beaded L Frame with 1\" Buildout *"
    ],
    [
      "FL62",
      "Colonial L Frame"
    ],
    [
      "FL63",
      "Colonial L Frame with 1/4\" Light Block"
    ],
    [
      "FL64",
      "Colonial L Frame with 1/2\" Buildout *"
    ],
    [
      "FL09",
      "Vintage L Frame"
    ],
    [
      "FL49",
      "Vintage L Frame with 1/4\" Light Block"
    ],
    [
      "FL37",
      "Vintage L Frame with 1/2\" Buildout *"
    ],
    [
      "FL38",
      "Vintage L Frame with 1\" Buildout *"
    ],
    [
      "FL65",
      "Plain L Frame"
    ],
    [
      "FZ01",
      "3\" Crown Z Frame"
    ],
    [
      "FZ18",
      "2\" Bel Air Z Frame"
    ],
    [
      "FZ23",
      "2\" Bullnose Z Frame"
    ],
    [
      "FZ03",
      "1 1/2\" Bullnose Z Frame"
    ],
    [
      "FZ19",
      "1 1/4\" Beaded Z Frame"
    ],
    [
      "FZ04",
      "Tilt out Z"
    ],
    [
      "FH04",
      "7/8\" Vintage Hang Strip"
    ],
    [
      "FN01",
      "Direct Mount (No Frame)"
    ]
  ]
};
export function normanShutterFrames(programId: string | null | undefined) {
  const program = normanShutterProgram(programId);
  return program ? shutterFrames[program.id].map(([code, portalLabel]) => ({
    code, portalLabel,
    label: portalLabel === '2" Classic Deco' ? '2" Classic Deco Frame' : portalLabel === 'Tilt out Z' ? 'Tilt Out Z Frame' : portalLabel.replace(" Z frame", " Z Frame").replace(" L frame", " L Frame"),
  })) : [];
}
export function normanShutterFrame(programId: string | null | undefined, value: unknown) {
  return normanShutterFrames(programId).find(f => [f.label, f.portalLabel, f.code].some(v => normalize(v) === normalize(value)));
}
