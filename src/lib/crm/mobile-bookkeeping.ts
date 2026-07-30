import type { CrmCustomerFile } from "@/lib/crm/types";

export function findMobileBookkeepingFileById(
  files: CrmCustomerFile[],
  customerFileId: string | null | undefined
) {
  const id = String(customerFileId || "").trim();
  if (!id) return null;
  return files.find((file) => file.id === id) || null;
}
