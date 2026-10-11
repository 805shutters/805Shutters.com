/** Design rollout only. Enable processing only with reviewed supplier drivers,
 * durable worker/photo recovery, queue deployment and verified CRM contracts.
 * No environment flag or browser setting can activate this unfinished runtime.
 */
export const SUPPLIER_DRAFT_UNAVAILABLE_MESSAGE = 'Supplier costing is not connected yet. Your draft stays saved on this device; submission is unavailable.';
export function supplierDraftProcessingAvailable(): boolean { return false; }
