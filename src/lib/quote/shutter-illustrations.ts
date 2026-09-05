/** Preserve the ordered layout as well as the pencil panel's operating details. */
export function shutterIllustration(fields: readonly string[][]) {
  const values = (...keys: string[]) => fields.filter(([key]) => keys.includes(key)).map(([, value]) => value);
  const configurations = values("panel config", "panel configuration");
  const layouts = new Set(configurations.map(value => value.replace(/\s/g, "").toUpperCase()));
  if (layouts.size !== 1) return null;
  const layout = [...layouts][0];
  const counts = new Set(configurations.map((value) => {
    const compact = value.replace(/\s/g, "");
    if (/^3(sp|fc|invert)$/.test(compact)) return 3;
    if (/^[lrt]+$/.test(compact)) return (compact.match(/[lr]/g) || []).length;
    return 0;
  }));
  if (counts.size !== 1) return null;
  const panels = [...counts][0];
  if (panels < 1 || panels > 8) return null;
  const tilts = new Set(values("tilt", "tilt type").map((value) => {
    if (/hidden|invisible/.test(value)) return "hidden";
    if (/offset/.test(value)) return "unknown";
    if (/standard tilt|front center|center tilt|tilt bar/.test(value)) return "center";
    return "unknown";
  }));
  if (tilts.size !== 1 || tilts.has("unknown")) return null;
  const tilt = [...tilts][0];
  const booleans = (entries: string[]) => new Set(entries.map((value) => /^(yes|true|1)$/.test(value) ? true : /^(no|false|0|none)$/.test(value) ? false : null));
  const splits = booleans(values("split tilt"));
  const rails = booleans(values("divider rail", "divider rail count"));
  if (splits.has(null) || rails.has(null) || splits.size > 1 || rails.size > 1) return null;
  const split = splits.has(true);
  const divider = rails.has(true);
  const variant = split && divider ? "split-divider" : split ? "split" : divider ? "divider" : "plain";
  const details = [panels === 1 ? "1 panel" : `${panels} panels`, layout, tilt === "hidden" ? "Hidden tilt" : "Center tilt bar", ...(split ? ["Split tilt: upper louvers open, lower louvers closed"] : []), ...(divider ? ["Divider rail"] : [])];
  return { asset: `shutter-${tilt}-${variant}`, panels, layout, detail: details.join(" · ") };
}
