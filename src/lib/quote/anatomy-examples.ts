import type { AnatomyPreviewProduct } from './contract-anatomy-catalog';
import { contractProductFamily } from './contract-product-family';

/** Explicit sample selections for the review gallery; never used by a saved quote. */
export function anatomyExampleSelections(p: AnatomyPreviewProduct): Record<string,string> {
  const selected:Record<string,string> = {};
  const choose=(field:RegExp,value:RegExp) => {
    const group=p.groups.find(g=>field.test(g.label)&&g.choices.some(c=>value.test(c.label.replace(/\*+$/,''))));
    const choice=group?.choices.find(c=>value.test(c.label.replace(/\*+$/,'')));
    if(group && choice) selected[group.id]=choice.id;
  };
  const family=contractProductFamily(p.name);
  choose(/^(mount|mount type)$/i,/^inside mount$/i);
  if(family === 'shutters') {
    choose(/^panel config(uration)?$/i,/^L\s*R$|^Left \/ right pair$/i);
    choose(/^tilt type$/i,/standard tilt|center tilt|hidden/i);
    choose(/^louver size$/i,/3.?1\/2|3\.5/);
    choose(/^split tilt$/i,/^yes$/i);
    choose(/^divider rail$/i,/^no$/i);
  } else {
    choose(/^(lift system|operating system)$/i,family === 'roller' || family === 'honeycomb' ? /^continuous cord loop$/i : /cordless/i);
    choose(/^(control side|wand side|tilt side)$/i,/^right$/i);
    if(family === 'roller') choose(/^valance$/i,/^cassette$/i);
    choose(/^(fabric roll|roll type)$/i,/^standard( roll)?$/i);
  }
  // A single catalog swatch avoids inventing a fabric/color pairing.
  choose(/^fabric \/ color$/i,/.+/);
  return selected;
}
