-- Sundance line-event consumer. Stacked on the Onyx consumer, which is stacked on Norman.
-- Additive only: new role, tables, and functions. No drops, deletes, or truncates.
-- Not applied to production by the pull request that adds this file.
-- Does not read or write crm_live_lookup_switch. The Sundance switch stays off.
-- Does not place a new manufacturer order. Does not send email, SMS, or any other outbound message.
-- Does not create, store, or print a secret.
-- Does not write installer_notes or installer_notes.__internal805.
-- Does not grant table privileges to service_role or to manufacturer_bot_sundance.
--
-- Account blocker: Sundance customer number ST0142 is unconfirmed. This migration
-- does not seed it and does not insert any crm_vendor_accounts row. A receipt
-- whose account is not an active crm_vendor_accounts row fails closed with
-- no_vendor_account.
--
-- Price blocker: portal labels Base, Options, Discount, and Net are not a
-- confirmed dealer net. price_basis_unconfirmed stores that raw object and
-- does not copy Net into dealer_net_base_price or call price_line_from_receipt.
--
-- Required fields come from data/order-entry/805-sundance-order-fields.json
-- (sha256 e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656). This migration does not seed public.quote_category_field_sequence.
-- Follow-up: seed that table from the same file after the field list is confirmed.
--
-- public.wake_line_event_worker keeps every earlier gate. Norman stays on
-- line_event.wake_http, line_event.worker_url, and line_event.worker_secret
-- (route NORMAN_LINE_EVENT_WAKE_ENABLED). Onyx stays on line_event.onyx_wake_http,
-- line_event.onyx_worker_url, and line_event.onyx_worker_secret
-- (route ONYX_LINE_EVENT_WAKE_ENABLED). Sundance stays closed until an operator,
-- outside this migration, sets every one of these:
--   line_event.sundance_wake_http = on
--   line_event.sundance_worker_url = https://www.805shutters.com/api/crm/sundance-line-event-worker
--   line_event.sundance_worker_secret = the server env SUNDANCE_LINE_EVENT_WORKER_SECRET
-- The route also stays closed until SUNDANCE_LINE_EVENT_WAKE_ENABLED=true and
-- SUNDANCE_LINE_EVENT_WORKER_SECRET is set. Lotus stays wake_disabled.
-- A missing URL or secret fails closed. Applying this after Norman and Onyx
-- does not remove either of those branches.


create table if not exists line_event.sundance_order_field_source (
  id integer primary key,
  sha256 text not null,
  document jsonb not null,
  constraint sundance_order_field_source_one check (id = 1)
);

comment on table line_event.sundance_order_field_source is
  'Copy of data/order-entry/805-sundance-order-fields.json used for the required-field check. Not seeded into quote_category_field_sequence.';

create table if not exists line_event.sundance_observed_prices (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references line_event.quote_lines (line_id),
  event_id uuid not null references line_event.events (id),
  idempotency_key text not null unique,
  prices jsonb not null,
  basis text not null default 'unconfirmed',
  created_at timestamptz not null default now(),
  constraint sundance_observed_prices_basis check (basis = 'unconfirmed'),
  constraint sundance_observed_prices_object check (jsonb_typeof(prices) = 'object')
);

comment on table line_event.sundance_observed_prices is
  'Raw Sundance portal prices kept with basis unconfirmed. Net is not copied to dealer net and is not applied.';

alter table line_event.sundance_order_field_source enable row level security;
alter table line_event.sundance_observed_prices enable row level security;

revoke all on table line_event.sundance_order_field_source from public;
revoke all on table line_event.sundance_observed_prices from public;

