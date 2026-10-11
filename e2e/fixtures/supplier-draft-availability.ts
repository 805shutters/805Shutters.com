export { SUPPLIER_DRAFT_UNAVAILABLE_MESSAGE } from '../../src/lib/crm/supplier-draft-availability';
export function supplierDraftProcessingAvailable() { return !new URLSearchParams(location.search).has('design-only'); }
