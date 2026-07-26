export const commercialAccountTypes = [
  "general_contractor",
  "developer",
  "architect_designer",
  "school_district",
  "property_management",
  "hospitality",
  "healthcare",
  "government",
  "facilities",
  "window_covering_partner",
  "commercial_real_estate",
  "other"
] as const;

export type CommercialAccountType = (typeof commercialAccountTypes)[number];

export const commercialStatuses = [
  "review_needed",
  "new",
  "researching",
  "ready",
  "contacted",
  "replied",
  "meeting",
  "bid_invited",
  "bidding",
  "won",
  "nurture",
  "not_fit",
  "do_not_contact"
] as const;

export type CommercialStatus = (typeof commercialStatuses)[number];
export type CommercialPriority = "low" | "normal" | "high" | "strategic";
export type CommercialLicenseStatus = "not_applicable" | "unverified" | "active" | "inactive" | "expired" | "suspended";
export type CommercialActivityType =
  | "created"
  | "research"
  | "note"
  | "call"
  | "email_sent"
  | "reply_received"
  | "meeting"
  | "bid_invite"
  | "estimate_review"
  | "bid_submitted"
  | "status_change"
  | "opt_out";

export type CommercialAccount = {
  id: string;
  created_at: string;
  updated_at: string;
  company_name: string;
  account_type: CommercialAccountType;
  status: CommercialStatus;
  priority: CommercialPriority;
  assigned_to: string;
  contact_name: string | null;
  contact_title: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string;
  postal_code: string | null;
  license_number: string | null;
  license_classifications: string[];
  license_status: CommercialLicenseStatus;
  license_verified_at: string | null;
  source_type: string;
  source_name: string | null;
  source_url: string | null;
  source_checked_at: string | null;
  external_id: string | null;
  next_action: string | null;
  next_action_due: string | null;
  last_contacted_at: string | null;
  last_replied_at: string | null;
  estimated_value: number;
  notes: string | null;
  tags: string[];
  do_not_email: boolean;
  meta: Record<string, unknown>;
};

export type CommercialActivity = {
  id: string;
  created_at: string;
  account_id: string;
  activity_type: CommercialActivityType;
  actor_email: string | null;
  subject: string | null;
  body_preview: string | null;
  external_message_id: string | null;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  occurred_at: string;
  meta: Record<string, unknown>;
};

export type CommercialSummary = {
  total: number;
  reviewNeeded: number;
  readyToContact: number;
  contacted: number;
  replies: number;
  activeBids: number;
  wins: number;
  pipelineValue: number;
  overdue: number;
  missingEmail: number;
};

export type CommercialWorkspaceData = {
  accounts: CommercialAccount[];
  activities: CommercialActivity[];
  summary: CommercialSummary;
  configuration: {
    outboundEmail: boolean;
    replySync: boolean;
    postalAddress: boolean;
    googlePlaces: boolean;
  };
};

export type CommercialCampaignStatus = "draft" | "active" | "paused" | "completed";
export type CommercialCampaignEnrollmentStatus = "queued" | "sent" | "replied" | "opted_out" | "completed" | "skipped" | "failed";

export type CommercialCampaign = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  account_type: CommercialAccountType;
  audience_statuses: CommercialStatus[];
  status: CommercialCampaignStatus;
  intro_subject: string;
  intro_body: string;
  follow_up_subject: string;
  follow_up_body: string;
  follow_up_delay_days: number;
  daily_limit: number;
  created_by: string | null;
  launched_at: string | null;
  paused_at: string | null;
  last_run_at: string | null;
};

export type CommercialCampaignStats = {
  total: number;
  queued: number;
  sent: number;
  replied: number;
  optedOut: number;
  completed: number;
  skipped: number;
  failed: number;
};

export type CommercialCampaignWithStats = CommercialCampaign & { stats: CommercialCampaignStats };

