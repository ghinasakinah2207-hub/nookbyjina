/**
 * Official Brand Configuration: Nook by Jina
 * Centralized constants for customer-facing brand identity, logos, and messaging.
 */

export const BRAND = {
  name: "Nook by Jina",
  lowercaseName: "nook by jina",
  uppercaseName: "NOOK BY JINA",
  tagline: "Makanan homemade dibuat dengan penuh rasa dan kehangatan.",
  defaultLocation: "Lhoksukon, Aceh Utara",
  defaultArea: "Lhoksukon",
  defaultWhatsapp: "6282273180000",
  contact: {
    whatsappNumber: "6282273180000",
    formattedWhatsapp: "+62 822-7318-0000",
    defaultWhatsappMessage: "Halo Nook by Jina, saya ingin bertanya seputar menu dan pemesanan.",
    locationText: "Lhoksukon, Aceh Utara",
    operatingHoursText: "Setiap Hari: 09:00 – 17:00 WIB",
    serviceAreaText: "Lhoksukon & Sekitarnya",
  },
  social: {
    // Owner configuration: set NEXT_PUBLIC_INSTAGRAM_URL (e.g. "https://instagram.com/nookbyjina")
    instagramUrl: process.env.NEXT_PUBLIC_INSTAGRAM_URL || "",
    instagramHandle: process.env.NEXT_PUBLIC_INSTAGRAM_HANDLE || "",
  },
  logos: {
    // Light / white logo for dark backgrounds (e.g. Welcome / Landing Page)
    light: "/images/homepagelogo.webp",
    welcomePage: "/images/homepagelogo.webp",
    // Dark / black logo for light backgrounds (e.g. Main Homepage / Shared Header)
    dark: "/images/mainpagelogo.webp",
    homePage: "/images/mainpagelogo.webp",
    // Legacy alias
    mainPage: "/images/homepagelogo.webp",
  },
  meta: {
    title: "Nook by Jina — Makanan Homemade Penuh Rasa & Kehangatan",
    description:
      "Pesan menu makanan homemade lezat dari Nook by Jina di Lhoksukon. Nasi bakar cakalang, risol mayo lumer, dimsum mentai, dan minuman segar untuk pickup dan delivery.",
    ogTitle: "Nook by Jina — Makanan Homemade",
    ogDescription: "Pemesanan makanan homemade praktis dan terpercaya di Lhoksukon.",
  },
} as const;
