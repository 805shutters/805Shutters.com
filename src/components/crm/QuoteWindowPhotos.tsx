"use client";

import { useQuery } from "@tanstack/react-query";
import { useQuoteBuilderDatabase } from "@mts/integrations/supabase/quoteBuilderDatabase";
import type { MobileQuotePhoto } from "@/lib/crm/mobile-quote-photos";

/** One authenticated read per quote, shared by every visible window. URLs expire after 15 minutes. */
export function QuoteWindowPhotos({ quoteId, lineItemId }: { quoteId: string; lineItemId: string }) {
  const { database, isolated } = useQuoteBuilderDatabase();
  const photos = useQuery({
    queryKey: ["quote-window-photos", quoteId],
    enabled: Boolean(quoteId) && !isolated,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await database.auth.getSession();
      if (error) throw error;
      if (!data.session) throw new Error("Sign in to view window photos.");
      const response = await fetch(`/api/crm/mobile/quote-photos/?quoteId=${encodeURIComponent(quoteId)}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store",
      });
      if (!response.ok) throw new Error("Window photos could not be loaded.");
      return (await response.json() as { photos: MobileQuotePhoto[] }).photos;
    },
  });
  if (isolated) return null;
  if (photos.isError) return <div role="status" className="text-sm text-amber-900">Window photos could not be loaded. <button type="button" className="underline" onClick={() => void photos.refetch()}>Retry photos</button></div>;
  const rows = photos.data?.filter((photo) => photo.lineItemId === lineItemId) || [];
  if (!rows.length) return null;
  return <div aria-label="Saved window photos" className="flex flex-wrap gap-2 py-2">
    {rows.map((photo, index) => <a key={photo.photoId} href={photo.url} target="_blank" rel="noreferrer" aria-label={`Open window photo ${index + 1}`}>
      <img src={photo.url} alt={`Window reference ${index + 1}`} width={112} height={84} className="h-20 w-28 rounded-md border object-cover" />
    </a>)}
  </div>;
}