export const commercialTypeLabels: Record<CommercialAccountType, string> = {
  general_contractor: "General contractor",
  developer: "Developer",
  architect_designer: "Architect / designer",
  school_district: "School / district",
  property_management: "Property management",
  hospitality: "Hospitality",
  healthcare: "Healthcare",
  government: "Government",
  facilities: "Facilities",
  window_covering_partner: "Window-covering partner",
  commercial_real_estate: "Commercial real estate",
  other: "Other"
};

export const commercialStatusLabels: Record<CommercialStatus, string> = {
  review_needed: "Review needed",
  new: "New",
  researching: "Researching",
  ready: "Ready",
  contacted: "Contacted",
  replied: "Replied",
  meeting: "Meeting",
  bid_invited: "Bid invited",
  bidding: "Bidding",
  won: "Won",
  nurture: "Nurture",
  not_fit: "Not a fit",
  do_not_contact: "Do not contact"
};

export const commercialPipelineStatuses: CommercialStatus[] = [
  "review_needed",
  "new",
  "researching",
  "ready",
  "contacted",
  "replied",
  "meeting",
  "bid_invited",
  "bidding",
  "won"
];

export type CommercialSource = {
  id: string;
  name: string;
  description: string;
  url: string;
  action: string;
  format: "live-search" | "download" | "registration" | "bid-board";
};

export const commercialProspectSources: CommercialSource[] = [
  {
    id: "cslb-d52",
    name: "CSLB D-52 + B contractors",
    description: "Current licensed window-covering and general-building contractors by Ventura County. CSLB supplies license, address, phone, classification, bond, and workers-comp data, but not email.",
    url: "https://cslb.ca.gov/onlineservices/dataportal/ListByCounty",
    action: "Download Ventura list",
    format: "download"
  },
  {
    id: "cde-schools",
    name: "California School Directory",
    description: "Real-time public-school and district directory with addresses, phone numbers, administrators, and available business-office contacts.",
    url: "https://www.cde.ca.gov/ds/si/ds/pubschls.asp",
    action: "Open school data",
    format: "download"
  },
  {
    id: "ventura-bonfire",
    name: "County of Ventura Bonfire",
    description: "Vendor registration and current County solicitations. Register first so commodity-code notifications can reach 805 Commercial.",
    url: "https://ventura.bonfirehub.com/",
    action: "Register / view bids",
    format: "registration"
  },
  {
    id: "cal-eprocure",
    name: "Cal eProcure",
    description: "California public contracting opportunities and supplier registration for state agencies and participating buyers.",
    url: "https://caleprocure.ca.gov/pages/index.aspx",
    action: "Search public bids",
    format: "bid-board"
  },
  {
    id: "ventura-permits",
    name: "Ventura County Citizen Access",
    description: "Current planning and permit records that can reveal commercial tenant improvements, developments, and project teams before window-covering scopes are bought.",
    url: "https://vcca.ventura.org/",
    action: "Search active permits",
    format: "live-search"
  },
  {
    id: "buildingconnected",
    name: "BuildingConnected",
    description: "General-contractor bid invitations and subcontractor network. Complete the profile and request additions to GC bid lists.",
    url: "https://www.buildingconnected.com/",
    action: "Open bid network",
    format: "registration"
  }
];

export const commercialDiscoverySearches = [
  { id: "general-contractors", label: "Commercial general contractors", query: "commercial general contractor" },
  { id: "developers", label: "Developers and multifamily builders", query: "commercial real estate developer multifamily builder" },
  { id: "architects", label: "Architects and commercial designers", query: "commercial architect interior designer" },
  { id: "property-managers", label: "Property and facility managers", query: "commercial property management facility management" },
  { id: "schools", label: "Schools and district offices", query: "school district facilities office" },
  { id: "hospitality", label: "Hotels and senior living", query: "hotel senior living community" },
  { id: "healthcare", label: "Medical and dental facilities", query: "medical office hospital clinic" },
  { id: "window-coverings", label: "Window-covering trade partners", query: "commercial window coverings blinds shades" }
] as const;

export const commercialDiscoveryAreas = ["Ventura", "Oxnard", "Camarillo", "Thousand Oaks", "Simi Valley", "Moorpark", "Ojai", "Santa Paula"] as const;
