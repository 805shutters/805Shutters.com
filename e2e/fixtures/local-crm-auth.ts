// Fixture-only replacement: the real price preparation is exercised without loading server credentials.
export class CrmAuthError extends Error { constructor(readonly status:number,message:string){super(message);} }
