// Shared types for Google Places address autocomplete.
// Safe to import from both client and server (no secrets, no node-only code).

export type PlaceSuggestion = {
  placeId: string;
  /** Bold first line, e.g. "123 Main St" */
  primary: string;
  /** Muted second line, e.g. "Ventura, CA, USA" */
  secondary: string;
};

export type ResolvedAddress = {
  /** Google's formatted single-line address. */
  fullAddress: string;
  /** Street line only, e.g. "123 Main St". */
  street: string;
  city: string;
  /** Two-letter state, e.g. "CA". */
  state: string;
  zip: string;
};
