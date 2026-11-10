import type { MetadataRoute } from "next";
import { getVisibleProducts } from "@/lib/supabase/catalog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://nookbyjina.my.id";
  const currentDate = new Date();

  // Core public canonical and indexable routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: currentDate,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/home`,
      lastModified: currentDate,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/menu`,
      lastModified: currentDate,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  // Fetch active, non-archived catalog products for dynamic canonical product URLs
  try {
    const products = await getVisibleProducts().catch(() => []);
    const seenUrls = new Set<string>();
    const productRoutes: MetadataRoute.Sitemap = [];

    for (const p of products) {
      // Strictly exclude inactive or archived products
      if (p.isArchived || !p.isAvailable) continue;

      // Use canonical slug if present; otherwise fallback to unique id
      const identifier = (p.slug && p.slug.trim()) ? p.slug.trim() : p.id;
      if (!identifier) continue;

      const productUrl = `${baseUrl}/produk/${encodeURIComponent(identifier)}`;
      if (!seenUrls.has(productUrl)) {
        seenUrls.add(productUrl);
        productRoutes.push({
          url: productUrl,
          lastModified: currentDate,
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }
    }

    return [...staticRoutes, ...productRoutes];
  } catch (error) {
    console.error("[sitemap] Failed to fetch dynamic product routes:", error);
    return staticRoutes;
  }
}
