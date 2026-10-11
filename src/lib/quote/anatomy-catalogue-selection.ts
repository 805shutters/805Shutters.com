export type ProductRenderSelection = { scope: 'all' | 'selected'; choices: string[] };
export type CatalogueSelection = Record<string, ProductRenderSelection>;
export const catalogueChoiceKey = (groupId:string,choiceId:string) => JSON.stringify([groupId,choiceId]);

/** Validate the saved scope against the same catalog displayed by the checklist. */
export function validateCatalogueSelection(value:unknown, catalog:ReadonlyMap<string,ReadonlySet<string>>): CatalogueSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result:CatalogueSelection = {};
  for(const [id,raw] of Object.entries(value)) {
    const allowed=catalog.get(id);
    if(!allowed || !raw || typeof raw!=='object' || Array.isArray(raw)) return null;
    const entry=raw as Record<string,unknown>;
    if(!['all','selected'].includes(String(entry.scope)) || !Array.isArray(entry.choices) || !entry.choices.every(c=>typeof c==='string' && allowed.has(c))) return null;
    result[id]={scope:entry.scope as ProductRenderSelection['scope'],choices:[...new Set(entry.choices as string[])]};
  }
  return result;
}
