import { NextResponse } from "next/server";
import { site } from "@/lib/site-data";

export const runtime = "nodejs";

type YelpApiReview = {
  id?: string;
  rating?: number;
  text?: string;
  url?: string;
  time_created?: string;
  user?: {
    name?: string;
    image_url?: string;
  };
};

type YelpApiResponse = {
  reviews?: YelpApiReview[];
  total?: number;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=82800"
    }
  });
}

export async function GET() {
  const apiKey = process.env.YELP_API_KEY;
  const businessAlias = process.env.YELP_BUSINESS_ALIAS || "805-shutters-shades-blinds-camarillo-2";

  if (!apiKey) {
    return jsonResponse({
      businessUrl: site.social.yelp,
      configured: false,
      reviews: []
    });
  }

  try {
    const response = await fetch(`https://api.yelp.com/v3/businesses/${businessAlias}/reviews`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      },
      next: {
        revalidate: 3600
      }
    });

    if (!response.ok) {
      return jsonResponse({
        businessUrl: site.social.yelp,
        configured: true,
        reviews: []
      });
    }

    const payload = (await response.json()) as YelpApiResponse;
    const reviews = (payload.reviews || []).map((review, index) => ({
      id: review.id || review.url || `${businessAlias}-${index}`,
      rating: review.rating || 0,
      text: review.text || "",
      url: review.url || site.social.yelp,
      timeCreated: review.time_created || "",
      userName: review.user?.name || "Yelp reviewer",
      userImageUrl: review.user?.image_url || ""
    }));

    return jsonResponse({
      businessUrl: site.social.yelp,
      configured: true,
      total: payload.total || reviews.length,
      reviews
    });
  } catch (error) {
    console.error(error);

    return jsonResponse({
      businessUrl: site.social.yelp,
      configured: true,
      reviews: []
    });
  }
}
