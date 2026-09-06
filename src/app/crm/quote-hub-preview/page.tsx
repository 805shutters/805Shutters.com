import { notFound } from "next/navigation";
import { QuoteHubPreview } from "./preview";
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <QuoteHubPreview />;
}
