import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://nookbyjina.my.id";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Disallow internal API endpoints only.
        // Private pages (admin, checkout, pembayaran, pesanan, sukses, keranjang)
        // are allowed to be crawled so search engines can read and obey their
        // <meta name="robots" content="noindex, nofollow"> directives.
        disallow: ["/api/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
