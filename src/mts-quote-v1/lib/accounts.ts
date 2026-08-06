/**
 * Centralized Account ID Constants
 *
 * Single source of truth for all account UUIDs.
 * Import from here instead of hardcoding UUIDs throughout the codebase.
 */

// ============= Account IDs =============
// All account UUIDs in one place

export const ACCOUNT_IDS = {
  // Primary accounts
  LOWES: "13cb760c-5854-4bec-8f84-5f0bd4152964",
  THREE_DAY_BLINDS: "7bb6d42f-737c-4103-a74c-f33015934213",
  VICTORIA_NORMAN: "67a38140-2ba8-4491-ad88-d89052b7a250",
  GRABER: "f726a646-94f1-4fab-8bc8-bdb191946315",
  ROCKWOOD_SHUTTERS: "34feb528-2ca7-4246-ad31-9758a0a8781b",

  // Arjay's family
  ARJAYS: "db50b21f-6511-4c96-aafe-ffe86d634aef",
  COSTCO_WPM: "c8f23e91-4a7b-4d12-9e56-b8c9d0e1f234",

  // Regional accounts
  SHUTTERS_805: "72ccf12a-11c0-4261-8ad0-31af8ad0bbfb",
  SHUTTERS_818: "4ac21caf-6b2f-46d3-a447-de1578554bbb",
  PASADENA_SHADES: "b380937b-b96d-41b6-869a-90fb03c418ac",
  SEABREEZE: "f2c7ef74-97e2-4bc2-9eae-6e8c7116f4e5",

  // Independent accounts
  ANNA_MORALES: "2458c7e6-0058-41fe-824c-e49cedf3132b",
} as const;

// Type for account ID values
export type AccountId = (typeof ACCOUNT_IDS)[keyof typeof ACCOUNT_IDS];

// ============= Account Names =============
// Canonical display names (UUID → Name)

export const ACCOUNT_NAMES: Record<string, string> = {
  [ACCOUNT_IDS.VICTORIA_NORMAN]: "Victoria Norman",
  [ACCOUNT_IDS.SHUTTERS_805]: "805 Shutters",
  [ACCOUNT_IDS.SHUTTERS_818]: "818 Shutters and Shades",
  [ACCOUNT_IDS.ARJAYS]: "Arjay's",
  [ACCOUNT_IDS.COSTCO_WPM]: "Costco (WPM)",
  [ACCOUNT_IDS.GRABER]: "Graber",
  [ACCOUNT_IDS.LOWES]: "Lowe's",
  [ACCOUNT_IDS.PASADENA_SHADES]: "Pasadena Shades",
  [ACCOUNT_IDS.ROCKWOOD_SHUTTERS]: "Rockwood Shutters",
  [ACCOUNT_IDS.ANNA_MORALES]: "Anna Morales",
  [ACCOUNT_IDS.THREE_DAY_BLINDS]: "3 Day Blinds",
  [ACCOUNT_IDS.SEABREEZE]: "Seabreeze",
};

// ============= Name → ID Lookup =============
// For text-based imports (case-insensitive, with aliases)

export const ACCOUNT_NAME_TO_ID: Record<string, string> = {
  // 3 Day Blinds (multiple aliases)
  "3 day blinds": ACCOUNT_IDS.THREE_DAY_BLINDS,
  "3db": ACCOUNT_IDS.THREE_DAY_BLINDS,
  "three day blinds": ACCOUNT_IDS.THREE_DAY_BLINDS,
  "3dayblinds": ACCOUNT_IDS.THREE_DAY_BLINDS,

  // 805 Shutters
  "805 shutters": ACCOUNT_IDS.SHUTTERS_805,
  "805": ACCOUNT_IDS.SHUTTERS_805,

  // 818 Shutters and Shades
  "818 shutters and shades": ACCOUNT_IDS.SHUTTERS_818,
  "818 shutters": ACCOUNT_IDS.SHUTTERS_818,
  "818": ACCOUNT_IDS.SHUTTERS_818,

  // Anna Morales
  "anna morales": ACCOUNT_IDS.ANNA_MORALES,

  // Arjay's
  arjays: ACCOUNT_IDS.ARJAYS,
  "arjay's": ACCOUNT_IDS.ARJAYS,
  arjay: ACCOUNT_IDS.ARJAYS,

  // Costco WPM
  costco: ACCOUNT_IDS.COSTCO_WPM,
  "costco wpm": ACCOUNT_IDS.COSTCO_WPM,
  "costco (wpm)": ACCOUNT_IDS.COSTCO_WPM,

  // Graber
  graber: ACCOUNT_IDS.GRABER,

  // Lowe's
  lowes: ACCOUNT_IDS.LOWES,
  "lowe's": ACCOUNT_IDS.LOWES,

  // Pasadena Shades
  "pasadena shades": ACCOUNT_IDS.PASADENA_SHADES,
  pasadena: ACCOUNT_IDS.PASADENA_SHADES,

  // Rockwood Shutters
  rockwood: ACCOUNT_IDS.ROCKWOOD_SHUTTERS,
  "rockwood shutters": ACCOUNT_IDS.ROCKWOOD_SHUTTERS,

  // Victoria Norman
  "victoria norman": ACCOUNT_IDS.VICTORIA_NORMAN,
  vn: ACCOUNT_IDS.VICTORIA_NORMAN,

  // Seabreeze
  seabreeze: ACCOUNT_IDS.SEABREEZE,

  // California Homes → redirects to 805 Shutters (same company)
  "california homes": ACCOUNT_IDS.SHUTTERS_805,
};

