/** Customer-facing emphasis from recorded specifications, never inferred from a color name. */
export function fabricPerformanceLabels(options:readonly string[],styleName=''):string[] {
  const fields=options.flatMap(o=>{const i=o.indexOf(':');return i<0?[]:[{label:o.slice(0,i).trim().toLowerCase(),value:o.slice(i+1).replace(/[_-]/g,' ').trim()}];});
  const explicit=fields.filter(o=>/^(light control|opacity|fabric category|shade type)$/.test(o.label));
  const fallback=fields.filter(o=>/^(fabric|style|color|fabric type|vane style)$/.test(o.label));
  const classify=(text:string)=>[
    /\broom\s*darkening\b/i.test(text)?'Room-darkening fabric':null,
    /\blight\s*filtering\b/i.test(text)?'Light-filtering fabric':null,
    /\bblack\s*out\b/i.test(text)?'Blackout fabric':null,
  ].filter((v):v is string=>!!v);
  const direct=explicit.flatMap(o=>classify(o.value));
  const labels=direct.length?direct:[...fallback.flatMap(o=>classify(o.value)),...classify(styleName)];
  for(const field of fields.filter(o=>/^linings?$/.test(o.label))) {
    if(/\bblack\s*out\b/i.test(field.value))labels.push('Blackout lining');
    else if(/\broom\s*darkening\b/i.test(field.value))labels.push('Room-darkening lining');
    else if(/\blight\s*filtering\b/i.test(field.value))labels.push('Light-filtering lining');
  }
  return [...new Set(labels)];
}
