import { contractProductFamily } from './contract-product-family';
import type { ContractIllustration } from './contract-illustrations';

/** Artwork coordinates, not installation dimensions. Only identify controls actually drawn. */
export function anatomyControlAnchor(product: string, options: readonly string[], art: ContractIllustration | null) {
  if (!art || art.referenceNote) return null;
  if (art.remote) return { kind: 'remote' as const, point: [50, 48] as [number, number] };
  const family = contractProductFamily(product);
  // These assets draw the wand into the raster. Use its physical position,
  // including the separate right-hand faux-wood asset, rather than the label side.
  if (['wood', 'faux-wood', 'mini'].includes(family)) {
    const baseX = family === 'faux-wood' ? 21 : family === 'wood' ? 25 : 26;
    const x = art.src.endsWith('/faux-wood-wand-right.webp') ? 80 : art.mirror ? 100 - baseX : baseX;
    return { kind: 'wand' as const, point: [x, 40] as [number, number] };
  }
  if (!['roller', 'roman', 'honeycomb', 'sheer', 'woven'].includes(family)) return null;
  const operations = options.filter(o => /^(lift system|operating system|control type|honeycomb operating system|lift \/ control):/i.test(o)).map(o => o.slice(o.indexOf(':') + 1).replace(/\*/g, '').trim());
  if (operations.some(o => /cordless|^top.down.bottom.up$/i.test(o))) {
    const point: [number, number] = family === 'honeycomb' ? [53, 79] : family === 'roman' ? [51, 80] : [50, 79];
    return { kind: 'pull-tab' as const, point };
  }
  if (operations.some(o => /^(continuous )?(cord|chain) loop$|^ccl$/i.test(o))) {
    const left = options.some(o => /^(control side|chain location|chain side):\s*(left|l)$/i.test(o));
    return { kind: 'cord-loop' as const, point: [left ? 13 : 87, 61] as [number, number] };
  }
  return null;
}