insert into line_event.sundance_order_field_source (id, sha256, document)
values (
  1,
  'e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656',
  $sundance_fields${
 "generated": "2026-11-21 (America/Los_Angeles)",
 "manufacturer": "Sundance",
 "sources": [
  "repo 805shutters/805Shutters.com main: src/lib/quote/sundance/*-configuration.ts validators, drapery-track.portal.json, scripts/sundance/families.json, docs/quote-audits/sundance-*.md, sundance-dealer-ledger-2026-09-20.csv (2,408 portal menu rows from sundance.blindata.app, 17 ordering types)",
  "Supabase evuxqsaucmvgyuvjpqlo (SELECT only): sales_quote_designs options_json (Sundance), crm_customer_products, crm_quotes, crm_quote_bookkeeping_entries, crm_order_cogs_emails, crm_vendor_accounts, quote_category_field_sequence/quote_catalog_field_choice (0 Sundance rows)",
  "805 Sundance Order bot transcript (1db8d899-...): live portal drafts 805-0560 A (verticals), John Surge & 805-0579 B (SheerView Plus)",
  "Box files: Sundance acks 86118 (Wovenwood) / 88195 (Cellular), invoice 107949, Vertical Essence guide K-1..K-13",
  "web-sourced: sundancedecor.com/order-forms (Roller 11-25, Zebra, Woven, Cellular, Europanel, Sheerview, Portfolio, Chateau Woods, Vertical, Shutters PDFs)"
 ],
 "global_issues": [
  "Sundance has NO rows in quote_category_field_sequence / quote_catalog_field_choice and no public/order-form-templates schema — this file is the first order-entry field list; nothing seeded.",
  "Live dealer form to check: https://sundance.blindata.app (Blindata; login in Grok vault entry 'sundance.blindata.app', id 919005). No field below was re-checked live today; all 'needs_live_form_check' items must be confirmed there.",
  "Portal price labels are Base / Options / Discount / Net. Net ~= 21% of Base on verticals (79% discount), 60% discount on SheerView. Which is dealer net is unconfirmed (PR #107 refuses unlabeled bases).",
  "Portal requires ZIP and a delivery method before ship-to saves; freight is 'Calculated next step'.",
  "Vertical Essence has no stack-side field; side must go in line Note/Instructions.",
  "7 catalog families have NO portal ordering type (Sundance + Louvolite flat Roman, BasicVue, Chateau Woods, exterior cable, wood shutters, vinyl shutters) — cannot be order-entered; quoting them should block."
 ],
 "order_level_fields": {
  "sundance_order_header": [
   {
    "key": "customer_name",
    "ask_order": 1,
    "db_required": null,
    "db_input_kind": null,
    "level": "order",
    "kind": "order",
    "allowed": "CRM customer",
    "conditional": "",
    "free_form": false,
    "button_stand_in": "",
    "depends_on": [],
    "screen_rule": "",
    "source": "805 CRM",
    "required": "always",
    "portal_label": null,
    "label": "customer_name",
    "confidence": "crm",
    "needs_live_form_check": false
   },
   {
    "key": "quote_number",
    "ask_order": 2,
    "db_required": null,
    "db_input_kind": null,
    "level": "order",
    "kind": "order",
    "allowed": "CRM quote no. (e.g. 805-0579 B)",
    "conditional": "",
    "free_form": false,
    "button_stand_in": "",
    "depends_on": [],
    "screen_rule": "",
    "source": "805 CRM",
    "required": "always",
    "portal_label": null,
    "label": "quote_number",
    "confidence": "crm",
    "needs_live_form_check": false
   },
   {
    "key": "order_draft_name",
    "ask_order": 3,
    "db_required": null,
    "db_input_kind": null,
    "level": "order",
    "kind": "auto",
    "allowed": "'<Customer> (<quote no.>)' — portal draft title",
    "conditional": "",
    "free_form": false,
    "button_stand_in": "",
    "depends_on": [],
    "screen_rule": "",
    "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
    "required": "always",
    "portal_label": "Order name (draft title)",
    "label": "order_draft_name",
    "confidence": "portal_observed",
    "needs_live_form_check": false
   },
   {
    "key": "account_number",
    "ask_order": 4,
    "db_required": null,
    "db_input_kind": null,
    "level": "order",
    "kind": "auto",
    "allowed": "Sundance Customer # ST0142 (from acks/invoice; NOT in crm_vendor_accounts)",
    "conditional": "",
    "free_form": false,
    "button_stand_in": "",
    "depends_on": [],
    "screen_rule": "",
    "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); invoice 107949",
    "required": "always",
    "portal_label": "Account # / Customer #",
    "label": "account_number",
    "confidence": "document",
    "needs_live_form_check": true
   },
   {
    "key": "po_number",
    "ask_order": 5,
    "db_required": null,
    "db_input_kind": null,
    "level": "order",
    "kind": "order",
    "allowed": "text; 805 has used customer name (SHELLIE LESSER) or portal auto 'WEB: <n>'",
    "conditional": "Owner decision pending (Norman P.O. value question applies here too); bots leave blank unless told",
    "free_form": false,
    "button_stand_in": "buttons: [Customer last name] [Quote no.] [Blank] ",
    "depends_on": [],
    "screen_rule": "",
    "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
    "required": "conditional",
    "portal_label": "P.O. No / Cust Ord No",
    "label": "po_number",
    "confidence": "document",
    "needs_live_form_check": true
   },
   {
    "key": "sidemark",
    "ask_order": 6,
    "db_required": null,
    "db_input_kind": null,
    "level": "order",
    "kind": "order",
    "allowed": "text, default customer full name",
    "conditional": "",
    "free_form": false,
    "button_stand_in": "default = customer name (one tap to accept)",
    "depends_on": [],
    "screen_rule": "",
    "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web forms 'Sidemark'",
    "required": "always",
    "portal_label": "Sidemark",
    "label": "sidemark",
    "confidence": "document",
    "needs_live_form_check": false
   },
   {
    "key": "delivery_method",
    "ask_order": 7,
    "db_required": null,
    "db_input_kind": null,
    "level": "order",
    "kind": "button",
    "allowed": "portal requires one; seen on acks: 'Delivery'. Other choices not yet captured (pickup FOB Arcadia exists for stock verticals)",
    "conditional": "",
    "free_form": false,
    "button_stand_in": "Delivery (default) | Will call / pickup Arcadia",
    "depends_on": [],
    "screen_rule": "",
    "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
    "required": "always",
    "portal_label": "Dispatch method / Delivery method",
    "label": "delivery_method",
    "confidence": "portal_observed",
    "needs_live_form_check": true
   },
   {
    "key": "ship_to_name",
    "ask_order": 8,
    "db_required": null,
    "db_input_kind": null,
    "level": "order",
    "kind": "button",
    "allowed": "805 SHUTTERS (default, used on every past order) | customer",
    "conditional": "",
    "free_form": false,
    "button_stand_in": "[805 shop] [Customer address]",
    "depends_on": [],
    "screen_rule": "",
    "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
    "required": "always",
    "portal_label": "Deliver to",
    "label": "ship_to_name",
    "confidence": "document",
    "needs_live_form_check": false
   },
   {
    "key": "ship_to_address",
    "ask_order": 9,
    "db_required": null,
    "db_input_kind": null,
    "level": "order",
    "kind": "order",
    "allowed": "street, city, state; 805 shop = 150 Wood Rd Ste D, Camarillo CA 93010 on acks (387 S Lewis Rd on 88195)",
    "conditional": "",
    "free_form": false,
    "button_stand_in": "",
    "depends_on": [
     "ship_to_name"
    ],
    "screen_rule": "ask on a later screen than: ship_to_name",
    "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
    "required": "always",
    "portal_label": "Ship to / Deliver to",
    "label": "ship_to_address",
    "confidence": "document",
    "needs_live_form_check": true
   },
   {
    "key": "ship_to_zip",
    "ask_order": 10,
    "db_required": null,
    "db_input_kind": null,
    "level": "order",
    "kind": "order",
    "allowed": "5-digit ZIP — portal REQUIRED ('Zip* This field is required'); freight can't calculate without it",
    "conditional": "",
    "free_form": false,
    "button_stand_in": "",
    "depends_on": [
     "ship_to_name"
    ],
    "screen_rule": "ask on a later screen than: ship_to_name",
    "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
    "required": "always",
    "portal_label": "Zip*",
    "label": "ship_to_zip",
    "confidence": "portal_observed",
    "needs_live_form_check": false
   },
   {
    "key": "bill_to",
    "ask_order": 11,
    "db_required": null,
    "db_input_kind": null,
    "level": "order",
    "kind": "auto",
    "allowed": "SNS INTERIOR INC. / DBA 805 SHUTTERS, 2209 Barbara Dr, Camarillo 93012 (account default)",
    "conditional": "",
    "free_form": false,
    "button_stand_in": "",
    "depends_on": [],
    "screen_rule": "",
    "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
    "required": "always",
    "portal_label": "Order to / Bill to",
    "label": "bill_to",
    "confidence": "document",
    "needs_live_form_check": false
   },
   {
    "key": "contact_phone_email",
    "ask_order": 12,
    "db_required": null,
    "db_input_kind": null,
    "level": "order",
    "kind": "auto",
    "allowed": "account defaults (805shutters@gmail.com)",
    "conditional": "",
    "free_form": false,
    "button_stand_in": "",
    "depends_on": [],
    "screen_rule": "",
    "source": "invoice 107949; web forms",
    "required": "optional",
    "portal_label": "Phone# / Email",
    "label": "contact_phone_email",
    "confidence": "document",
    "needs_live_form_check": false
   },
   {
    "key": "special_instructions",
    "ask_order": 13,
    "db_required": null,
    "db_input_kind": null,
    "level": "order",
    "kind": "free",
    "allowed": "text",
    "conditional": "",
    "free_form": true,
    "button_stand_in": "'None' default + chips (2-on-1 headrail details, ordered-together/alignment, template attached)",
    "depends_on": [],
    "screen_rule": "",
    "source": "web order forms; acks",
    "required": "optional",
    "portal_label": "Special Instructions / Spec. Ins.",
    "label": "special_instructions",
    "confidence": "document",
    "needs_live_form_check": false
   },
   {
    "key": "order_date",
    "ask_order": 14,
    "db_required": null,
    "db_input_kind": null,
    "level": "order",
    "kind": "auto",
    "allowed": "today",
    "conditional": "",
    "free_form": false,
    "button_stand_in": "",
    "depends_on": [],
    "screen_rule": "",
    "source": "web order forms",
    "required": "always",
    "portal_label": "Date",
    "label": "order_date",
    "confidence": "document",
    "needs_live_form_check": false
   }
  ],
  "per_line_common": [
   "room_name",
   "quantity",
   "width (1/8\")",
   "height (1/8\")",
   "mount_type",
   "fabric_color",
   "line_note"
  ],
  "notes": [
   "Room and mount are per line on Sundance (not order-level).",
   "Past real orders used P.O. = customer name (88195) or portal 'WEB: <n>' (86118) with Sidemark = customer name; ship-to = 805 shop."
  ]
 },
 "accounts": {
  "sundance_account_number_in_crm": "NONE — crm_vendor_accounts has no Sundance row; no table in the DB contains 'ST0142'.",
  "sundance_account_number_found_elsewhere": "ST0142 ('Customer #' on Sundance acks 86118 & 88195 and 'Cust. Number' on invoice 107949; account name SNS INTERIOR INC. / DBA 805 SHUTTERS). Mike should confirm before it is seeded.",
  "onyx_row_in_crm_vendor_accounts": "NONE — crm_vendor_accounts has exactly 1 row: norman RA00743 (created 2026-11-21 08:25 PT). CHE01 appears in 138 crm_order_cogs_emails rows (Onyx order mail) but is not in crm_vendor_accounts.",
  "lotus": "no row",
  "pr_107": "merged 2026-11-21 09:05 PT; seeds no account rows, switches stay off; receipts fail closed with no_vendor_account until rows exist."
 },
 "products": [
  {
   "manufacturer": "Sundance",
   "category": "sundance_sheerview",
   "product_name": "Sundance SheerView Plus (sheer/banded vane shade)",
   "quote_product_type": "Sheer Shades",
   "portal_ordering_type": "SheerView Plus",
   "quoted_designs_in_crm": 41,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 18,
   "required_line_fields": 11,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "headrail_finish",
    "motor_type",
    "cord_option",
    "charger",
    "remote_control",
    "mount_depth_flush"
   ],
   "status": "gaps",
   "flags": [
    "Portal sits under 'Roller Shade Collection > SHEERVIEW PLUS'.",
    "IB: factory deducts 1/8\" from width (web Sheerview form); OB exact.",
    "Remote/hub not orderable on SheerView Plus (portal shows only 'No'); guide lists remotes for 'Sheerview' — mismatch.",
    "Price label is Base/Options/Discount/Net; Net ~= dealer cost is NOT confirmed (blocks PR #107 switch)."
   ],
   "live_vendor_check": [
    "Confirm whether portal has one control-side field or separate tilt/lift sides",
    "Confirm full headrail list (Round Cassette seen; Curved/Flat/No Drill in repo)",
    "Confirm cord-loop chain choices",
    "Confirm min flush depth",
    "Confirm size limits per control"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 12-~120 (confirm)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo sheerview-configuration.ts + H-Sheerview guide; no size error at 39x95 on portal",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 12-~120 (confirm)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo sheerview-configuration.ts + H-Sheerview guide; no size error at 39x95 on portal",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "portal labels like 'NW 2 BRIGHT WHITE RD-S50PN100D' / 'NW 2 BRIGHT WHITE LF-S50PN100'; 59 mapped portal rows",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); repo sheerview-assortment.source.json",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Fabric (vane size + light control + color)",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "vane_size",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "2\" | 2.5\" | 3\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "buttons; filters fabric list",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Sheerview form: Vane Size 2/2.5/3; Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": "(encoded in fabric label)",
     "label": "vane_size",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "light_control",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Light Filtering (LF) | Room Darkening (RD)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "buttons; filters fabric list",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": "(encoded in fabric label LF-/RD-)",
     "label": "light_control",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "headrail",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Sheerview Plus Round Cassette (portal); repo: Curved | Flat Square | No Drill; web form: Curved (std, fabric-wrapped) | Flat (metal only) | Metal",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); repo src/lib/quote/sundance/sheerview-configuration.ts; web-sourced: sundancedecor.com/order-forms Sheerview form",
     "required": "always",
     "portal_label": "Headrail / Cassette",
     "label": "headrail",
     "confidence": "portal_observed",
     "needs_live_form_check": true
    },
    {
     "key": "headrail_finish",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "default S113 Snow White; flat finishes LD-322 Beige, LD-L334 Pecan, LD-S113 White, LD-S302 Sesame, LD-S378 Cocoa, LD-S414 Cornsilk, LD-S503 Dolphin Gray, LD-S823 Rattan, LD-V110 Night Sky, LD-V113 Blueberry, LD-ZY090 Sage",
     "conditional": "default auto-fills; ask only if not default",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "headrail"
     ],
     "screen_rule": "ask on a later screen than: headrail",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); repo src/lib/quote/sundance/sheerview-configuration.ts",
     "required": "conditional",
     "portal_label": "Hardware / cassette color",
     "label": "headrail_finish",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "control",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Cordless | Continuous Cord Loop | Rechargeable Motor with Wand (portal motors: SIMPHONY 30 Li-On +$180 base; SONESSE 30 Somfy rechargeable +$250)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); repo src/lib/quote/sundance/sheerview-configuration.ts",
     "required": "always",
     "portal_label": "Lift / Control / Motor Type",
     "label": "control",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "motor_type",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "SIMPHONY 30 Li-On MOTOR (Rechargeable) | SONESSE 30 Somfy rechargeable",
     "conditional": "control = motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "conditional",
     "portal_label": "Motor Type",
     "label": "motor_type",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "cord_option",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Cord | Metal Chain | Plastic Chain | Safe Wand",
     "conditional": "control = Continuous Cord Loop",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/sheerview-configuration.ts; web-sourced: sundancedecor.com/order-forms Sheerview form: Safe Wand/Metal",
     "required": "conditional",
     "portal_label": "Lift option",
     "label": "cord_option",
     "confidence": "repo_validator",
     "needs_live_form_check": true
    },
    {
     "key": "control_side",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "buttons (web form has separate tilt and lift side — confirm portal has one or two)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); web-sourced: sundancedecor.com/order-forms Sheerview form: Tilt L/R, Lift L/R",
     "required": "always",
     "portal_label": "control right / Tilt L/R, Lift L/R",
     "label": "control_side",
     "confidence": "portal_observed",
     "needs_live_form_check": true
    },
    {
     "key": "charger",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Simphony Charger (portal selects; no separate price shown)",
     "conditional": "motorized; one per order may suffice — portal auto-selected on 1 of 4 lines",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "conditional",
     "portal_label": "Charger",
     "label": "charger",
     "confidence": "portal_observed",
     "needs_live_form_check": true
    },
    {
     "key": "remote_control",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "portal offers only 'No' on SHEERVIEW PLUS",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "conditional",
     "portal_label": "Remote Control",
     "label": "remote_control",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "mount_depth_flush",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches (1/8\"); guide 3.7\" flat / 4.2\" curved — not shown on portal",
     "conditional": "Inside mount; needed to promise flush",
     "free_form": false,
     "button_stand_in": "buttons: Flush | Partial recess, then depth keypad",
     "depends_on": [
      "mount_type",
      "headrail"
     ],
     "screen_rule": "ask on a later screen than: mount_type, headrail",
     "source": "public Sheerview guide via bot transcript",
     "required": "conditional",
     "portal_label": null,
     "label": "mount_depth_flush",
     "confidence": "web_price_guide",
     "needs_live_form_check": true
    },
    {
     "key": "line_note",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_zebra",
   "product_name": "Sundance Caress Zebra",
   "quote_product_type": "Sheer Shades",
   "portal_ordering_type": "Caress-Zebra",
   "quoted_designs_in_crm": 2,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 17,
   "required_line_fields": 11,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "chain_color",
    "cassette_color",
    "charger_qty",
    "remote_qty"
   ],
   "status": "gaps",
   "flags": [
    "Conflict: the order bot reported CARESS-ZEBRA has 'no cassette option' on the portal, but the repo and web form list 2 cassettes.",
    "Zebra sizes 16-96\" height; max width 96\"."
   ],
   "live_vendor_check": [
    "Confirm cassette menu on CARESS-ZEBRA (bot saw none)",
    "Confirm control list and motor names as labeled on portal",
    "Confirm accessory fields are per line or per order"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 10-29 (by control)-96\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 16-96\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "77 portal rows, all mapped (Sundance 75 colors + Louvolite Vision); e.g. ORLANDO BLACKOUT BL2901",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Fabric/collection + color",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "control",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Beaded Chain | Cordless (+45) | Somfy Sonesse Ultra 30 WireFree RTS Li-ion | Somfy Sonesse 30 RTS 24V DC | Alpha Motor 30 2Nm Li-ion | Alpha Motor 30 3Nm Li-ion | Alpha Motor 40 5Nm Li-ion | Simphony Motor 2Nm Li-ion | Quiet Touch Wand",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts; web-sourced: sundancedecor.com/order-forms Zebra form: Chain | Cordless | Motorized",
     "required": "always",
     "portal_label": "Control / Motor Type",
     "label": "control",
     "confidence": "repo_validator",
     "needs_live_form_check": true
    },
    {
     "key": "chain_color",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Ivory | Gray | Bronze | Black | Nickel Plated | Stainless Steel (default color-coordinated)",
     "conditional": "control = Beaded Chain",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts; web-sourced: sundancedecor.com/order-forms Zebra form footnote 2",
     "required": "conditional",
     "portal_label": "Chain",
     "label": "chain_color",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "control_side",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Zebra form: Left/Right",
     "required": "always",
     "portal_label": "Control L/R",
     "label": "control_side",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "cassette",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "3-inch Small Rounded with Fabric Insert (std 3\" round) | 3-inch Square Aluminum",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts; web-sourced: sundancedecor.com/order-forms Zebra form",
     "required": "always",
     "portal_label": "Cassette",
     "label": "cassette",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "cassette_color",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Ivory | Silver | Bronze | Black",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "cassette"
     ],
     "screen_rule": "ask on a later screen than: cassette",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts; web-sourced: sundancedecor.com/order-forms Zebra form footnote 1",
     "required": "always",
     "portal_label": "Cassette color",
     "label": "cassette_color",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | multi-shade (requires per-shade records)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "alignment_group",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "group label (e.g. 'Pair A') when shades are ordered together for band alignment",
     "conditional": "2+ zebras in same opening/room that must align",
     "free_form": false,
     "button_stand_in": "buttons: None | Pair A | Pair B ...",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/order-alignment.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "alignment_group",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "cutouts",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "cutouts",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "charger_qty",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "Alpha charger / Somfy charger / Simphony charger qty",
     "conditional": "Li-ion motor",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/zebra-accessories.ts; web-sourced: sundancedecor.com/order-forms Zebra form: Charger",
     "required": "conditional",
     "portal_label": "Charger",
     "label": "charger_qty",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "remote_qty",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "Alpha 1/5/16-ch, Situo 1/5, Telis 16, Simphony 15-line ($90), Simphony 6-line wall ($75) — must match motor brand",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/zebra-accessories.ts; portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "conditional",
     "portal_label": "Remote",
     "label": "remote_qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_louvolite_zebra",
   "product_name": "Louvolite Vision (zebra)",
   "quote_product_type": "Sheer Shades",
   "portal_ordering_type": "Caress-Zebra",
   "quoted_designs_in_crm": 1,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 17,
   "required_line_fields": 11,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "chain_color",
    "cassette_color",
    "charger_qty",
    "remote_qty"
   ],
   "status": "gaps",
   "flags": [
    "Conflict: the order bot reported CARESS-ZEBRA has 'no cassette option' on the portal, but the repo and web form list 2 cassettes.",
    "Zebra sizes 16-96\" height; max width 96\"."
   ],
   "live_vendor_check": [
    "Confirm cassette menu on CARESS-ZEBRA (bot saw none)",
    "Confirm control list and motor names as labeled on portal",
    "Confirm accessory fields are per line or per order"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 10-29 (by control)-96\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 16-96\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "77 portal rows, all mapped (Sundance 75 colors + Louvolite Vision); e.g. ORLANDO BLACKOUT BL2901",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Fabric/collection + color",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "control",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Beaded Chain | Cordless (+45) | Somfy Sonesse Ultra 30 WireFree RTS Li-ion | Somfy Sonesse 30 RTS 24V DC | Alpha Motor 30 2Nm Li-ion | Alpha Motor 30 3Nm Li-ion | Alpha Motor 40 5Nm Li-ion | Simphony Motor 2Nm Li-ion | Quiet Touch Wand",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts; web-sourced: sundancedecor.com/order-forms Zebra form: Chain | Cordless | Motorized",
     "required": "always",
     "portal_label": "Control / Motor Type",
     "label": "control",
     "confidence": "repo_validator",
     "needs_live_form_check": true
    },
    {
     "key": "chain_color",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Ivory | Gray | Bronze | Black | Nickel Plated | Stainless Steel (default color-coordinated)",
     "conditional": "control = Beaded Chain",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts; web-sourced: sundancedecor.com/order-forms Zebra form footnote 2",
     "required": "conditional",
     "portal_label": "Chain",
     "label": "chain_color",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "control_side",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Zebra form: Left/Right",
     "required": "always",
     "portal_label": "Control L/R",
     "label": "control_side",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "cassette",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "3-inch Small Rounded with Fabric Insert (std 3\" round) | 3-inch Square Aluminum",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts; web-sourced: sundancedecor.com/order-forms Zebra form",
     "required": "always",
     "portal_label": "Cassette",
     "label": "cassette",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "cassette_color",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Ivory | Silver | Bronze | Black",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "cassette"
     ],
     "screen_rule": "ask on a later screen than: cassette",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts; web-sourced: sundancedecor.com/order-forms Zebra form footnote 1",
     "required": "always",
     "portal_label": "Cassette color",
     "label": "cassette_color",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | multi-shade (requires per-shade records)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "alignment_group",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "group label (e.g. 'Pair A') when shades are ordered together for band alignment",
     "conditional": "2+ zebras in same opening/room that must align",
     "free_form": false,
     "button_stand_in": "buttons: None | Pair A | Pair B ...",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/order-alignment.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "alignment_group",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "cutouts",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/zebra-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "cutouts",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "charger_qty",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "Alpha charger / Somfy charger / Simphony charger qty",
     "conditional": "Li-ion motor",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/zebra-accessories.ts; web-sourced: sundancedecor.com/order-forms Zebra form: Charger",
     "required": "conditional",
     "portal_label": "Charger",
     "label": "charger_qty",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "remote_qty",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "Alpha 1/5/16-ch, Situo 1/5, Telis 16, Simphony 15-line ($90), Simphony 6-line wall ($75) — must match motor brand",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/zebra-accessories.ts; portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "conditional",
     "portal_label": "Remote",
     "label": "remote_qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_roller",
   "product_name": "Sundance roller shade",
   "quote_product_type": "Roller Shades",
   "portal_ordering_type": "Clutch Roller / Motorized Roller",
   "quoted_designs_in_crm": 12,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 26,
   "required_line_fields": 13,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "chain_color",
    "top_finish",
    "fabric_insert",
    "bottomrail_color",
    "tube",
    "railroad",
    "privacy_color",
    "privacy_length",
    "dual_bracket",
    "remote",
    "charger_power"
   ],
   "status": "gaps",
   "flags": [
    "Portal has two separate order types: 'Clutch Roller' (manual) and 'Motorized Roller' — Quoter must route by control.",
    "185 of 518 portal fabric rows unresolved (identity/source exception)."
   ],
   "live_vendor_check": [
    "Confirm exact portal option names for top treatment, bottomrail, tube, privacy",
    "Confirm accessories are line-level on portal"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-31 (by control)-96-196 (by control)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 13-96-150 (by control)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Clutch/Motorized Roller: 518 portal rows each (333 mapped, 185 unresolved)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); web-sourced: sundancedecor.com/order-forms Roller form: Fabric Name/Color",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Fabric name + color",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "control",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Beaded Chain | Cordless (+38, 12-96\") | Spring Assist Clutch | 3-to-1 Clutch | Somfy Roll Up 28 RTS V2 | Somfy Sonesse Ultra 30 Li-ion | Somfy Sonesse 30 RTS 24V DC | Somfy Sonesse 40 Li-ion | Somfy Sonesse 40 110V | Somfy Sonesse 50 110V | Alpha 30 2Nm / 30 3Nm / 40 5Nm Li-ion | Simphony 30 2Nm Li-ion | Simphony 40 3Nm Li-ion | Simphony 24V DC | Simphony 40 6Nm 110V | Simphony 50 20Nm 110V",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; web-sourced: sundancedecor.com/order-forms Roller form",
     "required": "always",
     "portal_label": "Control (Clutch | Cordless | Motorized); portal splits into 'Clutch Roller' vs 'Motorized Roller' order types",
     "label": "control",
     "confidence": "repo_validator",
     "needs_live_form_check": true
    },
    {
     "key": "control_side",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Roller form",
     "required": "always",
     "portal_label": "Control Left/Right",
     "label": "control_side",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "chain_color",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Ivory | Gray | Bronze | Black | Nickel Plated | Stainless Steel (default coordinated)",
     "conditional": "control = Beaded Chain / clutch",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; web-sourced: sundancedecor.com/order-forms Roller form footnote 2",
     "required": "conditional",
     "portal_label": null,
     "label": "chain_color",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "roll",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard | Reverse",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Roller form",
     "required": "always",
     "portal_label": "Roll: Regular (Std) | Reverse",
     "label": "roll",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "top_treatment",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Open roll | Fascia 3\" / 4\" / 5\" | 5\" Contractor's box | 3\" Sm round cassette | 4\" Lg round cassette | 3\" Square cassette | 4\" Tuscany",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "Reverse roll only with Open roll or Fascia 5\"",
     "source": "web-sourced: sundancedecor.com/order-forms Roller form; repo shade-option-schedules.source.json",
     "required": "always",
     "portal_label": "Fascia / Cassette",
     "label": "top_treatment",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "top_finish",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Ivory | Silver | Bronze | Black (Contractor's box: White | Silver)",
     "conditional": "top_treatment != Open roll",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "top_treatment"
     ],
     "screen_rule": "ask on a later screen than: top_treatment",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; web-sourced: sundancedecor.com/order-forms Roller form footnote 1",
     "required": "conditional",
     "portal_label": null,
     "label": "top_finish",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_insert",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Y | N",
     "conditional": "top_treatment = Small/Large Round Cassette",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "top_treatment"
     ],
     "screen_rule": "ask on a later screen than: top_treatment",
     "source": "web-sourced: sundancedecor.com/order-forms Roller form",
     "required": "conditional",
     "portal_label": "Fabric insert (Y/N)",
     "label": "fabric_insert",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "bottomrail",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Hem Pocket (default) | Exposed | Wrap-around | Enhanced Fabric-Wrapped",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Roller form; repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "Bottomrail",
     "label": "bottomrail",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "bottomrail_color",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Ivory | Silver | Bronze | Black",
     "conditional": "bottomrail = Exposed",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "bottomrail"
     ],
     "screen_rule": "ask on a later screen than: bottomrail",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "bottomrail_color",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "tube",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard | 2½-inch | 3¼-inch",
     "conditional": "motorized; oversize tube mandatory for Sonesse 40/50, Simphony 40/50, Alpha 40",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "tube",
     "confidence": "repo_validator",
     "needs_live_form_check": true
    },
    {
     "key": "hold_down",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "hold_down",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "railroad",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No (only fabrics documented as railroadable)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "fabric_color",
      "width"
     ],
     "screen_rule": "ask on a later screen than: fabric_color, width",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "railroad",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "privacy",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Aluminum side channels | Solar bar",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/privacy-pieces.ts",
     "required": "optional",
     "portal_label": null,
     "label": "privacy",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "privacy_color",
     "ask_order": 20,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "side channels: White | Silver | Black; solar bar: White | Ivory | Gray | Bronze | Black",
     "conditional": "privacy != None",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "privacy"
     ],
     "screen_rule": "ask on a later screen than: privacy",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "privacy_color",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "privacy_length",
     "ask_order": 21,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "feet/inches per piece",
     "conditional": "privacy != None",
     "free_form": false,
     "button_stand_in": "defaults to shade height x2 (channels) / width (solar bar), confirm",
     "depends_on": [
      "privacy"
     ],
     "screen_rule": "ask on a later screen than: privacy",
     "source": "repo src/lib/quote/sundance/privacy-pieces.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "privacy_length",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 22,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one | Dual independent | Coupled motorized",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "non-Single needs per-shade records + Special Instructions",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "dual_bracket",
     "ask_order": 23,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Vertical | Small 45-degree | Large 45-degree",
     "conditional": "assembly = Dual independent (vertical open-roll = inside mount only)",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "assembly"
     ],
     "screen_rule": "ask on a later screen than: assembly",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "dual_bracket",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "remote",
     "ask_order": 24,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Situo 1/5, Situo 5 Variation, Telis 16, Decoflex 1/5, Smoove 1/multi, TaHoma; Alpha 1/5/16, Alpha 8 wall, Alpha Neo Hub; Simphony 15-ch, 6-ch wall, Hub; Bond Bridge",
     "conditional": "motorized; must match motor brand",
     "free_form": false,
     "button_stand_in": "multi-select with qty",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; web-sourced: sundancedecor.com/order-forms Roller form: Remote",
     "required": "conditional",
     "portal_label": "Remote",
     "label": "remote",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "charger_power",
     "ask_order": 25,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Somfy Li-ion V2 charger | Somfy 24V supply | Somfy 12V supply | Somfy battery | Somfy solar kit | Alpha charger/battery | Simphony charger/solar | Simphony 24V transformer | Simphony 24V distribution box (18-motor, order-level)",
     "conditional": "motor power type",
     "free_form": false,
     "button_stand_in": "multi-select with qty",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; repo src/lib/quote/sundance/order-power.ts",
     "required": "conditional",
     "portal_label": "Charger",
     "label": "charger_power",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 26,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_louvolite_roller",
   "product_name": "Louvolite roller shade",
   "quote_product_type": "Roller Shades",
   "portal_ordering_type": "Clutch Roller / Motorized Roller",
   "quoted_designs_in_crm": 2,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 26,
   "required_line_fields": 13,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "chain_color",
    "top_finish",
    "fabric_insert",
    "bottomrail_color",
    "tube",
    "railroad",
    "privacy_color",
    "privacy_length",
    "dual_bracket",
    "remote",
    "charger_power"
   ],
   "status": "gaps",
   "flags": [
    "Portal has two separate order types: 'Clutch Roller' (manual) and 'Motorized Roller' — Quoter must route by control.",
    "185 of 518 portal fabric rows unresolved (identity/source exception)."
   ],
   "live_vendor_check": [
    "Confirm exact portal option names for top treatment, bottomrail, tube, privacy",
    "Confirm accessories are line-level on portal"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-31 (by control)-96-196 (by control)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 13-96-150 (by control)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Clutch/Motorized Roller: 518 portal rows each (333 mapped, 185 unresolved)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); web-sourced: sundancedecor.com/order-forms Roller form: Fabric Name/Color",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Fabric name + color",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "control",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Beaded Chain | Cordless (+38, 12-96\") | Spring Assist Clutch | 3-to-1 Clutch | Somfy Roll Up 28 RTS V2 | Somfy Sonesse Ultra 30 Li-ion | Somfy Sonesse 30 RTS 24V DC | Somfy Sonesse 40 Li-ion | Somfy Sonesse 40 110V | Somfy Sonesse 50 110V | Alpha 30 2Nm / 30 3Nm / 40 5Nm Li-ion | Simphony 30 2Nm Li-ion | Simphony 40 3Nm Li-ion | Simphony 24V DC | Simphony 40 6Nm 110V | Simphony 50 20Nm 110V",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; web-sourced: sundancedecor.com/order-forms Roller form",
     "required": "always",
     "portal_label": "Control (Clutch | Cordless | Motorized); portal splits into 'Clutch Roller' vs 'Motorized Roller' order types",
     "label": "control",
     "confidence": "repo_validator",
     "needs_live_form_check": true
    },
    {
     "key": "control_side",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Roller form",
     "required": "always",
     "portal_label": "Control Left/Right",
     "label": "control_side",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "chain_color",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Ivory | Gray | Bronze | Black | Nickel Plated | Stainless Steel (default coordinated)",
     "conditional": "control = Beaded Chain / clutch",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; web-sourced: sundancedecor.com/order-forms Roller form footnote 2",
     "required": "conditional",
     "portal_label": null,
     "label": "chain_color",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "roll",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard | Reverse",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Roller form",
     "required": "always",
     "portal_label": "Roll: Regular (Std) | Reverse",
     "label": "roll",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "top_treatment",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Open roll | Fascia 3\" / 4\" / 5\" | 5\" Contractor's box | 3\" Sm round cassette | 4\" Lg round cassette | 3\" Square cassette | 4\" Tuscany",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "Reverse roll only with Open roll or Fascia 5\"",
     "source": "web-sourced: sundancedecor.com/order-forms Roller form; repo shade-option-schedules.source.json",
     "required": "always",
     "portal_label": "Fascia / Cassette",
     "label": "top_treatment",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "top_finish",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Ivory | Silver | Bronze | Black (Contractor's box: White | Silver)",
     "conditional": "top_treatment != Open roll",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "top_treatment"
     ],
     "screen_rule": "ask on a later screen than: top_treatment",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; web-sourced: sundancedecor.com/order-forms Roller form footnote 1",
     "required": "conditional",
     "portal_label": null,
     "label": "top_finish",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_insert",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Y | N",
     "conditional": "top_treatment = Small/Large Round Cassette",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "top_treatment"
     ],
     "screen_rule": "ask on a later screen than: top_treatment",
     "source": "web-sourced: sundancedecor.com/order-forms Roller form",
     "required": "conditional",
     "portal_label": "Fabric insert (Y/N)",
     "label": "fabric_insert",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "bottomrail",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Hem Pocket (default) | Exposed | Wrap-around | Enhanced Fabric-Wrapped",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Roller form; repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "Bottomrail",
     "label": "bottomrail",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "bottomrail_color",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Ivory | Silver | Bronze | Black",
     "conditional": "bottomrail = Exposed",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "bottomrail"
     ],
     "screen_rule": "ask on a later screen than: bottomrail",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "bottomrail_color",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "tube",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard | 2½-inch | 3¼-inch",
     "conditional": "motorized; oversize tube mandatory for Sonesse 40/50, Simphony 40/50, Alpha 40",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "tube",
     "confidence": "repo_validator",
     "needs_live_form_check": true
    },
    {
     "key": "hold_down",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "hold_down",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "railroad",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No (only fabrics documented as railroadable)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "fabric_color",
      "width"
     ],
     "screen_rule": "ask on a later screen than: fabric_color, width",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "railroad",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "privacy",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Aluminum side channels | Solar bar",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/privacy-pieces.ts",
     "required": "optional",
     "portal_label": null,
     "label": "privacy",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "privacy_color",
     "ask_order": 20,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "side channels: White | Silver | Black; solar bar: White | Ivory | Gray | Bronze | Black",
     "conditional": "privacy != None",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "privacy"
     ],
     "screen_rule": "ask on a later screen than: privacy",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "privacy_color",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "privacy_length",
     "ask_order": 21,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "feet/inches per piece",
     "conditional": "privacy != None",
     "free_form": false,
     "button_stand_in": "defaults to shade height x2 (channels) / width (solar bar), confirm",
     "depends_on": [
      "privacy"
     ],
     "screen_rule": "ask on a later screen than: privacy",
     "source": "repo src/lib/quote/sundance/privacy-pieces.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "privacy_length",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 22,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one | Dual independent | Coupled motorized",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "non-Single needs per-shade records + Special Instructions",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "dual_bracket",
     "ask_order": 23,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Vertical | Small 45-degree | Large 45-degree",
     "conditional": "assembly = Dual independent (vertical open-roll = inside mount only)",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "assembly"
     ],
     "screen_rule": "ask on a later screen than: assembly",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "dual_bracket",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "remote",
     "ask_order": 24,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Situo 1/5, Situo 5 Variation, Telis 16, Decoflex 1/5, Smoove 1/multi, TaHoma; Alpha 1/5/16, Alpha 8 wall, Alpha Neo Hub; Simphony 15-ch, 6-ch wall, Hub; Bond Bridge",
     "conditional": "motorized; must match motor brand",
     "free_form": false,
     "button_stand_in": "multi-select with qty",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; web-sourced: sundancedecor.com/order-forms Roller form: Remote",
     "required": "conditional",
     "portal_label": "Remote",
     "label": "remote",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "charger_power",
     "ask_order": 25,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Somfy Li-ion V2 charger | Somfy 24V supply | Somfy 12V supply | Somfy battery | Somfy solar kit | Alpha charger/battery | Simphony charger/solar | Simphony 24V transformer | Simphony 24V distribution box (18-motor, order-level)",
     "conditional": "motor power type",
     "free_form": false,
     "button_stand_in": "multi-select with qty",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; repo src/lib/quote/sundance/order-power.ts",
     "required": "conditional",
     "portal_label": "Charger",
     "label": "charger_power",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 26,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_flat_roman",
   "product_name": "Sundance flat Roman (fabric)",
   "quote_product_type": "Roman Shades",
   "portal_ordering_type": "NONE (no dedicated flat-Roman ordering type on portal)",
   "quoted_designs_in_crm": 1,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 16,
   "required_line_fields": 11,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "chain_color",
    "railroad",
    "remote",
    "charger_power"
   ],
   "status": "blocked",
   "flags": [
    "BLOCKED: current dealer portal has no flat-Roman ordering type; repo hard-blocks 'confirm current orderability'.",
    "No lining on flat Roman; cordless blackout max 84x84."
   ],
   "live_vendor_check": [
    "Ask Sundance whether flat Roman is still orderable and under which portal type"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-31 (by control)-96-196 (by control)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-96-150 (by control)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Clutch/Motorized Roller: 518 portal rows each (333 mapped, 185 unresolved)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); web-sourced: sundancedecor.com/order-forms Roller form: Fabric Name/Color",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Fabric name + color",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "control",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Beaded Chain | Cordless | Somfy Sonesse Ultra 30 Li-ion | Somfy Sonesse 30 RTS 24V DC | Somfy Sonesse 40 Li-ion | Somfy Sonesse 40 110V | Alpha 30/40 | Simphony 30 2Nm Li-ion",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; web-sourced: sundancedecor.com/order-forms Roller form",
     "required": "always",
     "portal_label": "Control (Clutch | Cordless | Motorized); portal splits into 'Clutch Roller' vs 'Motorized Roller' order types",
     "label": "control",
     "confidence": "repo_validator",
     "needs_live_form_check": true
    },
    {
     "key": "control_side",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Roller form",
     "required": "always",
     "portal_label": "Control Left/Right",
     "label": "control_side",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "chain_color",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Ivory | Gray | Bronze | Black | Nickel Plated | Stainless Steel (default coordinated)",
     "conditional": "control = Beaded Chain / clutch",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; web-sourced: sundancedecor.com/order-forms Roller form footnote 2",
     "required": "conditional",
     "portal_label": null,
     "label": "chain_color",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "hold_down",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "hold_down",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "railroad",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No (only fabrics documented as railroadable)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "fabric_color",
      "width"
     ],
     "screen_rule": "ask on a later screen than: fabric_color, width",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "railroad",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one | Dual independent | Coupled motorized",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "non-Single needs per-shade records + Special Instructions",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "remote",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Situo 1/5, Situo 5 Variation, Telis 16, Decoflex 1/5, Smoove 1/multi, TaHoma; Alpha 1/5/16, Alpha 8 wall, Alpha Neo Hub; Simphony 15-ch, 6-ch wall, Hub; Bond Bridge",
     "conditional": "motorized; must match motor brand",
     "free_form": false,
     "button_stand_in": "multi-select with qty",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; web-sourced: sundancedecor.com/order-forms Roller form: Remote",
     "required": "conditional",
     "portal_label": "Remote",
     "label": "remote",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "charger_power",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Somfy Li-ion V2 charger | Somfy 24V supply | Somfy 12V supply | Somfy battery | Somfy solar kit | Alpha charger/battery | Simphony charger/solar | Simphony 24V transformer | Simphony 24V distribution box (18-motor, order-level)",
     "conditional": "motor power type",
     "free_form": false,
     "button_stand_in": "multi-select with qty",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; repo src/lib/quote/sundance/order-power.ts",
     "required": "conditional",
     "portal_label": "Charger",
     "label": "charger_power",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "valance",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Rounded-corner valance",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_louvolite_flat_roman",
   "product_name": "Louvolite flat Roman",
   "quote_product_type": "Roman Shades",
   "portal_ordering_type": "NONE (no dedicated flat-Roman ordering type on portal)",
   "quoted_designs_in_crm": 1,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 16,
   "required_line_fields": 11,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "chain_color",
    "railroad",
    "remote",
    "charger_power"
   ],
   "status": "blocked",
   "flags": [
    "BLOCKED: current dealer portal has no flat-Roman ordering type; repo hard-blocks 'confirm current orderability'.",
    "No lining on flat Roman; cordless blackout max 84x84."
   ],
   "live_vendor_check": [
    "Ask Sundance whether flat Roman is still orderable and under which portal type"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-31 (by control)-96-196 (by control)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-96-150 (by control)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Clutch/Motorized Roller: 518 portal rows each (333 mapped, 185 unresolved)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); web-sourced: sundancedecor.com/order-forms Roller form: Fabric Name/Color",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Fabric name + color",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "control",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Beaded Chain | Cordless | Somfy Sonesse Ultra 30 Li-ion | Somfy Sonesse 30 RTS 24V DC | Somfy Sonesse 40 Li-ion | Somfy Sonesse 40 110V | Alpha 30/40 | Simphony 30 2Nm Li-ion",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; web-sourced: sundancedecor.com/order-forms Roller form",
     "required": "always",
     "portal_label": "Control (Clutch | Cordless | Motorized); portal splits into 'Clutch Roller' vs 'Motorized Roller' order types",
     "label": "control",
     "confidence": "repo_validator",
     "needs_live_form_check": true
    },
    {
     "key": "control_side",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Roller form",
     "required": "always",
     "portal_label": "Control Left/Right",
     "label": "control_side",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "chain_color",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Ivory | Gray | Bronze | Black | Nickel Plated | Stainless Steel (default coordinated)",
     "conditional": "control = Beaded Chain / clutch",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; web-sourced: sundancedecor.com/order-forms Roller form footnote 2",
     "required": "conditional",
     "portal_label": null,
     "label": "chain_color",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "hold_down",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "hold_down",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "railroad",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No (only fabrics documented as railroadable)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "fabric_color",
      "width"
     ],
     "screen_rule": "ask on a later screen than: fabric_color, width",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "railroad",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one | Dual independent | Coupled motorized",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "non-Single needs per-shade records + Special Instructions",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "remote",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Situo 1/5, Situo 5 Variation, Telis 16, Decoflex 1/5, Smoove 1/multi, TaHoma; Alpha 1/5/16, Alpha 8 wall, Alpha Neo Hub; Simphony 15-ch, 6-ch wall, Hub; Bond Bridge",
     "conditional": "motorized; must match motor brand",
     "free_form": false,
     "button_stand_in": "multi-select with qty",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; web-sourced: sundancedecor.com/order-forms Roller form: Remote",
     "required": "conditional",
     "portal_label": "Remote",
     "label": "remote",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "charger_power",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Somfy Li-ion V2 charger | Somfy 24V supply | Somfy 12V supply | Somfy battery | Somfy solar kit | Alpha charger/battery | Simphony charger/solar | Simphony 24V transformer | Simphony 24V distribution box (18-motor, order-level)",
     "conditional": "motor power type",
     "free_form": false,
     "button_stand_in": "multi-select with qty",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts; repo src/lib/quote/sundance/order-power.ts",
     "required": "conditional",
     "portal_label": "Charger",
     "label": "charger_power",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "valance",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Rounded-corner valance",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_europanels",
   "product_name": "Sundance Europanel",
   "quote_product_type": "Vertical Blinds",
   "portal_ordering_type": "Euro Panel",
   "quoted_designs_in_crm": 1,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 13,
   "required_line_fields": 11,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "track_channels",
    "panel_layout"
   ],
   "status": "gaps",
   "flags": [
    "Mount conflict: spec says outside only, order form shows Inside box.",
    "298 of 518 portal fabric rows unresolved."
   ],
   "live_vendor_check": [
    "Confirm inside mount availability",
    "Confirm channel count field and panel-width rule"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-180\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-120\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Outside only (spec) — form shows Inside/Outside",
     "conditional": "Repo blocks Inside; confirm",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "518 portal rows (220 mapped, 298 unresolved)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Fabric name + color",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "panel_count",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "2 | 3 | 4 | 5",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Europanel form; repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "# of panels",
     "label": "panel_count",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "track_channels",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "4 | 5 (Soft White headrail)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "panel_count"
     ],
     "screen_rule": "ask on a later screen than: panel_count",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "track_channels",
     "confidence": "repo_validator",
     "needs_live_form_check": true
    },
    {
     "key": "wand_side",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Europanel form",
     "required": "always",
     "portal_label": "Wand",
     "label": "wand_side",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "draw",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "1-way Left | 1-way Right",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Europanel form",
     "required": "always",
     "portal_label": "Draw",
     "label": "draw",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "valance",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Round",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Europanel form",
     "required": "always",
     "portal_label": "Valance",
     "label": "valance",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "panel_layout",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "per-panel width/channel records",
     "conditional": "if panels are not equal-split; no overlap formula published",
     "free_form": false,
     "button_stand_in": "default 'equal split' button",
     "depends_on": [
      "panel_count",
      "width"
     ],
     "screen_rule": "ask on a later screen than: panel_count, width",
     "source": "repo src/lib/quote/sundance/europanel-layout.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "panel_layout",
     "confidence": "repo_validator",
     "needs_live_form_check": true
    },
    {
     "key": "line_note",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_louvolite_europanels",
   "product_name": "Louvolite Europanel",
   "quote_product_type": "Vertical Blinds",
   "portal_ordering_type": "Euro Panel",
   "quoted_designs_in_crm": 1,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 13,
   "required_line_fields": 11,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "track_channels",
    "panel_layout"
   ],
   "status": "gaps",
   "flags": [
    "Mount conflict: spec says outside only, order form shows Inside box.",
    "298 of 518 portal fabric rows unresolved."
   ],
   "live_vendor_check": [
    "Confirm inside mount availability",
    "Confirm channel count field and panel-width rule"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-180\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-120\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Outside only (spec) — form shows Inside/Outside",
     "conditional": "Repo blocks Inside; confirm",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "518 portal rows (220 mapped, 298 unresolved)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Fabric name + color",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "panel_count",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "2 | 3 | 4 | 5",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Europanel form; repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": "# of panels",
     "label": "panel_count",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "track_channels",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "4 | 5 (Soft White headrail)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "panel_count"
     ],
     "screen_rule": "ask on a later screen than: panel_count",
     "source": "repo src/lib/quote/sundance/shade-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "track_channels",
     "confidence": "repo_validator",
     "needs_live_form_check": true
    },
    {
     "key": "wand_side",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Europanel form",
     "required": "always",
     "portal_label": "Wand",
     "label": "wand_side",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "draw",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "1-way Left | 1-way Right",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Europanel form",
     "required": "always",
     "portal_label": "Draw",
     "label": "draw",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "valance",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Round",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Europanel form",
     "required": "always",
     "portal_label": "Valance",
     "label": "valance",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "panel_layout",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "per-panel width/channel records",
     "conditional": "if panels are not equal-split; no overlap formula published",
     "free_form": false,
     "button_stand_in": "default 'equal split' button",
     "depends_on": [
      "panel_count",
      "width"
     ],
     "screen_rule": "ask on a later screen than: panel_count, width",
     "source": "repo src/lib/quote/sundance/europanel-layout.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "panel_layout",
     "confidence": "repo_validator",
     "needs_live_form_check": true
    },
    {
     "key": "line_note",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_cellular",
   "product_name": "Sundance cellular (honeycomb) shade",
   "quote_product_type": "Honeycomb Shades",
   "portal_ordering_type": "Cellular Shade",
   "quoted_designs_in_crm": 10,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 25,
   "required_line_fields": 10,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "template_reference",
    "line_note"
   ],
   "dependent_fields": [
    "headrail_color",
    "recess",
    "mount_depth",
    "bottom_fabric",
    "verticell_stack",
    "motor_type",
    "charger",
    "solar_panel",
    "remote",
    "shape",
    "shape_geometry",
    "shape_sides",
    "template_reference"
   ],
   "status": "gaps",
   "flags": [
    "Real order 88195 (Shellie Lesser) entered this type — ack labels used.",
    "Verticell and specialty shapes are separate catalog ids but same portal type."
   ],
   "live_vendor_check": [
    "Confirm Lift Option / Headrail Type menu names vs repo system names",
    "Confirm remote menu"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 9-36 (by system)-50-120 (by system)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 10-48-120 (by system)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "157 portal rows (148 mapped); e.g. 7S-012 (PS4) COCOA 3/4 SLUB WOVEN",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Fabric name + color # (cell size + opacity)",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "light_control",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Light Filtering | Blackout",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "filters fabric list",
     "depends_on": [],
     "screen_rule": "",
     "source": "Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": null,
     "label": "light_control",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "system",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Cordless | Cordless Top Down/Bottom Up | Cordless Day/Night | Cordloop | Skylight | Verticell | Somfy Cord Lift WireFree TL25 | Simphony Cell Shade WireFree | Simphony Concerto TDBU | Specialty Shape",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts; Sundance acknowledgement PDFs 86118/88195 (box /workspace); web-sourced: sundancedecor.com/order-forms Cellular form",
     "required": "always",
     "portal_label": "Lift Option / Headrail Type (ack: 'Cordless Top Down bottom Up', 'Cordless Headrail (1)')",
     "label": "system",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "headrail_color",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "match fabric (e.g. '012 Cocoa'); Skylight White #001; Verticell Off White",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "default = matching color (one tap)",
     "depends_on": [
      "fabric_color",
      "system"
     ],
     "screen_rule": "ask on a later screen than: fabric_color, system",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "always",
     "portal_label": "CS HR Color",
     "label": "headrail_color",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "recess",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Flush | Partial recess",
     "conditional": "mount = Inside",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "recess",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_depth",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches (1/8\")",
     "conditional": "mount = Inside",
     "free_form": false,
     "button_stand_in": "depth buttons 1\",1.5\",2\",2.5\",3\"+ keypad",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "mount_depth",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "bottom_fabric",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "blackout fabric code (second fabric)",
     "conditional": "system = Cordless Day/Night",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "system"
     ],
     "screen_rule": "ask on a later screen than: system",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "bottom_fabric",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "verticell_stack",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left Stack | Right Stack | Center Split",
     "conditional": "system = Verticell",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "system"
     ],
     "screen_rule": "ask on a later screen than: system",
     "source": "web-sourced: sundancedecor.com/order-forms Cellular form: Left/Right stack, Center split; Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Verticell Shade / stack",
     "label": "verticell_stack",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "motor_type",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "No | Somfy TL25 | Simphony WireFree | Simphony Concerto",
     "conditional": "motorized systems",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "system"
     ],
     "screen_rule": "ask on a later screen than: system",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Motor Type",
     "label": "motor_type",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "charger",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "No | Somfy charger | Charger (Li-On) Ultra Somfy",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Chargers",
     "label": "charger",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "solar_panel",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "No | Yes",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Solar Panel",
     "label": "solar_panel",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "remote",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Situo 1/5 etc. (qty)",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "web-sourced: sundancedecor.com/order-forms Cellular form; Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "conditional",
     "portal_label": "Remote",
     "label": "remote",
     "confidence": "web_order_form",
     "needs_live_form_check": true
    },
    {
     "key": "assembly",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts; web-sourced: sundancedecor.com/order-forms Cellular form: 2-on-1",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "cutouts",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "#",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Cellular form",
     "required": "optional",
     "portal_label": "Cut-Outs (#)",
     "label": "cutouts",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "shape",
     "ask_order": 20,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Arch | Quarter Arch | Circle | Hexagon | Octagon",
     "conditional": "system = Specialty Shape",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "system"
     ],
     "screen_rule": "ask on a later screen than: system",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "shape",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "shape_geometry",
     "ask_order": 21,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Perfect | Non-perfect",
     "conditional": "shape set",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "shape"
     ],
     "screen_rule": "ask on a later screen than: shape",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "shape_geometry",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "shape_sides",
     "ask_order": 22,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "side_1..side_8 in 1/8\" (count by shape)",
     "conditional": "non-perfect shape",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "shape_geometry"
     ],
     "screen_rule": "ask on a later screen than: shape_geometry",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "shape_sides",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "template_reference",
     "ask_order": 23,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "template file ref (must be attached)",
     "conditional": "specialty shape",
     "free_form": true,
     "button_stand_in": "'Template attached' Yes button + file picker",
     "depends_on": [
      "shape"
     ],
     "screen_rule": "ask on a later screen than: shape",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "template_reference",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "motor_size_limit",
     "ask_order": 24,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "portal flag ('Blind Can Be Made')",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "optional",
     "portal_label": "Motor Size Limit",
     "label": "motor_size_limit",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 25,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_verticell",
   "product_name": "Sundance Verticell (vertical cellular)",
   "quote_product_type": "Honeycomb Shades",
   "portal_ordering_type": "Cellular Shade (Verticell Shade = YES)",
   "quoted_designs_in_crm": 0,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 25,
   "required_line_fields": 10,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "template_reference",
    "line_note"
   ],
   "dependent_fields": [
    "headrail_color",
    "recess",
    "mount_depth",
    "bottom_fabric",
    "verticell_stack",
    "motor_type",
    "charger",
    "solar_panel",
    "remote",
    "shape",
    "shape_geometry",
    "shape_sides",
    "template_reference"
   ],
   "status": "gaps",
   "flags": [
    "Verticell 24-120 W x 24-118 H; stack required."
   ],
   "live_vendor_check": [
    "Confirm 'Verticell Shade' toggle drives stack field"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 9-36 (by system)-50-120 (by system)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 10-48-120 (by system)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "157 portal rows (148 mapped); e.g. 7S-012 (PS4) COCOA 3/4 SLUB WOVEN",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Fabric name + color # (cell size + opacity)",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "light_control",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Light Filtering | Blackout",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "filters fabric list",
     "depends_on": [],
     "screen_rule": "",
     "source": "Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": null,
     "label": "light_control",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "system",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Cordless | Cordless Top Down/Bottom Up | Cordless Day/Night | Cordloop | Skylight | Verticell | Somfy Cord Lift WireFree TL25 | Simphony Cell Shade WireFree | Simphony Concerto TDBU | Specialty Shape",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts; Sundance acknowledgement PDFs 86118/88195 (box /workspace); web-sourced: sundancedecor.com/order-forms Cellular form",
     "required": "always",
     "portal_label": "Lift Option / Headrail Type (ack: 'Cordless Top Down bottom Up', 'Cordless Headrail (1)')",
     "label": "system",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "headrail_color",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "match fabric (e.g. '012 Cocoa'); Skylight White #001; Verticell Off White",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "default = matching color (one tap)",
     "depends_on": [
      "fabric_color",
      "system"
     ],
     "screen_rule": "ask on a later screen than: fabric_color, system",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "always",
     "portal_label": "CS HR Color",
     "label": "headrail_color",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "recess",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Flush | Partial recess",
     "conditional": "mount = Inside",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "recess",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_depth",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches (1/8\")",
     "conditional": "mount = Inside",
     "free_form": false,
     "button_stand_in": "depth buttons 1\",1.5\",2\",2.5\",3\"+ keypad",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "mount_depth",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "bottom_fabric",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "blackout fabric code (second fabric)",
     "conditional": "system = Cordless Day/Night",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "system"
     ],
     "screen_rule": "ask on a later screen than: system",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "bottom_fabric",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "verticell_stack",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left Stack | Right Stack | Center Split",
     "conditional": "system = Verticell",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "system"
     ],
     "screen_rule": "ask on a later screen than: system",
     "source": "web-sourced: sundancedecor.com/order-forms Cellular form: Left/Right stack, Center split; Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Verticell Shade / stack",
     "label": "verticell_stack",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "motor_type",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "No | Somfy TL25 | Simphony WireFree | Simphony Concerto",
     "conditional": "motorized systems",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "system"
     ],
     "screen_rule": "ask on a later screen than: system",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Motor Type",
     "label": "motor_type",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "charger",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "No | Somfy charger | Charger (Li-On) Ultra Somfy",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Chargers",
     "label": "charger",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "solar_panel",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "No | Yes",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Solar Panel",
     "label": "solar_panel",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "remote",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Situo 1/5 etc. (qty)",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "web-sourced: sundancedecor.com/order-forms Cellular form; Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "conditional",
     "portal_label": "Remote",
     "label": "remote",
     "confidence": "web_order_form",
     "needs_live_form_check": true
    },
    {
     "key": "assembly",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts; web-sourced: sundancedecor.com/order-forms Cellular form: 2-on-1",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "cutouts",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "#",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Cellular form",
     "required": "optional",
     "portal_label": "Cut-Outs (#)",
     "label": "cutouts",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "shape",
     "ask_order": 20,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Arch | Quarter Arch | Circle | Hexagon | Octagon",
     "conditional": "system = Specialty Shape",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "system"
     ],
     "screen_rule": "ask on a later screen than: system",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "shape",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "shape_geometry",
     "ask_order": 21,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Perfect | Non-perfect",
     "conditional": "shape set",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "shape"
     ],
     "screen_rule": "ask on a later screen than: shape",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "shape_geometry",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "shape_sides",
     "ask_order": 22,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "side_1..side_8 in 1/8\" (count by shape)",
     "conditional": "non-perfect shape",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "shape_geometry"
     ],
     "screen_rule": "ask on a later screen than: shape_geometry",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "shape_sides",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "template_reference",
     "ask_order": 23,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "template file ref (must be attached)",
     "conditional": "specialty shape",
     "free_form": true,
     "button_stand_in": "'Template attached' Yes button + file picker",
     "depends_on": [
      "shape"
     ],
     "screen_rule": "ask on a later screen than: shape",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "template_reference",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "motor_size_limit",
     "ask_order": 24,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "portal flag ('Blind Can Be Made')",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "optional",
     "portal_label": "Motor Size Limit",
     "label": "motor_size_limit",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 25,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_cellular_shapes",
   "product_name": "Sundance cellular specialty shapes",
   "quote_product_type": "Honeycomb Shades",
   "portal_ordering_type": "Cellular Shade (specialty)",
   "quoted_designs_in_crm": 0,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 25,
   "required_line_fields": 10,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "template_reference",
    "line_note"
   ],
   "dependent_fields": [
    "headrail_color",
    "recess",
    "mount_depth",
    "bottom_fabric",
    "verticell_stack",
    "motor_type",
    "charger",
    "solar_panel",
    "remote",
    "shape",
    "shape_geometry",
    "shape_sides",
    "template_reference"
   ],
   "status": "gaps",
   "flags": [
    "Template must be attached and factory-approved; can't be fully button-driven."
   ],
   "live_vendor_check": [
    "Confirm how template is uploaded on portal"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 9-36 (by system)-50-120 (by system)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 10-48-120 (by system)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "157 portal rows (148 mapped); e.g. 7S-012 (PS4) COCOA 3/4 SLUB WOVEN",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Fabric name + color # (cell size + opacity)",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "light_control",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Light Filtering | Blackout",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "filters fabric list",
     "depends_on": [],
     "screen_rule": "",
     "source": "Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": null,
     "label": "light_control",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "system",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Cordless | Cordless Top Down/Bottom Up | Cordless Day/Night | Cordloop | Skylight | Verticell | Somfy Cord Lift WireFree TL25 | Simphony Cell Shade WireFree | Simphony Concerto TDBU | Specialty Shape",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts; Sundance acknowledgement PDFs 86118/88195 (box /workspace); web-sourced: sundancedecor.com/order-forms Cellular form",
     "required": "always",
     "portal_label": "Lift Option / Headrail Type (ack: 'Cordless Top Down bottom Up', 'Cordless Headrail (1)')",
     "label": "system",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "headrail_color",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "match fabric (e.g. '012 Cocoa'); Skylight White #001; Verticell Off White",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "default = matching color (one tap)",
     "depends_on": [
      "fabric_color",
      "system"
     ],
     "screen_rule": "ask on a later screen than: fabric_color, system",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "always",
     "portal_label": "CS HR Color",
     "label": "headrail_color",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "recess",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Flush | Partial recess",
     "conditional": "mount = Inside",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "recess",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_depth",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches (1/8\")",
     "conditional": "mount = Inside",
     "free_form": false,
     "button_stand_in": "depth buttons 1\",1.5\",2\",2.5\",3\"+ keypad",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "mount_depth",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "bottom_fabric",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "blackout fabric code (second fabric)",
     "conditional": "system = Cordless Day/Night",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "system"
     ],
     "screen_rule": "ask on a later screen than: system",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "bottom_fabric",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "verticell_stack",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left Stack | Right Stack | Center Split",
     "conditional": "system = Verticell",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "system"
     ],
     "screen_rule": "ask on a later screen than: system",
     "source": "web-sourced: sundancedecor.com/order-forms Cellular form: Left/Right stack, Center split; Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Verticell Shade / stack",
     "label": "verticell_stack",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "motor_type",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "No | Somfy TL25 | Simphony WireFree | Simphony Concerto",
     "conditional": "motorized systems",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "system"
     ],
     "screen_rule": "ask on a later screen than: system",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Motor Type",
     "label": "motor_type",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "charger",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "No | Somfy charger | Charger (Li-On) Ultra Somfy",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Chargers",
     "label": "charger",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "solar_panel",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "No | Yes",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Solar Panel",
     "label": "solar_panel",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "remote",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Situo 1/5 etc. (qty)",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "web-sourced: sundancedecor.com/order-forms Cellular form; Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "conditional",
     "portal_label": "Remote",
     "label": "remote",
     "confidence": "web_order_form",
     "needs_live_form_check": true
    },
    {
     "key": "assembly",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts; web-sourced: sundancedecor.com/order-forms Cellular form: 2-on-1",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "cutouts",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "#",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Cellular form",
     "required": "optional",
     "portal_label": "Cut-Outs (#)",
     "label": "cutouts",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "shape",
     "ask_order": 20,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Arch | Quarter Arch | Circle | Hexagon | Octagon",
     "conditional": "system = Specialty Shape",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "system"
     ],
     "screen_rule": "ask on a later screen than: system",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "shape",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "shape_geometry",
     "ask_order": 21,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Perfect | Non-perfect",
     "conditional": "shape set",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "shape"
     ],
     "screen_rule": "ask on a later screen than: shape",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "shape_geometry",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "shape_sides",
     "ask_order": 22,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "side_1..side_8 in 1/8\" (count by shape)",
     "conditional": "non-perfect shape",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "shape_geometry"
     ],
     "screen_rule": "ask on a later screen than: shape_geometry",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "shape_sides",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "template_reference",
     "ask_order": 23,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "template file ref (must be attached)",
     "conditional": "specialty shape",
     "free_form": true,
     "button_stand_in": "'Template attached' Yes button + file picker",
     "depends_on": [
      "shape"
     ],
     "screen_rule": "ask on a later screen than: shape",
     "source": "repo src/lib/quote/sundance/cellular-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "template_reference",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "motor_size_limit",
     "ask_order": 24,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "portal flag ('Blind Can Be Made')",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "optional",
     "portal_label": "Motor Size Limit",
     "label": "motor_size_limit",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 25,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_advantage_ii_2",
   "product_name": "Advantage II 2\" faux wood",
   "quote_product_type": "Faux Wood Blinds",
   "portal_ordering_type": "2-inch Advantage",
   "quoted_designs_in_crm": 1,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 20,
   "required_line_fields": 11,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "valance",
    "valance_corners",
    "valance_size_return",
    "tape_code",
    "connection",
    "flush_depth"
   ],
   "status": "gaps",
   "flags": [
    "Horizontal blinds are cordless only; guide has no stacking table.",
    "Portal color rows unresolved for many colors (see ledger)."
   ],
   "live_vendor_check": [
    "Confirm portal field names for ladder/tape, valance, hold-down"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "exact color+slat route (e.g. 904-101 Fog, 8014 Matte White)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Color / slat",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "extra_valance",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Extra valance | Valance with dust cover",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "extra_valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "lift_system",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "Cordless (only option)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form: Cordless",
     "required": "always",
     "portal_label": null,
     "label": "lift_system",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "wand_tilt_side",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right (BasicVue Left only; aluminum Right unconfirmed)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Tilt",
     "label": "wand_tilt_side",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "per color (e.g. Crown; Chateau: 3\" Metro | 3\" Sutton | 3\" Harvard | 4\" Rope; BasicVue: Crown Hollow)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "fabric_color"
     ],
     "screen_rule": "ask on a later screen than: fabric_color",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "always",
     "portal_label": "Valance style",
     "label": "valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance_corners",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Rounded | Square",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "valance"
     ],
     "screen_rule": "ask on a later screen than: valance",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "optional",
     "portal_label": "Rounded Corners",
     "label": "valance_corners",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "valance_size_return",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "valance size / return inches",
     "conditional": "outside mount or custom return",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance Size / Return",
     "label": "valance_size_return",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "ladder",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Ladder | Solid 1-inch tape | Decorative 1-inch tape",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "ladder",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "tape_code",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "solid 5469/5462/5463/5465/5467/5460/5475/5468/5473/5472; decorative 5459/4201/4288-4294",
     "conditional": "ladder = tape",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "ladder"
     ],
     "screen_rule": "ask on a later screen than: ladder",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "tape_code",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one | Three on one",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "connection",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Keystone | Edge-joint",
     "conditional": "assembly != Single",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "assembly"
     ],
     "screen_rule": "ask on a later screen than: assembly",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance connection",
     "label": "connection",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "hold_down",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "hold_down",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "spacer",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "spacer",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "flush_depth",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "Flush Yes/No + depth",
     "conditional": "Inside mount",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "flush_depth",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 20,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_advantage_ii_2_5",
   "product_name": "Advantage II 2.5\" faux wood",
   "quote_product_type": "Faux Wood Blinds",
   "portal_ordering_type": "2.5-inch Advantage",
   "quoted_designs_in_crm": 0,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 20,
   "required_line_fields": 11,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "valance",
    "valance_corners",
    "valance_size_return",
    "tape_code",
    "connection",
    "flush_depth"
   ],
   "status": "gaps",
   "flags": [
    "Horizontal blinds are cordless only; guide has no stacking table.",
    "Portal color rows unresolved for many colors (see ledger)."
   ],
   "live_vendor_check": [
    "Confirm portal field names for ladder/tape, valance, hold-down"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "exact color+slat route (e.g. 904-101 Fog, 8014 Matte White)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Color / slat",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "extra_valance",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Extra valance | Valance with dust cover",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "extra_valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "lift_system",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "Cordless (only option)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form: Cordless",
     "required": "always",
     "portal_label": null,
     "label": "lift_system",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "wand_tilt_side",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right (BasicVue Left only; aluminum Right unconfirmed)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Tilt",
     "label": "wand_tilt_side",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "per color (e.g. Crown; Chateau: 3\" Metro | 3\" Sutton | 3\" Harvard | 4\" Rope; BasicVue: Crown Hollow)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "fabric_color"
     ],
     "screen_rule": "ask on a later screen than: fabric_color",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "always",
     "portal_label": "Valance style",
     "label": "valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance_corners",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Rounded | Square",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "valance"
     ],
     "screen_rule": "ask on a later screen than: valance",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "optional",
     "portal_label": "Rounded Corners",
     "label": "valance_corners",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "valance_size_return",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "valance size / return inches",
     "conditional": "outside mount or custom return",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance Size / Return",
     "label": "valance_size_return",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "ladder",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Ladder | Solid 1-inch tape | Decorative 1-inch tape",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "ladder",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "tape_code",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "solid 5469/5462/5463/5465/5467/5460/5475/5468/5473/5472; decorative 5459/4201/4288-4294",
     "conditional": "ladder = tape",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "ladder"
     ],
     "screen_rule": "ask on a later screen than: ladder",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "tape_code",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one | Three on one",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "connection",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Keystone | Edge-joint",
     "conditional": "assembly != Single",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "assembly"
     ],
     "screen_rule": "ask on a later screen than: assembly",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance connection",
     "label": "connection",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "hold_down",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "hold_down",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "spacer",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "spacer",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "flush_depth",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "Flush Yes/No + depth",
     "conditional": "Inside mount",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "flush_depth",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 20,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_premium_ii_2",
   "product_name": "Premium II 2\" wood",
   "quote_product_type": "Wood Blinds",
   "portal_ordering_type": "2-inch Wood",
   "quoted_designs_in_crm": 0,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 20,
   "required_line_fields": 11,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "valance",
    "valance_corners",
    "valance_size_return",
    "tape_code",
    "connection",
    "flush_depth"
   ],
   "status": "gaps",
   "flags": [
    "Horizontal blinds are cordless only; guide has no stacking table.",
    "Portal color rows unresolved for many colors (see ledger)."
   ],
   "live_vendor_check": [
    "Confirm portal field names for ladder/tape, valance, hold-down"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "exact color+slat route (e.g. 904-101 Fog, 8014 Matte White)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Color / slat",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "extra_valance",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Extra valance | Valance with dust cover",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "extra_valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "lift_system",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "Cordless (only option)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form: Cordless",
     "required": "always",
     "portal_label": null,
     "label": "lift_system",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "wand_tilt_side",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right (BasicVue Left only; aluminum Right unconfirmed)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Tilt",
     "label": "wand_tilt_side",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "per color (e.g. Crown; Chateau: 3\" Metro | 3\" Sutton | 3\" Harvard | 4\" Rope; BasicVue: Crown Hollow)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "fabric_color"
     ],
     "screen_rule": "ask on a later screen than: fabric_color",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "always",
     "portal_label": "Valance style",
     "label": "valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance_corners",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Rounded | Square",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "valance"
     ],
     "screen_rule": "ask on a later screen than: valance",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "optional",
     "portal_label": "Rounded Corners",
     "label": "valance_corners",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "valance_size_return",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "valance size / return inches",
     "conditional": "outside mount or custom return",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance Size / Return",
     "label": "valance_size_return",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "ladder",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Ladder | Solid 1-inch tape | Decorative 1-inch tape",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "ladder",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "tape_code",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "solid 5469/5462/5463/5465/5467/5460/5475/5468/5473/5472; decorative 5459/4201/4288-4294",
     "conditional": "ladder = tape",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "ladder"
     ],
     "screen_rule": "ask on a later screen than: ladder",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "tape_code",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one | Three on one",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "connection",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Keystone | Edge-joint",
     "conditional": "assembly != Single",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "assembly"
     ],
     "screen_rule": "ask on a later screen than: assembly",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance connection",
     "label": "connection",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "hold_down",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "hold_down",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "spacer",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "spacer",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "flush_depth",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "Flush Yes/No + depth",
     "conditional": "Inside mount",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "flush_depth",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 20,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_premium_ii_2_5",
   "product_name": "Premium II 2.5\" wood",
   "quote_product_type": "Wood Blinds",
   "portal_ordering_type": "2.5-inch Wood",
   "quoted_designs_in_crm": 0,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 20,
   "required_line_fields": 11,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "valance",
    "valance_corners",
    "valance_size_return",
    "tape_code",
    "connection",
    "flush_depth"
   ],
   "status": "gaps",
   "flags": [
    "Horizontal blinds are cordless only; guide has no stacking table.",
    "Portal color rows unresolved for many colors (see ledger)."
   ],
   "live_vendor_check": [
    "Confirm portal field names for ladder/tape, valance, hold-down"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "exact color+slat route (e.g. 904-101 Fog, 8014 Matte White)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Color / slat",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "extra_valance",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Extra valance | Valance with dust cover",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "extra_valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "lift_system",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "Cordless (only option)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form: Cordless",
     "required": "always",
     "portal_label": null,
     "label": "lift_system",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "wand_tilt_side",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right (BasicVue Left only; aluminum Right unconfirmed)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Tilt",
     "label": "wand_tilt_side",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "per color (e.g. Crown; Chateau: 3\" Metro | 3\" Sutton | 3\" Harvard | 4\" Rope; BasicVue: Crown Hollow)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "fabric_color"
     ],
     "screen_rule": "ask on a later screen than: fabric_color",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "always",
     "portal_label": "Valance style",
     "label": "valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance_corners",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Rounded | Square",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "valance"
     ],
     "screen_rule": "ask on a later screen than: valance",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "optional",
     "portal_label": "Rounded Corners",
     "label": "valance_corners",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "valance_size_return",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "valance size / return inches",
     "conditional": "outside mount or custom return",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance Size / Return",
     "label": "valance_size_return",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "ladder",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Ladder | Solid 1-inch tape | Decorative 1-inch tape",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "ladder",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "tape_code",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "solid 5469/5462/5463/5465/5467/5460/5475/5468/5473/5472; decorative 5459/4201/4288-4294",
     "conditional": "ladder = tape",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "ladder"
     ],
     "screen_rule": "ask on a later screen than: ladder",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "tape_code",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one | Three on one",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "connection",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Keystone | Edge-joint",
     "conditional": "assembly != Single",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "assembly"
     ],
     "screen_rule": "ask on a later screen than: assembly",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance connection",
     "label": "connection",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "hold_down",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "hold_down",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "spacer",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "spacer",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "flush_depth",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "Flush Yes/No + depth",
     "conditional": "Inside mount",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "flush_depth",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 20,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_aluminum_1",
   "product_name": "1\" aluminum mini blind",
   "quote_product_type": "Mini Blinds",
   "portal_ordering_type": "1-inch Aluminum",
   "quoted_designs_in_crm": 1,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 22,
   "required_line_fields": 12,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "valance",
    "valance_corners",
    "valance_size_return",
    "tape_code",
    "connection",
    "flush_depth"
   ],
   "status": "gaps",
   "flags": [
    "Horizontal blinds are cordless only; guide has no stacking table.",
    "Portal color rows unresolved for many colors (see ledger)."
   ],
   "live_vendor_check": [
    "Confirm portal field names for ladder/tape, valance, hold-down"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "exact color+slat route (e.g. 904-101 Fog, 8014 Matte White)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Color / slat",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "grade",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard | Premium",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "grade",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "cutout_sides",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "0-4",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "optional",
     "portal_label": null,
     "label": "cutout_sides",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "extension_pole_qty",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "short / long qty",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "optional",
     "portal_label": null,
     "label": "extension_pole_qty",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "lift_system",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "Cordless (only option)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form: Cordless",
     "required": "always",
     "portal_label": null,
     "label": "lift_system",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "wand_tilt_side",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right (BasicVue Left only; aluminum Right unconfirmed)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Tilt",
     "label": "wand_tilt_side",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "per color (e.g. Crown; Chateau: 3\" Metro | 3\" Sutton | 3\" Harvard | 4\" Rope; BasicVue: Crown Hollow)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "fabric_color"
     ],
     "screen_rule": "ask on a later screen than: fabric_color",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "always",
     "portal_label": "Valance style",
     "label": "valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance_corners",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Rounded | Square",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "valance"
     ],
     "screen_rule": "ask on a later screen than: valance",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "optional",
     "portal_label": "Rounded Corners",
     "label": "valance_corners",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "valance_size_return",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "valance size / return inches",
     "conditional": "outside mount or custom return",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance Size / Return",
     "label": "valance_size_return",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "ladder",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Ladder | Solid 1-inch tape | Decorative 1-inch tape",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "ladder",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "tape_code",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "solid 5469/5462/5463/5465/5467/5460/5475/5468/5473/5472; decorative 5459/4201/4288-4294",
     "conditional": "ladder = tape",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "ladder"
     ],
     "screen_rule": "ask on a later screen than: ladder",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "tape_code",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one | Three on one",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "connection",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Keystone | Edge-joint",
     "conditional": "assembly != Single",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "assembly"
     ],
     "screen_rule": "ask on a later screen than: assembly",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance connection",
     "label": "connection",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "hold_down",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "hold_down",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "spacer",
     "ask_order": 20,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "spacer",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "flush_depth",
     "ask_order": 21,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "Flush Yes/No + depth",
     "conditional": "Inside mount",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "flush_depth",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 22,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_aluminum_2",
   "product_name": "2\" aluminum 8-gauge",
   "quote_product_type": "Mini Blinds",
   "portal_ordering_type": "2-inch Aluminum",
   "quoted_designs_in_crm": 0,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 19,
   "required_line_fields": 11,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "valance",
    "valance_corners",
    "valance_size_return",
    "tape_code",
    "connection",
    "flush_depth"
   ],
   "status": "gaps",
   "flags": [
    "Horizontal blinds are cordless only; guide has no stacking table.",
    "Portal color rows unresolved for many colors (see ledger)."
   ],
   "live_vendor_check": [
    "Confirm portal field names for ladder/tape, valance, hold-down"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "exact color+slat route (e.g. 904-101 Fog, 8014 Matte White)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Color / slat",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "lift_system",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "Cordless (only option)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form: Cordless",
     "required": "always",
     "portal_label": null,
     "label": "lift_system",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "wand_tilt_side",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right (BasicVue Left only; aluminum Right unconfirmed)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Tilt",
     "label": "wand_tilt_side",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "per color (e.g. Crown; Chateau: 3\" Metro | 3\" Sutton | 3\" Harvard | 4\" Rope; BasicVue: Crown Hollow)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "fabric_color"
     ],
     "screen_rule": "ask on a later screen than: fabric_color",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "always",
     "portal_label": "Valance style",
     "label": "valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance_corners",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Rounded | Square",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "valance"
     ],
     "screen_rule": "ask on a later screen than: valance",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "optional",
     "portal_label": "Rounded Corners",
     "label": "valance_corners",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "valance_size_return",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "valance size / return inches",
     "conditional": "outside mount or custom return",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance Size / Return",
     "label": "valance_size_return",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "ladder",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Ladder | Solid 1-inch tape | Decorative 1-inch tape",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "ladder",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "tape_code",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "solid 5469/5462/5463/5465/5467/5460/5475/5468/5473/5472; decorative 5459/4201/4288-4294",
     "conditional": "ladder = tape",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "ladder"
     ],
     "screen_rule": "ask on a later screen than: ladder",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "tape_code",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one | Three on one",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "connection",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Keystone | Edge-joint",
     "conditional": "assembly != Single",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "assembly"
     ],
     "screen_rule": "ask on a later screen than: assembly",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance connection",
     "label": "connection",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "hold_down",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "hold_down",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "spacer",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "spacer",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "flush_depth",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "Flush Yes/No + depth",
     "conditional": "Inside mount",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "flush_depth",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_basicvue",
   "product_name": "BasicVue 2\" faux wood",
   "quote_product_type": "Faux Wood Blinds",
   "portal_ordering_type": "NONE (source-only)",
   "quoted_designs_in_crm": 0,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 19,
   "required_line_fields": 11,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "valance",
    "valance_corners",
    "valance_size_return",
    "tape_code",
    "connection",
    "flush_depth"
   ],
   "status": "blocked",
   "flags": [
    "BLOCKED: no ordering type on the dealer portal; offered in price guide only.",
    "Horizontal blinds are cordless only; guide has no stacking table.",
    "Portal color rows unresolved for many colors (see ledger)."
   ],
   "live_vendor_check": [
    "Confirm portal field names for ladder/tape, valance, hold-down",
    "Confirm orderability"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "exact color+slat route (e.g. 904-101 Fog, 8014 Matte White)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Color / slat",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "lift_system",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "Cordless (only option)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form: Cordless",
     "required": "always",
     "portal_label": null,
     "label": "lift_system",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "wand_tilt_side",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right (BasicVue Left only; aluminum Right unconfirmed)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Tilt",
     "label": "wand_tilt_side",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "per color (e.g. Crown; Chateau: 3\" Metro | 3\" Sutton | 3\" Harvard | 4\" Rope; BasicVue: Crown Hollow)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "fabric_color"
     ],
     "screen_rule": "ask on a later screen than: fabric_color",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "always",
     "portal_label": "Valance style",
     "label": "valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance_corners",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Rounded | Square",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "valance"
     ],
     "screen_rule": "ask on a later screen than: valance",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "optional",
     "portal_label": "Rounded Corners",
     "label": "valance_corners",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "valance_size_return",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "valance size / return inches",
     "conditional": "outside mount or custom return",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance Size / Return",
     "label": "valance_size_return",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "ladder",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Ladder | Solid 1-inch tape | Decorative 1-inch tape",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "ladder",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "tape_code",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "solid 5469/5462/5463/5465/5467/5460/5475/5468/5473/5472; decorative 5459/4201/4288-4294",
     "conditional": "ladder = tape",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "ladder"
     ],
     "screen_rule": "ask on a later screen than: ladder",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "tape_code",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one | Three on one",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "connection",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Keystone | Edge-joint",
     "conditional": "assembly != Single",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "assembly"
     ],
     "screen_rule": "ask on a later screen than: assembly",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance connection",
     "label": "connection",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "hold_down",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "hold_down",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "spacer",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "spacer",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "flush_depth",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "Flush Yes/No + depth",
     "conditional": "Inside mount",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "flush_depth",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_chateau_woods",
   "product_name": "Chateau Woods 2/2.5\" wood",
   "quote_product_type": "Wood Blinds",
   "portal_ordering_type": "NONE (source-only; web order form exists)",
   "quoted_designs_in_crm": 0,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 19,
   "required_line_fields": 11,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "valance",
    "valance_corners",
    "valance_size_return",
    "tape_code",
    "connection",
    "flush_depth"
   ],
   "status": "blocked",
   "flags": [
    "BLOCKED: no ordering type on the dealer portal; offered in price guide only.",
    "Horizontal blinds are cordless only; guide has no stacking table.",
    "Portal color rows unresolved for many colors (see ledger).",
    "Chateau widths >84\" must split into 2+ blinds with valance connection."
   ],
   "live_vendor_check": [
    "Confirm portal field names for ladder/tape, valance, hold-down",
    "Confirm orderability"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by product-by product\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "exact color+slat route (e.g. 904-101 Fog, 8014 Matte White)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Color / slat",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "lift_system",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "Cordless (only option)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form: Cordless",
     "required": "always",
     "portal_label": null,
     "label": "lift_system",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "wand_tilt_side",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right (BasicVue Left only; aluminum Right unconfirmed)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": "Tilt",
     "label": "wand_tilt_side",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "per color (e.g. Crown; Chateau: 3\" Metro | 3\" Sutton | 3\" Harvard | 4\" Rope; BasicVue: Crown Hollow)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "fabric_color"
     ],
     "screen_rule": "ask on a later screen than: fabric_color",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "always",
     "portal_label": "Valance style",
     "label": "valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance_corners",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Rounded | Square",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "valance"
     ],
     "screen_rule": "ask on a later screen than: valance",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "optional",
     "portal_label": "Rounded Corners",
     "label": "valance_corners",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "valance_size_return",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "valance size / return inches",
     "conditional": "outside mount or custom return",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance Size / Return",
     "label": "valance_size_return",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "ladder",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Ladder | Solid 1-inch tape | Decorative 1-inch tape",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "ladder",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "tape_code",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "solid 5469/5462/5463/5465/5467/5460/5475/5468/5473/5472; decorative 5459/4201/4288-4294",
     "conditional": "ladder = tape",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "ladder"
     ],
     "screen_rule": "ask on a later screen than: ladder",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "tape_code",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one | Three on one",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "connection",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Keystone | Edge-joint",
     "conditional": "assembly != Single",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "assembly"
     ],
     "screen_rule": "ask on a later screen than: assembly",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts; web-sourced: sundancedecor.com/order-forms Chateau form",
     "required": "conditional",
     "portal_label": "Valance connection",
     "label": "connection",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "hold_down",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "hold_down",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "spacer",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "spacer",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "flush_depth",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "Flush Yes/No + depth",
     "conditional": "Inside mount",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/horizontal-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "flush_depth",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_vertical_essence",
   "product_name": "Sundance Vertical Essence (custom 3.5\" PVC vertical)",
   "quote_product_type": "Vertical Blinds",
   "portal_ordering_type": "Vertical Essence",
   "quoted_designs_in_crm": 9,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 17,
   "required_line_fields": 14,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "stack_side",
    "valance_returns",
    "flush"
   ],
   "status": "gaps",
   "flags": [
    "Only vertical line on portal (no fabric-vane vertical).",
    "Portal has no stack-side field — side goes in Note/Instructions (bot practice)."
   ],
   "live_vendor_check": [
    "Confirm Ceiling mount and Returns fields exist on portal"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 7-192\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 10-144\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside | Ceiling (form) — portal Bracket field",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01) order form K-13; portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "~110 fabrics, all 3.5\" PVC, 7 price groups (e.g. CURVED WHITE /3.5 VERTICAL cheapest; ALEXANDER WHITE)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": "Fabric (label 'NAME COLOR /3.5 VERTICAL')",
     "label": "Pattern + color",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "stack",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "One Way | Split",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "always",
     "portal_label": "Stack",
     "label": "stack",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "stack_side",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right | Center Open (split)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "stack"
     ],
     "screen_rule": "write 'STACK LEFT/RIGHT' into line_note",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01) (Draw: Left/Right/Cntr Open)",
     "required": "always",
     "portal_label": "NONE on portal — goes in line Note/Instructions",
     "label": "stack_side",
     "confidence": "portal_observed",
     "needs_live_form_check": true
    },
    {
     "key": "control",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Wand Right | Wand Left (portal 'Headrail: Wand')",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": "Headrail / Control",
     "label": "control",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "bracket",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard | 3-inch extension | 4-inch extension | 4 5/8-inch L-bracket",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); repo src/lib/quote/sundance/vertical-configuration.ts; Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": "Bracket (Standard Bracket)",
     "label": "bracket",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "valance",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "No Valance | Square | Rounded | Crown only ($7/ft net) | Crown with dust cover ($10/ft net)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": "Valance",
     "label": "valance",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "valance_returns",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Left | Right | Both (form 'Returns')",
     "conditional": "valance != None and Outside mount",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "valance",
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: valance, mount_type",
     "source": "Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "conditional",
     "portal_label": "Returns",
     "label": "valance_returns",
     "confidence": "price_guide",
     "needs_live_form_check": true
    },
    {
     "key": "flush",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "Inside mount (IM min depth 2 1/4\", flush 4\")",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/vertical-configuration.ts; Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "conditional",
     "portal_label": null,
     "label": "flush",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "fulfillment",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Complete blind | Track only ($0.95/in, 3 ft min) | Vanes only",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "default Complete blind",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/vertical-configuration.ts; Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": null,
     "label": "fulfillment",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "vane_count",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "portal auto-sets (e.g. 32/32/33 at 100-103\")",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "always",
     "portal_label": "Vanes",
     "label": "vane_count",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "deductions",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "IM: 1/4\" headrail + 1/4\" height; OM none (vanes-only: state net or deduct)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": null,
     "label": "deductions",
     "confidence": "price_guide",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_stock_vertical",
   "product_name": "Sundance stock vertical (Vertical Essence K-12)",
   "quote_product_type": "Vertical Blinds",
   "portal_ordering_type": "Vertical Essence (stock)",
   "quoted_designs_in_crm": 0,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 16,
   "required_line_fields": 13,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "stack_side",
    "flush"
   ],
   "status": "gaps",
   "flags": [
    "Stock verticals are FOB Arcadia pickup only — delivery method must be pickup."
   ],
   "live_vendor_check": [
    "Confirm stock vertical is selectable on portal"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; stock 32-126\" (cut-down: price larger size +$5 net per dimension)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; stock 44-96\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside | Ceiling (form) — portal Bracket field",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01) order form K-13; portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Off-White",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": "Fabric (label 'NAME COLOR /3.5 VERTICAL')",
     "label": "Pattern + color",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "stack",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "One Way only",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "always",
     "portal_label": "Stack",
     "label": "stack",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "stack_side",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right | Center Open (split)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "stack"
     ],
     "screen_rule": "write 'STACK LEFT/RIGHT' into line_note",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01) (Draw: Left/Right/Cntr Open)",
     "required": "always",
     "portal_label": "NONE on portal — goes in line Note/Instructions",
     "label": "stack_side",
     "confidence": "portal_observed",
     "needs_live_form_check": true
    },
    {
     "key": "control",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Wand Right | Wand Left (portal 'Headrail: Wand')",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026); Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": "Headrail / Control",
     "label": "control",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "flush",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "Inside mount (IM min depth 2 1/4\", flush 4\")",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/vertical-configuration.ts; Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "conditional",
     "portal_label": null,
     "label": "flush",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "vane_count",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "portal auto-sets (e.g. 32/32/33 at 100-103\")",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "always",
     "portal_label": "Vanes",
     "label": "vane_count",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "deductions",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "IM: 1/4\" headrail + 1/4\" height; OM none (vanes-only: state net or deduct)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": null,
     "label": "deductions",
     "confidence": "price_guide",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "square_corner_valance",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "optional",
     "portal_label": null,
     "label": "square_corner_valance",
     "confidence": "price_guide",
     "needs_live_form_check": false
    },
    {
     "key": "cut_down",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Stock size | Cut width | Cut height | Cut both",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": null,
     "label": "cut_down",
     "confidence": "price_guide",
     "needs_live_form_check": false
    },
    {
     "key": "pickup",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "FOB Arcadia only, no delivery",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance Vertical Essence price guide K-1..K-13 (box /workspace/sundance/kv.txt, eff. 2024-08-01)",
     "required": "always",
     "portal_label": null,
     "label": "pickup",
     "confidence": "price_guide",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_walden_premier",
   "product_name": "Walden Premier woven wood shade",
   "quote_product_type": "Roman Shades",
   "portal_ordering_type": "Wovenwood",
   "quoted_designs_in_crm": 2,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 29,
   "required_line_fields": 14,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "control_side",
    "chain",
    "wand_length",
    "wand_color",
    "motor_type",
    "charger",
    "remote",
    "edge_binding",
    "return_material",
    "flush_depth",
    "valance_headrail"
   ],
   "status": "gaps",
   "flags": [
    "Real order 86118 (Tala Hishmeh) is Wovenwood — ack labels used.",
    "Separate price book; no account fixture."
   ],
   "live_vendor_check": [
    "Confirm Premier vs Select is a menu choice inside Wovenwood"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 14-29.5 (by control)-96\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 18-96-108 (by control)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Wovenwood: 110 portal rows (105 mapped); e.g. SELENE WHITE (EDGE BINDING A MUST), ASPEN EBONY",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Woven material + code",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "style",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard | Waterfall | Valance Only",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); repo src/lib/quote/sundance/walden-configuration.ts; web-sourced: sundancedecor.com/order-forms Woven form: S/W",
     "required": "always",
     "portal_label": "Style of Roman (ack: 'Waterfall (No Valance)')",
     "label": "style",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "control",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Cordless (15-96\") | Cordless TDBU | Clutch and Loop | Pro Wand | Standard LI Motor | Power Lift LI Motor | Somfy Sonesse Ultra 30",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "always",
     "portal_label": "Cordless / Control Mechan (ack: 'Cordless (max 96\") *unselect for Motors*')",
     "label": "control",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "control_side",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right",
     "conditional": "clutch, wand or motor",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "web-sourced: sundancedecor.com/order-forms Woven form",
     "required": "conditional",
     "portal_label": "Control Left/Right",
     "label": "control_side",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "chain",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Premier: Metal standard; Select: Nickel-plated standard | Stainless Steel",
     "conditional": "control = Clutch and Loop",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "conditional",
     "portal_label": "Chain (ack: 'Not Applicable')",
     "label": "chain",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "wand_length",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "24 | 36 | 48 | 60 in (2'-5')",
     "conditional": "control = Pro Wand",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts; web-sourced: sundancedecor.com/order-forms Woven form fn 2",
     "required": "conditional",
     "portal_label": null,
     "label": "wand_length",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "wand_color",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Beige | Gray | Bronze | Black",
     "conditional": "control = Pro Wand",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "web-sourced: sundancedecor.com/order-forms Woven form fn 2",
     "required": "conditional",
     "portal_label": null,
     "label": "wand_color",
     "confidence": "web_order_form",
     "needs_live_form_check": true
    },
    {
     "key": "motor_type",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "No | Standard Lift | Ultra 30 Somfy Li-ion",
     "conditional": "motorized control",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web-sourced: sundancedecor.com/order-forms Woven form fn 3",
     "required": "conditional",
     "portal_label": "Motor Type",
     "label": "motor_type",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "charger",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "No | Charger (Li-On) Ultra Somfy | charger16",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ack 86118 shows Somfy charger on non-motor cordless lines — confirm default",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Chargers",
     "label": "charger",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "remote",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Lift 1- or 15-ch | Somfy Situo 1/5/16",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "web-sourced: sundancedecor.com/order-forms Woven form fn 3",
     "required": "conditional",
     "portal_label": "Remote",
     "label": "remote",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "lining",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Light Filtering | (liner grid ids)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "always",
     "portal_label": "Lining (ack: 'Light Filtering')",
     "label": "lining",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "edge_binding",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "No | binding code (e.g. N1 WHITE 1 1/2\" NARROW BINDING); REQUIRED for 'EDGE BINDING A MUST' materials",
     "conditional": "material flagged 'EDGE BINDING A MUST'",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "fabric_color"
     ],
     "screen_rule": "ask on a later screen than: fabric_color",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Edge Binding Colors",
     "label": "edge_binding",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "twin_shade",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "NO | YES (front/rear records)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); repo src/lib/quote/sundance/walden-twin.ts",
     "required": "always",
     "portal_label": "Twin shade lining",
     "label": "twin_shade",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "front_mount",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "No | Yes",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Front Mount",
     "label": "front_mount",
     "confidence": "portal_observed",
     "needs_live_form_check": true
    },
    {
     "key": "multi_blind",
     "ask_order": 20,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "No | Yes (surcharge)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Multi Blind Surcharge",
     "label": "multi_blind",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "returns",
     "ask_order": 21,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Standard | Extended",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "returns",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "return_material",
     "ask_order": 22,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Shade fabric | Edge binding fabric",
     "conditional": "returns != None",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "returns"
     ],
     "screen_rule": "ask on a later screen than: returns",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "return_material",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "flush_depth",
     "ask_order": 23,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "Flush Yes/No + depth (min 2.5\" cordless/clutch; 3.7\" motor)",
     "conditional": "Inside mount",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type",
      "control"
     ],
     "screen_rule": "ask on a later screen than: mount_type, control",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "flush_depth",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 24,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one | Three on one",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "interior_valance",
     "ask_order": 25,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard when unlined or light-filtering | Requested interior valance",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "interior_valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance_headrail",
     "ask_order": 26,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Loose | 1 | 1.5 | 2.5 | 3.5 | 5",
     "conditional": "style = Valance Only",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "style"
     ],
     "screen_rule": "ask on a later screen than: style",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "valance_headrail",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "cutout_qty",
     "ask_order": 27,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "0+",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "optional",
     "portal_label": null,
     "label": "cutout_qty",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "hold_down",
     "ask_order": 28,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "optional",
     "portal_label": null,
     "label": "hold_down",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 29,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_walden_select",
   "product_name": "Walden Select woven wood shade",
   "quote_product_type": "Roman Shades",
   "portal_ordering_type": "Wovenwood",
   "quoted_designs_in_crm": 5,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 29,
   "required_line_fields": 14,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "control_side",
    "chain",
    "wand_length",
    "wand_color",
    "motor_type",
    "charger",
    "remote",
    "edge_binding",
    "return_material",
    "flush_depth",
    "valance_headrail"
   ],
   "status": "gaps",
   "flags": [
    "Same portal type as Premier; ASPEN EBONY draft 27894 used Select-like options."
   ],
   "live_vendor_check": [
    "Same as Premier"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 14-29.5 (by control)-96\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 18-96-108 (by control)\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Wovenwood: 110 portal rows (105 mapped); e.g. SELENE WHITE (EDGE BINDING A MUST), ASPEN EBONY",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Woven material + code",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "style",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard | Waterfall | Valance Only",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); repo src/lib/quote/sundance/walden-configuration.ts; web-sourced: sundancedecor.com/order-forms Woven form: S/W",
     "required": "always",
     "portal_label": "Style of Roman (ack: 'Waterfall (No Valance)')",
     "label": "style",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "control",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Cordless (15-96\") | Cordless TDBU | Clutch and Loop | Pro Wand | Standard LI Motor | Somfy Sonesse Ultra 30",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "always",
     "portal_label": "Cordless / Control Mechan (ack: 'Cordless (max 96\") *unselect for Motors*')",
     "label": "control",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "control_side",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right",
     "conditional": "clutch, wand or motor",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "web-sourced: sundancedecor.com/order-forms Woven form",
     "required": "conditional",
     "portal_label": "Control Left/Right",
     "label": "control_side",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "chain",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Premier: Metal standard; Select: Nickel-plated standard | Stainless Steel",
     "conditional": "control = Clutch and Loop",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "conditional",
     "portal_label": "Chain (ack: 'Not Applicable')",
     "label": "chain",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "wand_length",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "24 | 36 | 48 | 60 in (2'-5')",
     "conditional": "control = Pro Wand",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts; web-sourced: sundancedecor.com/order-forms Woven form fn 2",
     "required": "conditional",
     "portal_label": null,
     "label": "wand_length",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "wand_color",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "White | Beige | Gray | Bronze | Black",
     "conditional": "control = Pro Wand",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "web-sourced: sundancedecor.com/order-forms Woven form fn 2",
     "required": "conditional",
     "portal_label": null,
     "label": "wand_color",
     "confidence": "web_order_form",
     "needs_live_form_check": true
    },
    {
     "key": "motor_type",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "No | Standard Lift | Ultra 30 Somfy Li-ion",
     "conditional": "motorized control",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web-sourced: sundancedecor.com/order-forms Woven form fn 3",
     "required": "conditional",
     "portal_label": "Motor Type",
     "label": "motor_type",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "charger",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "No | Charger (Li-On) Ultra Somfy | charger16",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ack 86118 shows Somfy charger on non-motor cordless lines — confirm default",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Chargers",
     "label": "charger",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "remote",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard Lift 1- or 15-ch | Somfy Situo 1/5/16",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "web-sourced: sundancedecor.com/order-forms Woven form fn 3",
     "required": "conditional",
     "portal_label": "Remote",
     "label": "remote",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "lining",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Light Filtering | (liner grid ids)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "always",
     "portal_label": "Lining (ack: 'Light Filtering')",
     "label": "lining",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "edge_binding",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "No | binding code (e.g. N1 WHITE 1 1/2\" NARROW BINDING); REQUIRED for 'EDGE BINDING A MUST' materials",
     "conditional": "material flagged 'EDGE BINDING A MUST'",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "fabric_color"
     ],
     "screen_rule": "ask on a later screen than: fabric_color",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "conditional",
     "portal_label": "Edge Binding Colors",
     "label": "edge_binding",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "twin_shade",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "NO | YES (front/rear records)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); repo src/lib/quote/sundance/walden-twin.ts",
     "required": "always",
     "portal_label": "Twin shade lining",
     "label": "twin_shade",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "front_mount",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "No | Yes",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Front Mount",
     "label": "front_mount",
     "confidence": "portal_observed",
     "needs_live_form_check": true
    },
    {
     "key": "multi_blind",
     "ask_order": 20,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "No | Yes (surcharge)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Multi Blind Surcharge",
     "label": "multi_blind",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "returns",
     "ask_order": 21,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Standard | Extended",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "returns",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "return_material",
     "ask_order": 22,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Shade fabric | Edge binding fabric",
     "conditional": "returns != None",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "returns"
     ],
     "screen_rule": "ask on a later screen than: returns",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "return_material",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "flush_depth",
     "ask_order": 23,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "Flush Yes/No + depth (min 2.5\" cordless/clutch; 3.7\" motor)",
     "conditional": "Inside mount",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type",
      "control"
     ],
     "screen_rule": "ask on a later screen than: mount_type, control",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "flush_depth",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 24,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | Two on one | Three on one",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "interior_valance",
     "ask_order": 25,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard when unlined or light-filtering | Requested interior valance",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "optional",
     "portal_label": null,
     "label": "interior_valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance_headrail",
     "ask_order": 26,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Loose | 1 | 1.5 | 2.5 | 3.5 | 5",
     "conditional": "style = Valance Only",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "style"
     ],
     "screen_rule": "ask on a later screen than: style",
     "source": "repo src/lib/quote/sundance/walden-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "valance_headrail",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "cutout_qty",
     "ask_order": 27,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "0+",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "optional",
     "portal_label": null,
     "label": "cutout_qty",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "hold_down",
     "ask_order": 28,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Supabase sales_quote_designs.options_json (past 805 Sundance quotes)",
     "required": "optional",
     "portal_label": null,
     "label": "hold_down",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 29,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_portfolio_roman",
   "product_name": "Portfolio soft Roman shade",
   "quote_product_type": "Roman Shades",
   "portal_ordering_type": "Portfolio Soft Roman",
   "quoted_designs_in_crm": 5,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 23,
   "required_line_fields": 13,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "control_side",
    "wand_length_color",
    "charger_qty",
    "remote",
    "returns",
    "front_valance",
    "interior_valance",
    "valance_depth_length",
    "mount_depth"
   ],
   "status": "gaps",
   "flags": [
    "Deductions and wall-switch prices unresolved (E3)."
   ],
   "live_vendor_check": [
    "Confirm portal option names (style, liner, valance)"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by control-96\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/portfolio-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; by control-by control\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/portfolio-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "113 portal rows (84 mapped); e.g. ALESE CASHEW(CARDIFF CASHEW)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Fabric/color",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "shade_style",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Flat | Flat with Ribs | Knife Pleat | Front Slat | Hobbled",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Portfolio form fn 1; repo portfolio-assortment",
     "required": "always",
     "portal_label": null,
     "label": "shade_style",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "drop",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Standard (w/ valance) | Waterfall (no valance)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Portfolio form; repo src/lib/quote/sundance/portfolio-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "drop",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "control",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Cordless | Cordless TDBU | Clutch and Loop | Somfy Sonesse Ultra 30 | Standard LI Motor | Power Lift",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/portfolio-configuration.ts; web-sourced: sundancedecor.com/order-forms Portfolio form",
     "required": "always",
     "portal_label": null,
     "label": "control",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "control_side",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Left | Right",
     "conditional": "clutch or motor",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "web-sourced: sundancedecor.com/order-forms Portfolio form",
     "required": "conditional",
     "portal_label": null,
     "label": "control_side",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "wand_length_color",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "2'|3'|4'|5'; White | Beige | Gray | Bronze | Black",
     "conditional": "motor wand",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "web-sourced: sundancedecor.com/order-forms Portfolio form fn 2",
     "required": "conditional",
     "portal_label": null,
     "label": "wand_length_color",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "charger_qty",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "qty",
     "conditional": "Li-ion motor",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "web-sourced: sundancedecor.com/order-forms Portfolio form",
     "required": "conditional",
     "portal_label": null,
     "label": "charger_qty",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "remote",
     "ask_order": 13,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "15-channel | Somfy Situo 1/5/16",
     "conditional": "motorized",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "control"
     ],
     "screen_rule": "ask on a later screen than: control",
     "source": "web-sourced: sundancedecor.com/order-forms Portfolio form fn 3",
     "required": "conditional",
     "portal_label": null,
     "label": "remote",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "liner",
     "ask_order": 14,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "LF03 Light-Filtering Ivory | LF02 Light-Filtering Snow White | BO01 Black-Out White",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/portfolio-configuration.ts; web-sourced: sundancedecor.com/order-forms Portfolio form",
     "required": "always",
     "portal_label": null,
     "label": "liner",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "panel_alignment",
     "ask_order": 15,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Top | Bottom",
     "conditional": "multiple shades side by side",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Portfolio form: Panel Alignment Top/Bottom",
     "required": "conditional",
     "portal_label": null,
     "label": "panel_alignment",
     "confidence": "web_order_form",
     "needs_live_form_check": false
    },
    {
     "key": "returns",
     "ask_order": 16,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Standard | Extended (Extended = Outside only)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/portfolio-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "returns",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "front_valance",
     "ask_order": 17,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "None | Added",
     "conditional": "drop = Waterfall",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "drop"
     ],
     "screen_rule": "ask on a later screen than: drop",
     "source": "repo src/lib/quote/sundance/portfolio-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "front_valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "back_valance",
     "ask_order": 18,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/portfolio-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "back_valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "interior_valance",
     "ask_order": 19,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "Yes | No",
     "conditional": "drop = Waterfall",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "drop"
     ],
     "screen_rule": "ask on a later screen than: drop",
     "source": "repo src/lib/quote/sundance/portfolio-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "interior_valance",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "valance_depth_length",
     "ask_order": 20,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches",
     "conditional": "valance added",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "front_valance"
     ],
     "screen_rule": "ask on a later screen than: front_valance",
     "source": "repo src/lib/quote/sundance/portfolio-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "valance_depth_length",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_depth",
     "ask_order": 21,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches",
     "conditional": "Inside mount",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "mount_type"
     ],
     "screen_rule": "ask on a later screen than: mount_type",
     "source": "repo src/lib/quote/sundance/portfolio-configuration.ts",
     "required": "conditional",
     "portal_label": null,
     "label": "mount_depth",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "assembly",
     "ask_order": 22,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Single | multi",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/portfolio-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "assembly",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 23,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_exterior_zip",
   "product_name": "Sundance exterior ZipScreen",
   "quote_product_type": "Roller Shades",
   "portal_ordering_type": "Zipper Screen Exterior",
   "quoted_designs_in_crm": 1,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 11,
   "required_line_fields": 9,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [],
   "status": "gaps",
   "flags": [
    "Only size envelope and material are known; control/motor/housing/mount fields not in repo."
   ],
   "live_vendor_check": [
    "Capture full Zipper Screen Exterior option menus"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-220\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/exterior-zip-configuration.ts",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-110\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/exterior-zip-configuration.ts",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "fabric_color",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "57 portal rows, all mapped; standard/premium price class",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "two-step buttons: collection/pattern -> color (from ledger CSV)",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo docs/quote-audits/sundance-dealer-ledger-2026-09-20.csv (portal menus captured 2026-09-20)",
     "required": "always",
     "portal_label": "Fabric / Type + Color (portal label e.g. 'NAME COLOR /3.5 VERTICAL')",
     "label": "Screen material + color",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": true
    },
    {
     "key": "price_class",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "auto",
     "allowed": "standard | premium (from material)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/exterior-zip-configuration.ts",
     "required": "always",
     "portal_label": null,
     "label": "price_class",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "control",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "UNKNOWN — not captured",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "none",
     "required": "always",
     "portal_label": null,
     "label": "control",
     "confidence": "unknown",
     "needs_live_form_check": true
    },
    {
     "key": "motor_remote_accessories",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "UNKNOWN — not captured",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "none",
     "required": "conditional",
     "portal_label": null,
     "label": "motor_remote_accessories",
     "confidence": "unknown",
     "needs_live_form_check": true
    },
    {
     "key": "housing_color_mount_detail",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "UNKNOWN — not captured",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "none",
     "required": "always",
     "portal_label": null,
     "label": "housing_color_mount_detail",
     "confidence": "unknown",
     "needs_live_form_check": true
    },
    {
     "key": "line_note",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_exterior_cable",
   "product_name": "Sundance exterior cable-guided shade",
   "quote_product_type": "Roller Shades",
   "portal_ordering_type": "NONE",
   "quoted_designs_in_crm": 0,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 6,
   "required_line_fields": 5,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [],
   "status": "blocked",
   "flags": [
    "BLOCKED: no portal ordering type; E4 unproven program."
   ],
   "live_vendor_check": [
    "Ask Sundance if orderable"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-?\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "none",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-?\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "none",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "line_note",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_drapery_track",
   "product_name": "Sundance Glydea drapery track",
   "quote_product_type": "Drapery Tracks",
   "portal_ordering_type": "Glydea Track",
   "quoted_designs_in_crm": 1,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 12,
   "required_line_fields": 9,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [
    "motor_position",
    "remote_control"
   ],
   "status": "gaps",
   "flags": [
    "All 7 option menus captured exactly from portal (blindId 97, blindTypeId 421) on 2026-09-20.",
    "No dimensions/charges source (E4) — can't be priced automatically."
   ],
   "live_vendor_check": [
    "Confirm width field, mount and any bracket fields"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "always",
     "portal_label": null,
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "always",
     "portal_label": null,
     "label": "quantity",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "track_width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; limits UNKNOWN",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "none",
     "required": "always",
     "portal_label": null,
     "label": "track_width",
     "confidence": "unknown",
     "needs_live_form_check": true
    },
    {
     "key": "motor_type",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "GLYDEA MOTOR /1.O NM/ 110 VOLTS | GLYDEA MOTOR/ 0.6 NM /110 VOLTS | IRISMO 35/ 24VOLTS/ 0.6 NM (WITH TRANSFORMER) | IRISMO 45/LI-ON RECHARGEABLE/0.8 NM | No",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/drapery-track.portal.json",
     "required": "always",
     "portal_label": "Motor Type",
     "label": "motor_type",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": false
    },
    {
     "key": "headrail_color",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Bronze | White",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/drapery-track.portal.json",
     "required": "always",
     "portal_label": "Headrail Colors",
     "label": "headrail_color",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": false
    },
    {
     "key": "motor_position",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Motor Left | Motor Right",
     "conditional": "motor != No",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "repo src/lib/quote/sundance/drapery-track.portal.json",
     "required": "conditional",
     "portal_label": "Motor Position",
     "label": "motor_position",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": false
    },
    {
     "key": "curved_track",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "yesno",
     "allowed": "No | Yes",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/drapery-track.portal.json",
     "required": "always",
     "portal_label": "Curved Track",
     "label": "curved_track",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": false
    },
    {
     "key": "stack_type",
     "ask_order": 8,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "ONE WAY LEFT | ONE WAY RIGHT | Split.",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/drapery-track.portal.json",
     "required": "always",
     "portal_label": "Stack Type",
     "label": "stack_type",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": false
    },
    {
     "key": "drapery_style",
     "ask_order": 9,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Pinch Pleat Drapery Style | Ripple Fold Drapery style.",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "repo src/lib/quote/sundance/drapery-track.portal.json",
     "required": "always",
     "portal_label": "Drapery Style Track",
     "label": "drapery_style",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": false
    },
    {
     "key": "remote_control",
     "ask_order": 10,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "No | Situo 1 (Single Line) | Situo 5 (5 Lines) | Telis 16",
     "conditional": "motor != No",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [
      "motor_type"
     ],
     "screen_rule": "ask on a later screen than: motor_type",
     "source": "repo src/lib/quote/sundance/drapery-track.portal.json",
     "required": "conditional",
     "portal_label": "Remote Control",
     "label": "remote_control",
     "confidence": "portal_menu_captured",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 11,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Ceiling | Wall (UNKNOWN on portal)",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "none",
     "required": "always",
     "portal_label": null,
     "label": "mount_type",
     "confidence": "unknown",
     "needs_live_form_check": true
    },
    {
     "key": "line_note",
     "ask_order": 12,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_wood_shutters",
   "product_name": "Sundance custom wood shutters",
   "quote_product_type": "Shutters",
   "portal_ordering_type": "NONE (web form only)",
   "quoted_designs_in_crm": 0,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 7,
   "required_line_fields": 6,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [],
   "status": "blocked",
   "flags": [
    "BLOCKED: no dealer portal ordering type; shutter rates/offerings unproven (E4). 805 normally sources shutters from Norman/Onyx/Polar."
   ],
   "live_vendor_check": [
    "Ask whether 805 should offer Sundance shutters at all"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-?\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Wood and Vinyl Shutters form",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-?\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Wood and Vinyl Shutters form",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "shutter_options",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "UNKNOWN — web form exists, not parsed into repo",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Wood-and-Vinyl-Shutters-Order-Form-V2.pdf",
     "required": "always",
     "portal_label": null,
     "label": "shutter_options",
     "confidence": "web_order_form",
     "needs_live_form_check": true
    },
    {
     "key": "line_note",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  },
  {
   "manufacturer": "Sundance",
   "category": "sundance_vinyl_shutters",
   "product_name": "Sundance solid vinyl shutters",
   "quote_product_type": "Shutters",
   "portal_ordering_type": "NONE (web form only)",
   "quoted_designs_in_crm": 0,
   "catalog_version": "sundance-assortment-2026-09-26-r15",
   "total_fields": 7,
   "required_line_fields": 6,
   "order_level_fields": 14,
   "free_form_fields": [
    "room_name",
    "line_note"
   ],
   "dependent_fields": [],
   "status": "blocked",
   "flags": [
    "BLOCKED: no dealer portal ordering type; shutter rates/offerings unproven (E4). 805 normally sources shutters from Norman/Onyx/Polar."
   ],
   "live_vendor_check": [
    "Ask whether 805 should offer Sundance shutters at all"
   ],
   "fields": [
    {
     "key": "room_name",
     "ask_order": 1,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "common-room chips (Living, Dining, Kitchen, Primary Bed, Bed 2, Bed 3, Office, Bath, Family, Den, Hall, Loft) + 'Other' text",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms (every form has Room); Sundance acknowledgement PDFs 86118/88195 (box /workspace)",
     "required": "always",
     "portal_label": "Room",
     "label": "Room",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "quantity",
     "ask_order": 2,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "count",
     "allowed": "integer >= 1",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "1-6 number buttons + stepper",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Qty / Unit Qty.",
     "label": "Qty",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "width",
     "ask_order": 3,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-?\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons (0,1/8..7/8)",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Wood and Vinyl Shutters form",
     "required": "always",
     "portal_label": "Width",
     "label": "Width",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "height",
     "ask_order": 4,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "measure",
     "allowed": "inches in 1/8\" steps; 0-?\"",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "whole-inch keypad + 1/8 fraction buttons",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Wood and Vinyl Shutters form",
     "required": "always",
     "portal_label": "Drop / Height",
     "label": "Height / Drop",
     "confidence": "repo_validator",
     "needs_live_form_check": false
    },
    {
     "key": "mount_type",
     "ask_order": 5,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "Inside | Outside",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "Sundance acknowledgement PDFs 86118/88195 (box /workspace); web order forms",
     "required": "always",
     "portal_label": "Mount / Measure To (Inside/Outside)",
     "label": "Mount",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    },
    {
     "key": "shutter_options",
     "ask_order": 6,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "button",
     "allowed": "UNKNOWN — web form exists, not parsed into repo",
     "conditional": "",
     "free_form": false,
     "button_stand_in": "",
     "depends_on": [],
     "screen_rule": "",
     "source": "web-sourced: sundancedecor.com/order-forms Wood-and-Vinyl-Shutters-Order-Form-V2.pdf",
     "required": "always",
     "portal_label": null,
     "label": "shutter_options",
     "confidence": "web_order_form",
     "needs_live_form_check": true
    },
    {
     "key": "line_note",
     "ask_order": 7,
     "db_required": null,
     "db_input_kind": null,
     "level": "line",
     "kind": "free",
     "allowed": "text",
     "conditional": "",
     "free_form": true,
     "button_stand_in": "'None' default + chips for recurring notes (stack side, two-on-one details, motor side)",
     "depends_on": [],
     "screen_rule": "",
     "source": "portal (805 Sundance Order bot transcript, sundance.blindata.app drafts Oct-Nov 2026)",
     "required": "optional",
     "portal_label": "Note/Instructions",
     "label": "Note / Instructions (per line)",
     "confidence": "portal_observed",
     "needs_live_form_check": false
    }
   ]
  }
 ],
 "live_form_checks": {
  "form": "https://sundance.blindata.app (Add new order > product type); log in with Grok vault entry 'sundance.blindata.app' (id 919005), save as unsubmitted draft only, never submit",
  "by_product": {
   "sundance_sheerview": [
    "Confirm whether portal has one control-side field or separate tilt/lift sides",
    "Confirm full headrail list (Round Cassette seen; Curved/Flat/No Drill in repo)",
    "Confirm cord-loop chain choices",
    "Confirm min flush depth",
    "Confirm size limits per control"
   ],
   "sundance_zebra": [
    "Confirm cassette menu on CARESS-ZEBRA (bot saw none)",
    "Confirm control list and motor names as labeled on portal",
    "Confirm accessory fields are per line or per order"
   ],
   "sundance_louvolite_zebra": [
    "Confirm cassette menu on CARESS-ZEBRA (bot saw none)",
    "Confirm control list and motor names as labeled on portal",
    "Confirm accessory fields are per line or per order"
   ],
   "sundance_roller": [
    "Confirm exact portal option names for top treatment, bottomrail, tube, privacy",
    "Confirm accessories are line-level on portal"
   ],
   "sundance_louvolite_roller": [
    "Confirm exact portal option names for top treatment, bottomrail, tube, privacy",
    "Confirm accessories are line-level on portal"
   ],
   "sundance_flat_roman": [
    "Ask Sundance whether flat Roman is still orderable and under which portal type"
   ],
   "sundance_louvolite_flat_roman": [
    "Ask Sundance whether flat Roman is still orderable and under which portal type"
   ],
   "sundance_europanels": [
    "Confirm inside mount availability",
    "Confirm channel count field and panel-width rule"
   ],
   "sundance_louvolite_europanels": [
    "Confirm inside mount availability",
    "Confirm channel count field and panel-width rule"
   ],
   "sundance_cellular": [
    "Confirm Lift Option / Headrail Type menu names vs repo system names",
    "Confirm remote menu"
   ],
   "sundance_verticell": [
    "Confirm 'Verticell Shade' toggle drives stack field"
   ],
   "sundance_cellular_shapes": [
    "Confirm how template is uploaded on portal"
   ],
   "sundance_advantage_ii_2": [
    "Confirm portal field names for ladder/tape, valance, hold-down"
   ],
   "sundance_advantage_ii_2_5": [
    "Confirm portal field names for ladder/tape, valance, hold-down"
   ],
   "sundance_premium_ii_2": [
    "Confirm portal field names for ladder/tape, valance, hold-down"
   ],
   "sundance_premium_ii_2_5": [
    "Confirm portal field names for ladder/tape, valance, hold-down"
   ],
   "sundance_aluminum_1": [
    "Confirm portal field names for ladder/tape, valance, hold-down"
   ],
   "sundance_aluminum_2": [
    "Confirm portal field names for ladder/tape, valance, hold-down"
   ],
   "sundance_basicvue": [
    "Confirm portal field names for ladder/tape, valance, hold-down",
    "Confirm orderability"
   ],
   "sundance_chateau_woods": [
    "Confirm portal field names for ladder/tape, valance, hold-down",
    "Confirm orderability"
   ],
   "sundance_vertical_essence": [
    "Confirm Ceiling mount and Returns fields exist on portal"
   ],
   "sundance_stock_vertical": [
    "Confirm stock vertical is selectable on portal"
   ],
   "sundance_walden_premier": [
    "Confirm Premier vs Select is a menu choice inside Wovenwood"
   ],
   "sundance_walden_select": [
    "Same as Premier"
   ],
   "sundance_portfolio_roman": [
    "Confirm portal option names (style, liner, valance)"
   ],
   "sundance_exterior_zip": [
    "Capture full Zipper Screen Exterior option menus"
   ],
   "sundance_exterior_cable": [
    "Ask Sundance if orderable"
   ],
   "sundance_drapery_track": [
    "Confirm width field, mount and any bracket fields"
   ],
   "sundance_wood_shutters": [
    "Ask whether 805 should offer Sundance shutters at all"
   ],
   "sundance_vinyl_shutters": [
    "Ask whether 805 should offer Sundance shutters at all"
   ]
  },
  "fields_flagged": {
   "sundance_sheerview": [
    "fabric_color",
    "headrail",
    "cord_option",
    "control_side",
    "charger",
    "mount_depth_flush"
   ],
   "sundance_zebra": [
    "fabric_color",
    "control"
   ],
   "sundance_louvolite_zebra": [
    "fabric_color",
    "control"
   ],
   "sundance_roller": [
    "fabric_color",
    "control",
    "tube"
   ],
   "sundance_louvolite_roller": [
    "fabric_color",
    "control",
    "tube"
   ],
   "sundance_flat_roman": [
    "fabric_color",
    "control"
   ],
   "sundance_louvolite_flat_roman": [
    "fabric_color",
    "control"
   ],
   "sundance_europanels": [
    "fabric_color",
    "track_channels",
    "panel_layout"
   ],
   "sundance_louvolite_europanels": [
    "fabric_color",
    "track_channels",
    "panel_layout"
   ],
   "sundance_cellular": [
    "fabric_color",
    "remote"
   ],
   "sundance_verticell": [
    "fabric_color",
    "remote"
   ],
   "sundance_cellular_shapes": [
    "fabric_color",
    "remote"
   ],
   "sundance_advantage_ii_2": [
    "fabric_color"
   ],
   "sundance_advantage_ii_2_5": [
    "fabric_color"
   ],
   "sundance_premium_ii_2": [
    "fabric_color"
   ],
   "sundance_premium_ii_2_5": [
    "fabric_color"
   ],
   "sundance_aluminum_1": [
    "fabric_color"
   ],
   "sundance_aluminum_2": [
    "fabric_color"
   ],
   "sundance_basicvue": [
    "fabric_color"
   ],
   "sundance_chateau_woods": [
    "fabric_color"
   ],
   "sundance_vertical_essence": [
    "fabric_color",
    "stack_side",
    "valance_returns"
   ],
   "sundance_stock_vertical": [
    "fabric_color",
    "stack_side"
   ],
   "sundance_walden_premier": [
    "fabric_color",
    "wand_color",
    "front_mount"
   ],
   "sundance_walden_select": [
    "fabric_color",
    "wand_color",
    "front_mount"
   ],
   "sundance_portfolio_roman": [
    "fabric_color"
   ],
   "sundance_exterior_zip": [
    "fabric_color",
    "control",
    "motor_remote_accessories",
    "housing_color_mount_detail"
   ],
   "sundance_exterior_cable": [],
   "sundance_drapery_track": [
    "track_width",
    "mount_type"
   ],
   "sundance_wood_shutters": [
    "shutter_options"
   ],
   "sundance_vinyl_shutters": [
    "shutter_options"
   ]
  },
  "order_header": [
   "account_number",
   "po_number",
   "delivery_method",
   "ship_to_address"
  ]
 }
}$sundance_fields$::jsonb
);

