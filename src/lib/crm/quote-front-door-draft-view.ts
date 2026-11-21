/** A front-door draft as the quote screen may show it. It is read-only and cannot be sent. */
export type FrontDoorDraftCard = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  manufacturer: string;
  category: string;
  multiplier: string;
  readBack: string;
  createdAt: string;
  status: "draft";
  label: "Front-door draft";
  readOnly: true;
  sent: false;
};

export function frontDoorDraftCard(value: unknown): FrontDoorDraftCard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.status !== "draft") return null;
  const id = text(row.id);
  const customerName = text(row.customer_name ?? row.customerName);
  const manufacturer = text(row.manufacturer);
  const category = text(row.category);
  const readBack = text(row.read_back ?? row.readBack);
  const multiplier = multiplierText(row.multiplier);
  if (!id || !customerName || !manufacturer || !category || !readBack || !multiplier) return null;
  return {
    id,
    customerName,
    customerPhone: text(row.customer_phone ?? row.customerPhone),
    customerAddress: text(row.customer_address ?? row.customerAddress),
    manufacturer,
    category,
    multiplier,
    readBack,
    createdAt: text(row.created_at ?? row.createdAt) ?? "",
    status: "draft",
    label: "Front-door draft",
    readOnly: true,
    sent: false,
  };
}

export function frontDoorDraftCards(value: unknown): FrontDoorDraftCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const card = frontDoorDraftCard(item);
    return card ? [card] : [];
  });
}

/** Front-door drafts stay on the draft view. They are not sent, sold, or openable. */
export function visibleFrontDoorDrafts(drafts: FrontDoorDraftCard[], filter: string, search: string) {
  if (filter !== "all" && filter !== "draft") return [];
  const needle = search.trim().toLowerCase();
  if (!needle) return drafts;
  return drafts.filter((draft) =>
    [draft.customerName, draft.customerPhone, draft.customerAddress, draft.manufacturer, draft.category, draft.readBack, draft.label]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

function multiplierText(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return String(numeric);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