// ============= Helper Functions =============

/**
 * Get account ID from a source name (case-insensitive, supports aliases)
 */
export function getAccountIdFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  return ACCOUNT_NAME_TO_ID[normalized] || null;
}

/**
 * Get display name for an account ID
 */
export function getAccountName(accountId: string | null | undefined): string {
  if (!accountId) return "Unknown";
  return ACCOUNT_NAMES[accountId] || "Unknown";
}

/**
 * Check if an account ID is valid (exists in our known accounts)
 */
export function isKnownAccount(accountId: string): boolean {
  return Object.values(ACCOUNT_IDS).includes(accountId as AccountId);
}

// ============= Short Account Names =============
// Abbreviated display names for compact card UIs

export const SHORT_ACCOUNT_NAMES: Record<string, string> = {
  "3 Day Blinds": "3DB",
  "818 Shutters and Shades": "818 S&S",
  "805 Shutters": "805",
  "Costco (WPM)": "Costco",
  "Rockwood Shutters": "Rockwood",
  "Pasadena Shades": "Pasadena",
};

// ============= Account Groups =============
// Logical groupings for feature flags and business rules

/** Accounts that have merged portals (users see jobs from multiple accounts) */
export const MERGED_ACCOUNT_GROUPS = {
  ARJAYS_COSTCO: [ACCOUNT_IDS.ARJAYS, ACCOUNT_IDS.COSTCO_WPM],
} as const;

/** Accounts excluded from manual invoicing (they have their own billing systems) */
export const EXCLUDED_FROM_INVOICING = [
  ACCOUNT_IDS.THREE_DAY_BLINDS,
  ACCOUNT_IDS.GRABER,
  ACCOUNT_IDS.LOWES,
  ACCOUNT_IDS.ROCKWOOD_SHUTTERS,
] as const;

/** Accounts that use QuickBooks receivable processing */
export const QUICKBOOKS_ACCOUNT_IDS = [
  ACCOUNT_IDS.ARJAYS,
  ACCOUNT_IDS.COSTCO_WPM,
  ACCOUNT_IDS.SHUTTERS_805,
  ACCOUNT_IDS.SHUTTERS_818,
  ACCOUNT_IDS.VICTORIA_NORMAN,
  ACCOUNT_IDS.PASADENA_SHADES,
  ACCOUNT_IDS.ANNA_MORALES,
  ACCOUNT_IDS.SEABREEZE,
] as const;

/** Accounts that require takedown/haul away selection */
export const ACCOUNTS_REQUIRING_TAKEDOWN_SELECTION = [
  ACCOUNT_IDS.VICTORIA_NORMAN,
  ACCOUNT_IDS.SHUTTERS_805,
  ACCOUNT_IDS.SHUTTERS_818,
  ACCOUNT_IDS.ARJAYS,
  ACCOUNT_IDS.COSTCO_WPM,
  ACCOUNT_IDS.PASADENA_SHADES,
] as const;

/** Accounts that DON'T show COD section in service reports */
export const ACCOUNTS_HIDING_COD = [
  ACCOUNT_IDS.LOWES,
  ACCOUNT_IDS.ROCKWOOD_SHUTTERS,
  ACCOUNT_IDS.ARJAYS,
  ACCOUNT_IDS.COSTCO_WPM,
] as const;

/** Accounts that use external portals requiring updates */
export const ACCOUNTS_WITH_PORTALS = [
  ACCOUNT_IDS.LOWES,
  ACCOUNT_IDS.GRABER,
  ACCOUNT_IDS.THREE_DAY_BLINDS,
] as const;
