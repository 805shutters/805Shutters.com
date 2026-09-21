/** Customer documents describe the purchase, not the factory/install worksheet.
 * This projection never clears the saved configuration or participates in pricing.
 * Dimensions of sold components, visible finishes and purchased accessories remain.
 */
export function isInternalQuoteDetail(label: string): boolean {
  const key = label.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return INTERNAL_LABELS.has(key) || INTERNAL_PATTERNS.some(pattern => pattern.test(key));
}

const INTERNAL_LABELS = new Set([
  "measurements", "measurement basis", "shelf measurements", "size type", "order type",
  "onyx order type", "fabric group", "rear fabric class", "tube", "tube diameter",
  "shared power panel", "shared automate hub", "position in pair", "power cable exit",
  "bracket support", "bracket installation", "mounting method", "installation method",
  "vertical mounting", "ceiling attachment", "installed on door", "door application",
  "chain positions", "motor positions", "screw mounting area height inches",
  "available shade mounting space height inches", "full fold required",
  "side by side match", "side by side position", "side by side wand orientation",
  "hard surface install", "hard surface installation", "requires ladder over 15ft",
  "ladder over 15 feet", "requires takedown", "existing treatment takedown",
  "valance joinery layout", "valance piece lengths in inches", "valance inner length in inches",
  "return length in inches", "valance return length in inches", "custom valance return",
  "valance return size", "custom return length", "custom return length or extension",
  "light guard channel lengths", "window slope in degrees", "hidden tilt notch",
  "inside mount arrangement", "clear opening height for charging inches",
  "sill or other charging obstruction", "window slope degrees",
]);

const INTERNAL_PATTERNS = [
  /^(?:catalog|quote lab|quote v2|priced|authoritative|pricing|source|audit|donor|observed)\b/,
  /\b(?:configuration version|program code|source page|fingerprint|grid|provenance)\b/,
  /\b(?:id|uuid|v\d+)$/,
  /\b(?:recess|clearance|mount fit|mount depth|mounting depth|available depth|pocket depth|pocket height|flat mounting area|opening diagonal|tension device|unobstructed|confirmed|confirmation)\b/,
  /\b(?:shim layers|supported shade weight|supported weight|installed reference)\b/,
  /\b(?:matching group|valance group|side by side group|butt together group|motor network|remote channel)\b/,
  /\b(?:wand drop|auto wand length|autowand length|chain length|cord length)\b/,
  /\b(?:shade|blind) position from left\b|\bgap (?:after|between)|\bcommon valance gap\b/,
  /\b(?:keystone|splice) (?:locations?|centers?|layout)|\bjoint \d+ from|\bfirst shade offset/,
  /\bkeystone \d+ from|\b(?:handle|lock) center from/,
  /\b(?:divider rail|t post) (?:positions?|locations?|height)|\boffset tilt distance|\btilt rod section lengths/,
  /\b(?:panel net|finished net|net shade|net (?:left |right )?leg)|^(?:left |right )?leg height\b/,
  /^panel (?:widths|heights)$|\bcut out (?:width|top|bottom)/,
  /\btemplate (?:reference|file)|\bshape side \d+\b/,
  /^sundance (?:blind|walden) (?:depth|flush)$/,
  /\bcut ?out (?:width|height|top|bottom|details)\b/,
  /\b(?:onyx )?panel \d+ (?:width|height)\b/,
  /\bt post \d+ (?:position|location)|\btilt section \d+ (?:length|inches)/,
];