create or replace function line_event.sundance_order_field_source_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  raise exception 'sundance order fields stay on the loaded file';
end
$fn$;

create trigger line_event_sundance_order_field_source_guard
before insert or update or delete on line_event.sundance_order_field_source
for each row execute function line_event.sundance_order_field_source_guard();

create or replace function line_event.sundance_observed_prices_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'observed prices cannot be deleted';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'observed prices cannot be changed';
  end if;
  if current_setting('line_event.via_function', true) is distinct from 'on' then
    raise exception 'observed prices change only through line event functions';
  end if;
  if new.basis is distinct from 'unconfirmed' then
    raise exception 'observed prices stay unconfirmed';
  end if;
  if jsonb_typeof(new.prices) is distinct from 'object' then
    raise exception 'observed prices must be an object';
  end if;
  return new;
end
$fn$;

create trigger line_event_sundance_observed_prices_guard
before insert or update or delete on line_event.sundance_observed_prices
for each row execute function line_event.sundance_observed_prices_guard();

create or replace function line_event.sundance_missing_field(p_category text, p_payload jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $fn$
declare
  v_doc jsonb;
  v_product jsonb;
  v_field jsonb;
  v_value text;
begin
  select document into v_doc
  from line_event.sundance_order_field_source
  where id = 1;
  if v_doc is null then
    return 'order_entry:category';
  end if;
  select item.value into v_product
  from jsonb_array_elements(v_doc->'products') as item(value)
  where item.value->>'category' = p_category
  limit 1;
  if v_product is null then
    return 'order_entry:category';
  end if;
  if v_product->>'status' = 'blocked' then
    return 'order_entry:portal_ordering_type';
  end if;
  for v_field in
    select header.value
    from jsonb_array_elements(v_doc->'order_level_fields'->'sundance_order_header') as header(value)
  loop
    if v_field->>'required' = 'always' then
      v_value := nullif(btrim(coalesce(p_payload->'order'->> (v_field->>'key'), '')), '');
      if v_value is null then
        return 'order_entry:' || (v_field->>'key');
      end if;
    end if;
  end loop;
  for v_field in
    select item.value
    from jsonb_array_elements(v_product->'fields') as item(value)
  loop
    if v_field->>'required' = 'always' then
      v_value := nullif(btrim(coalesce(p_payload->'fields'->> (v_field->>'key'), '')), '');
      if v_value is null then
        return 'order_entry:' || (v_field->>'key');
      end if;
    end if;
  end loop;
  return null;
end
$fn$;

create or replace function line_event.sundance_failure_target(p_message text)
returns table (field_key text, kind text, reason text)
language plpgsql
stable
set search_path = ''
as $fn$
declare
  v_message text := btrim(coalesce(p_message, ''));
  v_prefix text := split_part(v_message, ':', 1);
  v_field text := split_part(v_message, ':', 2);
begin
  if v_prefix in ('order_entry', 'lookup') and v_field ~ '^[a-z0-9_]{1,80}$' and split_part(v_message, ':', 3) = '' then
    field_key := v_field;
    kind := v_prefix;
    reason := v_field;
    return next;
    return;
  end if;
  if v_message ilike '%price_basis_unconfirmed%' then
    field_key := 'price_basis_unconfirmed';
    kind := 'lookup';
  elsif v_message ilike '%no_vendor_account%' then
    field_key := 'no_vendor_account';
    kind := 'lookup';
  elsif v_message ilike '%spec_changed%' or v_message ilike '%spec_hash%' then
    field_key := 'spec_hash';
    kind := 'order_entry';
  elsif v_message ilike '%no_margin%' or v_message ilike '%live_margin%' then
    field_key := 'live_margin';
    kind := 'lookup';
  elsif v_message ilike '%no_site_price%' or v_message ilike '%dealer net%' or v_message ilike '%net price%' then
    field_key := 'dealer_net_base_price';
    kind := 'lookup';
  elsif v_message ilike '%switch_off%' then
    field_key := 'live_lookup_switch';
    kind := 'lookup';
  elsif v_message ilike '%stale_revision%' then
    field_key := 'expected_revision';
    kind := 'order_entry';
  elsif v_message ilike '%captured_at%' then
    field_key := 'captured_at';
    kind := 'lookup';
  elsif v_message ilike '%captured_by%' then
    field_key := 'captured_by';
    kind := 'lookup';
  elsif v_message ilike '%805 account%' or v_message ilike '%vendor account%' then
    field_key := 'account';
    kind := 'lookup';
  elsif v_message ilike '%currency%' then
    field_key := 'currency';
    kind := 'lookup';
  elsif v_message ilike '%source_url%' or v_message ilike '%evidence%' then
    field_key := 'source_url';
    kind := 'lookup';
  elsif v_message ilike '%quote not found%' then
    field_key := 'quote_id';
    kind := 'order_entry';
  elsif v_message ilike '%schema%' then
    field_key := 'schema';
    kind := 'order_entry';
  elsif v_message ilike '%line_id%' or v_message ilike '%line item%' or v_message ilike '%line_ref%' then
    field_key := 'line_id';
    kind := 'order_entry';
  else
    field_key := 'line_id';
    kind := 'order_entry';
  end if;
  reason := case when char_length(v_message) = 0 then field_key else left(v_message, 500) end;
  return next;
end
$fn$;

create or replace function line_event.sundance_portal_prices_unconfirmed(p_payload jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $fn$
declare
  v_prices jsonb := p_payload->'portal_prices';
  v_basis text := lower(btrim(coalesce(p_payload->>'price_basis', '')));
  v_receipt jsonb := p_payload->'receipt';
  v_net text;
  v_dealer text;
begin
  if v_prices is null or jsonb_typeof(v_prices) is distinct from 'object' then
    return false;
  end if;
  if not (
    jsonb_exists(v_prices, 'net')
    or jsonb_exists(v_prices, 'base')
    or jsonb_exists(v_prices, 'options')
    or jsonb_exists(v_prices, 'discount')
    or jsonb_exists(v_prices, 'Net')
    or jsonb_exists(v_prices, 'Base')
    or jsonb_exists(v_prices, 'Options')
    or jsonb_exists(v_prices, 'Discount')
  ) then
    return false;
  end if;
  if v_basis is distinct from 'dealer_net' then
    return true;
  end if;
  v_dealer := nullif(btrim(coalesce(v_receipt->>'dealer_net_base_price', '')), '');
  v_net := nullif(btrim(coalesce(v_prices->>'net', v_prices->>'Net', '')), '');
  if v_dealer is null or (v_net is not null and v_net is distinct from v_dealer) then
    return true;
  end if;
  return false;
end
$fn$;

create or replace function line_event.record_sundance_order_refs(
  p_quote_id uuid,
  p_line_id uuid,
  p_crm_quote_id uuid,
  p_crm_job_id uuid,
  p_product_type text,
  p_portal_draft_id text,
  p_manufacturer_order_ref text,
  p_idempotency_key text,
  p_portal_url text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
  v_status text := case when p_manufacturer_order_ref is null then 'review_ready' else 'order_confirmed' end;
begin
  if p_portal_draft_id is null or p_manufacturer_order_ref is null and v_status = 'order_confirmed' then
    raise exception 'order_entry:manufacturer_order_ref';
  end if;
  if not exists (select 1 from public.crm_quotes where id = p_crm_quote_id) then
    raise exception 'order_entry:crm_quote_id';
  end if;
  if not exists (select 1 from public.crm_jobs where id = p_crm_job_id) then
    raise exception 'order_entry:crm_job_id';
  end if;
  insert into public.crm_vendor_order_drafts (
    crm_quote_id, crm_job_id, manufacturer, product_type, status,
    adapter_version, source_hash, source_kind, source_id, source_revision,
    external_task_id, portal_draft_id, manufacturer_order_ref, portal_url,
    payload, line_count, confirmed_at
  ) values (
    p_crm_quote_id, p_crm_job_id, 'Sundance', coalesce(nullif(btrim(p_product_type), ''), 'Sundance'),
    v_status, 'sundance-line-event/v1', p_idempotency_key, 'signed_contract',
    p_line_id::text, p_idempotency_key, p_idempotency_key,
    p_portal_draft_id, p_manufacturer_order_ref, p_portal_url,
    jsonb_build_object('line_id', p_line_id, 'sales_quote_id', p_quote_id),
    1,
    case when p_manufacturer_order_ref is null then null else now() end
  )
  on conflict (external_task_id) do update
  set portal_draft_id = excluded.portal_draft_id,
      manufacturer_order_ref = excluded.manufacturer_order_ref,
      status = excluded.status,
      portal_url = excluded.portal_url,
      confirmed_at = excluded.confirmed_at,
      updated_at = now()
  returning id into v_id;
  if p_manufacturer_order_ref is not null then
    update public.sales_quotes
    set manufacturer_order_ref = p_manufacturer_order_ref
    where id = p_quote_id;
    update public.crm_quotes
    set manufacturer_order_ref = p_manufacturer_order_ref
    where id = p_crm_quote_id;
  end if;
  return v_id;
end
$fn$;

create or replace function line_event.record_sundance_failure(
  p_line_id uuid,
  p_event_id uuid,
  p_message text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_line line_event.quote_lines%rowtype;
  v_event line_event.events%rowtype;
  v_field text;
  v_kind text;
  v_reason text;
  v_assignee text;
  v_item uuid;
  v_attempt integer;
  v_blocked boolean := false;
  v_prices jsonb;
begin
  select target.field_key, target.kind, target.reason
    into v_field, v_kind, v_reason
  from line_event.sundance_failure_target(p_message) as target;
  v_assignee := case when v_kind = 'lookup' then 'jessica' else 'quoter' end;
  perform set_config('line_event.via_function', 'on', true);
  select * into v_event from line_event.events where id = p_event_id for update;
  if not found then
    raise exception 'line event % not found', p_event_id;
  end if;
  if v_event.manufacturer <> 'sundance' or v_event.line_id is distinct from p_line_id then
    return jsonb_build_object('blocked', false, 'reason', 'not_sundance', 'state', null);
  end if;
  select * into v_line from line_event.quote_lines where line_id = p_line_id for update;
  select coalesce(max(attempt), 0) + 1 into v_attempt
  from line_event.needs_input
  where line_id = p_line_id;
  insert into line_event.needs_input (
    line_id, event_id, idempotency_key, field_key, reason, assignee, kind, attempt
  ) values (
    p_line_id, p_event_id, v_event.idempotency_key, v_field, v_reason, v_assignee, v_kind, v_attempt
  )
  on conflict (idempotency_key, field_key) do nothing
  returning id into v_item;
  if v_item is null then
    select id into v_item
    from line_event.needs_input
    where idempotency_key = v_event.idempotency_key and field_key = v_field;
  end if;
  if v_field = 'price_basis_unconfirmed' then
    v_prices := v_event.payload->'portal_prices';
    if jsonb_typeof(v_prices) = 'object' then
      insert into line_event.sundance_observed_prices (
        line_id, event_id, idempotency_key, prices, basis
      ) values (
        p_line_id, p_event_id, v_event.idempotency_key, v_prices, 'unconfirmed'
      )
      on conflict (idempotency_key) do nothing;
    end if;
  end if;
  if v_line.state in ('priced', 'built') then
    return jsonb_build_object(
      'outcome', 'needs_input',
      'blocked', false,
      'state', v_line.state,
      'field_key', v_field,
      'assignee', v_assignee,
      'kind', v_kind,
      'needs_input_id', v_item,
      'automatic_retries', v_line.automatic_retries,
      'idempotency_key', v_event.idempotency_key
    );
  end if;
  if v_line.state in ('entering', 'entered') then
    perform line_event.apply_transition(p_line_id, 'blocked', 'needs input: ' || v_field);
    if v_event.completed_at is null then
      update line_event.events
      set completed_at = now()
      where id = v_event.id;
    end if;
    v_blocked := true;
  end if;
  select * into v_line from line_event.quote_lines where line_id = p_line_id;
  return jsonb_build_object(
    'outcome', 'needs_input',
    'blocked', v_blocked,
    'state', v_line.state,
    'field_key', v_field,
    'assignee', v_assignee,
    'kind', v_kind,
    'needs_input_id', v_item,
    'automatic_retries', v_line.automatic_retries,
    'idempotency_key', v_event.idempotency_key
  );
end
$fn$;

create or replace function line_event.consume_sundance_line_event(
  p_idempotency_key text,
  p_claimed_by text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor text := coalesce(nullif(btrim(coalesce(p_claimed_by, '')), ''), 'manufacturer_bot_sundance');
  v_event line_event.events%rowtype;
  v_line line_event.quote_lines%rowtype;
  v_error text;
  v_message text;
  v_quote uuid;
  v_crm_quote uuid;
  v_crm_job uuid;
  v_revision bigint;
  v_variant text;
  v_actor_name text;
  v_category text;
  v_outcome text;
  v_portal_draft text;
  v_order_ref text;
  v_product text;
  v_receipt jsonb;
  v_recorded jsonb;
  v_record uuid;
  v_priced jsonb;
  v_draft uuid;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[0-9a-fA-F-]{36}:[1-9][0-9]*$' then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'bad_key', 'blocked', false);
  end if;
  if char_length(v_actor) > 200 then
    raise exception 'claimed_by is too long';
  end if;
  perform set_config('line_event.via_function', 'on', true);
  select * into v_event
  from line_event.events
  where idempotency_key = p_idempotency_key
  for update;
  if not found then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'missing', 'blocked', false);
  end if;
  select * into v_line
  from line_event.quote_lines
  where line_id = v_event.line_id
  for update;
  if v_event.manufacturer <> 'sundance' then
    return jsonb_build_object(
      'outcome', 'ignored',
      'reason', 'not_sundance',
      'blocked', false,
      'state', v_line.state,
      'idempotency_key', v_event.idempotency_key,
      'manufacturer', v_event.manufacturer
    );
  end if;
  if v_line.version is distinct from v_event.line_version then
    return jsonb_build_object(
      'outcome', 'ignored',
      'reason', 'stale_version',
      'blocked', false,
      'state', v_line.state,
      'idempotency_key', v_event.idempotency_key,
      'line_version', v_line.version
    );
  end if;
  if v_event.completed_at is not null or v_line.state in ('priced', 'built', 'cancelled') then
    return jsonb_build_object(
      'outcome', 'noop',
      'reason', 'duplicate',
      'blocked', false,
      'state', v_line.state,
      'idempotency_key', v_event.idempotency_key,
      'duplicate', true
    );
  end if;
  if v_line.state = 'queued' and v_event.claimed_at is null then
    update line_event.events
    set claimed_by = v_actor,
        claimed_at = now()
    where id = v_event.id
    returning * into v_event;
    perform line_event.apply_transition(v_event.line_id, 'entering', null);
  elsif v_line.state is distinct from 'entering' or v_event.claimed_by is distinct from v_actor then
    return jsonb_build_object(
      'outcome', 'ignored',
      'reason', 'not_claimable',
      'blocked', false,
      'state', v_line.state,
      'idempotency_key', v_event.idempotency_key
    );
  end if;
  begin
    if v_event.payload is null or jsonb_typeof(v_event.payload) <> 'object' then
      raise exception 'order_entry:payload';
    end if;
    v_category := nullif(btrim(coalesce(v_event.payload->>'category', '')), '');
    if v_category is null then
      raise exception 'order_entry:category';
    end if;
    v_error := line_event.sundance_missing_field(v_category, v_event.payload);
    if v_error is not null then
      raise exception '%', v_error;
    end if;
    v_outcome := lower(btrim(coalesce(v_event.payload->>'outcome', '')));
    if v_outcome not in ('draft', 'ordered') then
      raise exception 'order_entry:outcome';
    end if;
    v_portal_draft := nullif(btrim(coalesce(v_event.payload->>'portal_draft_id', '')), '');
    if v_portal_draft is null then
      raise exception 'order_entry:portal_draft_id';
    end if;
    v_order_ref := nullif(btrim(coalesce(v_event.payload->>'manufacturer_order_ref', '')), '');
    if v_outcome = 'ordered' and v_order_ref is null then
      raise exception 'order_entry:manufacturer_order_ref';
    end if;
    if nullif(btrim(coalesce(v_event.payload->>'quote_id', '')), '') is null then
      raise exception 'order_entry:quote_id';
    end if;
    begin
      v_quote := (v_event.payload->>'quote_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'order_entry:quote_id';
    end;
    begin
      v_crm_quote := (v_event.payload->>'crm_quote_id')::uuid;
      v_crm_job := (v_event.payload->>'crm_job_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'order_entry:crm_quote_id';
    end;
    if v_crm_quote is null then
      raise exception 'order_entry:crm_quote_id';
    end if;
    if v_crm_job is null then
      raise exception 'order_entry:crm_job_id';
    end if;
    if nullif(btrim(coalesce(v_event.payload->>'variant', '')), '') is null then
      raise exception 'order_entry:variant';
    end if;
    v_variant := btrim(v_event.payload->>'variant');
    if nullif(btrim(coalesce(v_event.payload->>'expected_revision', '')), '') is null then
      raise exception 'order_entry:expected_revision';
    end if;
    begin
      v_revision := (v_event.payload->>'expected_revision')::bigint;
    exception when others then
      raise exception 'order_entry:expected_revision';
    end;
    if v_revision is null or v_revision < 0 then
      raise exception 'order_entry:expected_revision';
    end if;
    v_actor_name := lower(btrim(coalesce(v_event.payload->>'actor', '')));
    if v_actor_name not in ('mike', 'jessica') then
      raise exception 'lookup:actor';
    end if;
    select product_type into v_product
    from public.sales_quote_line_items
    where id = v_event.line_id and quote_id = v_quote;
    if v_product is null and not exists (
      select 1 from public.sales_quote_line_items where id = v_event.line_id and quote_id = v_quote
    ) then
      raise exception 'order_entry:line_id';
    end if;
    if line_event.sundance_portal_prices_unconfirmed(v_event.payload) then
      raise exception 'lookup:price_basis_unconfirmed';
    end if;
    v_receipt := v_event.payload->'receipt';
    if v_receipt is null or jsonb_typeof(v_receipt) <> 'object' then
      raise exception 'order_entry:receipt';
    end if;
    if v_receipt->>'schema' is distinct from '805-price-record/v1' then
      raise exception 'order_entry:schema';
    end if;
    if nullif(btrim(coalesce(v_receipt->>'line_id', '')), '') is null
       or lower(btrim(v_receipt->>'line_id')) is distinct from lower(v_event.line_id::text) then
      raise exception 'order_entry:line_id';
    end if;
    if nullif(btrim(coalesce(v_receipt->>'dealer_net_base_price', '')), '') is null then
      raise exception 'lookup:dealer_net_base_price';
    end if;
    if lower(btrim(coalesce(v_receipt->>'vendor', ''))) is distinct from 'sundance' then
      raise exception 'lookup:account';
    end if;
    if not exists (
      select 1 from public.crm_vendor_accounts
      where vendor = 'sundance'
        and active
        and account_number = v_receipt->>'account'
    ) then
      raise exception 'lookup:no_vendor_account';
    end if;
    select id into v_record
    from public.crm_vendor_price_receipts
    where quote_id = v_quote
      and line_id = v_event.line_id
      and receipt = v_receipt
    order by created_at desc
    limit 1;
    if v_record is null then
      v_recorded := public.record_vendor_price_receipt(v_quote, v_revision, v_receipt, v_actor_name);
      v_record := (v_recorded->'records'->0->>'record_id')::uuid;
    end if;
    v_priced := public.price_line_from_receipt(
      v_quote, v_event.line_id, v_variant, v_record, v_revision, v_event.id
    );
    v_draft := line_event.record_sundance_order_refs(
      v_quote, v_event.line_id, v_crm_quote, v_crm_job, v_product,
      v_portal_draft, v_order_ref, v_event.idempotency_key,
      nullif(btrim(coalesce(v_receipt->>'source_url', '')), '')
    );
    perform line_event.apply_transition(v_event.line_id, 'entered', null);
    update line_event.events
    set completed_at = now()
    where id = v_event.id and completed_at is null;
    perform line_event.apply_transition(v_event.line_id, 'priced', null);
    return jsonb_build_object(
      'outcome', 'priced',
      'blocked', false,
      'state', 'priced',
      'duplicate', false,
      'idempotency_key', v_event.idempotency_key,
      'event_id', v_event.id,
      'line_id', v_event.line_id,
      'record_id', v_record,
      'draft_id', v_draft,
      'portal_draft_id', v_portal_draft,
      'manufacturer_order_ref', v_order_ref,
      'price', v_priced
    );
  exception when others then
    v_message := sqlerrm;
  end;
  return line_event.record_sundance_failure(v_event.line_id, v_event.id, v_message);
end
$fn$;

create or replace function line_event.correct_sundance_line_input(
  p_needs_input_id uuid,
  p_payload jsonb,
  p_corrected_by text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_item line_event.needs_input%rowtype;
  v_line line_event.quote_lines%rowtype;
  v_by text := lower(btrim(coalesce(p_corrected_by, '')));
  v_enqueued jsonb;
begin
  if p_needs_input_id is null then
    raise exception 'needs_input_id is required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload must be a json object';
  end if;
  if v_by not in ('quoter', 'jessica') then
    raise exception 'corrected_by must be quoter or jessica';
  end if;
  perform set_config('line_event.via_function', 'on', true);
  select * into v_item from line_event.needs_input where id = p_needs_input_id for update;
  if not found then
    raise exception 'needs input % not found', p_needs_input_id;
  end if;
  select * into v_line from line_event.quote_lines where line_id = v_item.line_id for update;
  if v_item.status = 'corrected' then
    return jsonb_build_object(
      'duplicate', true,
      'enqueued', false,
      'blocked', false,
      'state', v_line.state,
      'automatic_retries', v_line.automatic_retries,
      'reason', 'duplicate'
    );
  end if;
  if v_by is distinct from v_item.assignee then
    return jsonb_build_object(
      'duplicate', false,
      'enqueued', false,
      'blocked', false,
      'state', v_line.state,
      'automatic_retries', v_line.automatic_retries,
      'reason', 'assignee'
    );
  end if;
  update line_event.needs_input
  set status = 'corrected',
      corrected_at = now(),
      corrected_by = v_by
  where id = v_item.id;
  if v_line.state in ('priced', 'built') then
    return jsonb_build_object(
      'duplicate', false,
      'enqueued', false,
      'blocked', false,
      'state', v_line.state,
      'automatic_retries', v_line.automatic_retries,
      'reason', 'priced'
    );
  end if;
  if v_line.automatic_retries >= 1 then
    return jsonb_build_object(
      'duplicate', false,
      'enqueued', false,
      'blocked', v_line.state = 'blocked',
      'state', v_line.state,
      'automatic_retries', v_line.automatic_retries,
      'reason', 'retry_spent'
    );
  end if;
  if v_line.state is distinct from 'blocked' then
    return jsonb_build_object(
      'duplicate', false,
      'enqueued', false,
      'blocked', false,
      'state', v_line.state,
      'automatic_retries', v_line.automatic_retries,
      'reason', 'not_blocked'
    );
  end if;
  update line_event.quote_lines
  set automatic_retries = automatic_retries + 1,
      updated_at = now()
  where line_id = v_line.line_id;
  v_enqueued := line_event.enqueue_line_event(v_line.line_id, v_line.version + 1, 'sundance', p_payload);
  return v_enqueued || jsonb_build_object(
    'duplicate', false,
    'enqueued', true,
    'automatic_retries', 1,
    'reason', 'retry'
  );
end
$fn$;

create or replace function public.wake_line_event_worker(p_manufacturer text, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_manufacturer text := line_event.require_manufacturer(p_manufacturer);
  v_enabled text;
  v_url text;
  v_secret text;
  v_key text;
  v_body jsonb;
  v_headers jsonb;
begin
  if p_event_id is null then
    raise exception 'event_id is required';
  end if;
  if v_manufacturer = 'norman' then
    v_enabled := current_setting('line_event.wake_http', true);
    v_url := nullif(btrim(coalesce(current_setting('line_event.worker_url', true), '')), '');
    v_secret := nullif(btrim(coalesce(current_setting('line_event.worker_secret', true), '')), '');
  elsif v_manufacturer = 'onyx' then
    v_enabled := current_setting('line_event.onyx_wake_http', true);
    v_url := nullif(btrim(coalesce(current_setting('line_event.onyx_worker_url', true), '')), '');
    v_secret := nullif(btrim(coalesce(current_setting('line_event.onyx_worker_secret', true), '')), '');
  elsif v_manufacturer = 'sundance' then
    v_enabled := current_setting('line_event.sundance_wake_http', true);
    v_url := nullif(btrim(coalesce(current_setting('line_event.sundance_worker_url', true), '')), '');
    v_secret := nullif(btrim(coalesce(current_setting('line_event.sundance_worker_secret', true), '')), '');
  else
    return jsonb_build_object(
      'woken', false,
      'reason', 'wake_disabled',
      'manufacturer', v_manufacturer,
      'event_id', p_event_id,
      'schema', '805-line-event/v1'
    );
  end if;
  if v_enabled is distinct from 'on' then
    return jsonb_build_object(
      'woken', false,
      'reason', 'wake_disabled',
      'manufacturer', v_manufacturer,
      'event_id', p_event_id,
      'schema', '805-line-event/v1'
    );
  end if;
  if v_url is null or v_secret is null or v_url !~ '^https://' then
    return jsonb_build_object(
      'woken', false,
      'reason', 'wake_unconfigured',
      'manufacturer', v_manufacturer,
      'event_id', p_event_id,
      'schema', '805-line-event/v1'
    );
  end if;
  select idempotency_key into v_key from line_event.events where id = p_event_id;
  if v_key is null then
    raise exception 'line event % not found', p_event_id;
  end if;
  v_body := jsonb_build_object(
    'manufacturer', v_manufacturer,
    'event_id', p_event_id,
    'idempotency_key', v_key
  );
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_secret
  );
  begin
    execute 'select net.http_post($1, $2, $3::jsonb, $4, $5)'
      using v_url, v_body, '{}'::jsonb, v_headers, 5000;
  exception when others then
    return jsonb_build_object(
      'woken', false,
      'reason', 'wake_unconfigured',
      'manufacturer', v_manufacturer,
      'event_id', p_event_id,
      'schema', '805-line-event/v1'
    );
  end;
  return jsonb_build_object(
    'woken', true,
    'reason', 'http',
    'manufacturer', v_manufacturer,
    'event_id', p_event_id,
    'schema', '805-line-event/v1'
  );
end
$fn$;

comment on function public.wake_line_event_worker(text, uuid) is
  'Posts one Norman, Onyx, or Sundance line event when that maker''s own wake gate, URL, and secret are set. Otherwise returns wake_disabled or wake_unconfigured and does not call out. Lotus stays disabled. enqueue_line_event is the only caller.';

create or replace function public.consume_sundance_line_event(
  p_idempotency_key text,
  p_claimed_by text default 'manufacturer_bot_sundance'
) returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select line_event.consume_sundance_line_event(p_idempotency_key, p_claimed_by);
$fn$;

create or replace function public.correct_sundance_line_input(
  p_needs_input_id uuid,
  p_payload jsonb,
  p_corrected_by text
) returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select line_event.correct_sundance_line_input(p_needs_input_id, p_payload, p_corrected_by);
$fn$;

comment on function public.consume_sundance_line_event(text, text) is
  'Claims one Sundance line event by idempotency key line_id:version. Writes the portal draft and maker order number, and applies a dealer-net receipt. A duplicate is a no-op. A priced line is never blocked. Portal Net stays price_basis_unconfirmed.';

comment on function public.correct_sundance_line_input(uuid, jsonb, text) is
  'Records an in-CRM Sundance correction and requeues the line once. A second correction does not requeue. No outbound message.';

do $role$
begin
  if not exists (select 1 from pg_roles where rolname = 'manufacturer_bot_sundance') then
    create role manufacturer_bot_sundance nologin;
  end if;
end
$role$;

comment on role manufacturer_bot_sundance is
  'Sundance line-event consumer. NOLOGIN. Execute on consume_sundance_line_event and correct_sundance_line_input only.';

revoke all on function line_event.sundance_order_field_source_guard() from public;
revoke all on function line_event.sundance_observed_prices_guard() from public;
revoke all on function line_event.sundance_missing_field(text, jsonb) from public;
revoke all on function line_event.sundance_failure_target(text) from public;
revoke all on function line_event.sundance_portal_prices_unconfirmed(jsonb) from public;
revoke all on function line_event.record_sundance_order_refs(uuid, uuid, uuid, uuid, text, text, text, text, text) from public;
revoke all on function line_event.record_sundance_failure(uuid, uuid, text) from public;
revoke all on function line_event.consume_sundance_line_event(text, text) from public;
revoke all on function line_event.correct_sundance_line_input(uuid, jsonb, text) from public;
revoke all on function public.consume_sundance_line_event(text, text) from public;
revoke all on function public.correct_sundance_line_input(uuid, jsonb, text) from public;

grant execute on function line_event.sundance_missing_field(text, jsonb) to current_user;
grant execute on function line_event.sundance_failure_target(text) to current_user;
grant execute on function line_event.sundance_portal_prices_unconfirmed(jsonb) to current_user;
grant execute on function line_event.record_sundance_order_refs(uuid, uuid, uuid, uuid, text, text, text, text, text) to current_user;
grant execute on function line_event.record_sundance_failure(uuid, uuid, text) to current_user;
grant execute on function line_event.consume_sundance_line_event(text, text) to current_user;
grant execute on function line_event.correct_sundance_line_input(uuid, jsonb, text) to current_user;
grant execute on function public.consume_sundance_line_event(text, text) to current_user;
grant execute on function public.correct_sundance_line_input(uuid, jsonb, text) to current_user;

grant execute on function public.consume_sundance_line_event(text, text) to service_role, manufacturer_bot_sundance;
grant execute on function public.correct_sundance_line_input(uuid, jsonb, text) to service_role, manufacturer_bot_sundance;

do $revoke$
declare
  target text;
  fn text;
begin
  foreach target in array array['anon', 'authenticated', 'manufacturer_bot', 'manufacturer_bot_norman'] loop
    if exists (select 1 from pg_roles where rolname = target) then
      foreach fn in array array[
        'public.consume_sundance_line_event(text, text)',
        'public.correct_sundance_line_input(uuid, jsonb, text)'
      ] loop
        execute format('revoke all on function %s from %I', fn, target);
      end loop;
    end if;
  end loop;
  foreach target in array array['anon', 'authenticated', 'service_role', 'manufacturer_bot', 'manufacturer_bot_norman', 'manufacturer_bot_sundance'] loop
    if exists (select 1 from pg_roles where rolname = target) then
      execute format('revoke all on table line_event.sundance_order_field_source from %I', target);
      execute format('revoke all on table line_event.sundance_observed_prices from %I', target);
    end if;
  end loop;
end
$revoke$;

notify pgrst, 'reload schema';
