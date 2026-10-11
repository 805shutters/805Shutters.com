import {describe,it,expect} from 'vitest';
import {catalogueChoiceKey,validateCatalogueSelection} from './anatomy-catalogue-selection';
const choice=catalogueChoiceKey('lift','cordless');
const catalog=new Map([['roller',new Set([choice])]]);
describe('render checklist scope',()=>{
  it('preserves all options, a subset, and base-only as distinct choices',()=>{
    expect(validateCatalogueSelection({roller:{scope:'all',choices:[]}},catalog)).toEqual({roller:{scope:'all',choices:[]}});
    expect(validateCatalogueSelection({roller:{scope:'selected',choices:[choice,choice]}},catalog)?.roller.choices).toEqual([choice]);
    expect(validateCatalogueSelection({roller:{scope:'selected',choices:[]}},catalog)).toEqual({roller:{scope:'selected',choices:[]}});
    expect(validateCatalogueSelection({},catalog)).toEqual({});
  });
  it('rejects unknown products, stale options and malformed selections',()=>{
    for(const value of [null,[],{unknown:{scope:'all',choices:[]}},{roller:{scope:'all',choices:['wrong']}},{roller:{scope:'invalid',choices:[]}},{roller:{scope:'selected',choices:'all'}}])expect(validateCatalogueSelection(value,catalog)).toBeNull();
  });
});
