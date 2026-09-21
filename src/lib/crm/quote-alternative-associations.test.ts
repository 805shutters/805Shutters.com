import { describe, expect, it } from 'vitest';
import { remapCopiedQuoteAssociations } from './quote-alternative-associations';
import { quoteAlternativeCopyOperations } from './sales-quote-v2-alternatives';
import { ROLLER_VALANCE_KEY as KEY, emptyRollerValance } from '@/lib/quote/norman-roller-valance-only';
import type { SalesQuoteDesign, SalesQuoteLineItem } from '@mts/types/quote';

describe('copied quote user associations', () => {
  it('remaps all explicit copied targets without changing the source or guessing dangling links', () => {
    const source = { accompanying_line_id:'a',side_by_side_match_line_id:'b',notes:'a',groupId:'a',
      [KEY]:{...emptyRollerValance(),associatedLineIds:['a','b','missing']},
      historical_snapshot:{lineId:'a',price:999},other:{associatedLineIds:['a']} };
    const before=JSON.stringify(source);
    const result=remapCopiedQuoteAssociations(source,new Map([['a','new-a'],['b','new-b']]));
    expect(result).toEqual({...source,accompanying_line_id:'new-a',side_by_side_match_line_id:'new-b',[KEY]:{...source[KEY],associatedLineIds:['new-a','new-b','missing']}});
    expect(JSON.stringify(source)).toBe(before);
  });
  it('does not reinterpret future or malformed typed records',()=>{
    for(const value of [null,[],{[KEY]:{version:2,associatedLineIds:['a']}},{[KEY]:{version:1,associatedLineIds:'a'}}])
      expect(remapCopiedQuoteAssociations(value,new Map([['a','b']]))).toEqual(value);
  });
  it('uses the actual copy operation IDs, remains deterministic and preserves original historical money/configuration',()=>{
    const lines=['v','a','b'].map(id=>({id,selected_design_id:`d-${id}`,room_name:id,product_type:id==='v'?'Valances':'Roller Shades'} as SalesQuoteLineItem));
    const designs=lines.map(l=>({id:l.selected_design_id,line_item_id:l.id,variant:'A',supplier:'Norman',options_json:{[KEY]:{...emptyRollerValance(),associatedLineIds:['a','b']},authoritative_v2_snapshot:{total:987}},unit_price:987} as unknown as SalesQuoteDesign));
    const original=JSON.stringify({lines,designs});const result=quoteAlternativeCopyOperations(lines,designs,'copy-regression');
    const created=result.filter(r=>r.type==='line.create');const copied=result.find(r=>r.type==='design.upsert');
    expect(copied).toMatchObject({patch:{optionsJson:{[KEY]:{associatedLineIds:[created[1].lineItemId,created[2].lineItemId]}}}});
    expect(JSON.stringify(result)).not.toContain('authoritative_v2_snapshot');
    expect(JSON.stringify({lines,designs})).toBe(original);
    expect(quoteAlternativeCopyOperations(lines,designs,'copy-regression')).toEqual(result);
  });
});
