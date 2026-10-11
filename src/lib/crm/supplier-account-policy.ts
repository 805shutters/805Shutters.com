/** Public dealer identity supplied by the user; never credential material. */
export type SupplierAccountIdentity={dealerId:string;displayName:string};
export const NORMAN_805_ACCOUNT:Readonly<SupplierAccountIdentity>=Object.freeze({dealerId:'RA00743',displayName:'MIKE S'});
export function isNorman805Account(identity:SupplierAccountIdentity|undefined):boolean {
  return typeof identity?.dealerId==='string'&&typeof identity.displayName==='string'&&identity.dealerId.trim()===NORMAN_805_ACCOUNT.dealerId&&identity.displayName.trim().toUpperCase()===NORMAN_805_ACCOUNT.displayName;
}
