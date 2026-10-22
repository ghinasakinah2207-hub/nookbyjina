import {
  Utensils,
  UtensilsCrossed,
  CookingPot,
  Soup,
  Salad,
  Fish,
  Beef,
  EggFried,
  Flame,
  CupSoda,
  Coffee,
  Milk,
  GlassWater,
  Wine,
  Cookie,
  Popcorn,
  Sandwich,
  Pizza,
  Hamburger,
  CakeSlice,
  Cupcake,
  IceCream,
  IceCreamBowl,
  Candy,
  Croissant,
  Donut,
  Wheat,
  Sparkles,
  Store,
  Tag,
  ShoppingBag,
  LayoutGrid,
  LucideIcon,
} from "lucide-react";

export type IconGroupKey =
  | "all"
  | "makanan"
  | "minuman"
  | "snack"
  | "dessert"
  | "bakery"
  | "umum";

export interface CategoryIconDefinition {
  id: string; // Stored in database, e.g. 'utensils', 'cup-soda'
  label: string; // Indonesian readable label
  group: IconGroupKey;
  groupLabel: string;
  keywords: string[];
  icon: LucideIcon;
}

/**
 * Curated allowlist of supported category icons from lucide-react.
 * Guarantees strict allowlisting (no arbitrary string evaluation).
 */
export const SUPPORTED_CATEGORY_ICONS: CategoryIconDefinition[] = [
  // --- MAKANAN (MEALS & DISHES) ---
  {
    id: "utensils",
    label: "Makanan Umum",
    group: "makanan",
    groupLabel: "Makanan",
    keywords: ["makanan", "food", "sendok", "garpu", "dinner", "lunch", "piring", "lauk"],
    icon: Utensils,
  },
  {
    id: "utensils-crossed",
    label: "Sendok Garpu Bersilang",
    group: "makanan",
    groupLabel: "Makanan",
    keywords: ["resto", "makan", "hidangan", "kuliner", "cross"],
    icon: UtensilsCrossed,
  },
  {
    id: "cooking-pot",
    label: "Nasi & Masakan Pot",
    group: "makanan",
    groupLabel: "Makanan",
    keywords: ["nasi", "rice", "pot", "masak", "rendang", "gulai", "kari", "bakar"],
    icon: CookingPot,
  },
  {
    id: "soup",
    label: "Sup & Mie Kuah",
    group: "makanan",
    groupLabel: "Makanan",
    keywords: ["sup", "mie", "kuah", "soto", "bakso", "noodle", "ramen", "mangkuk", "bowl"],
    icon: Soup,
  },
  {
    id: "salad",
    label: "Salad & Sayuran",
    group: "makanan",
    groupLabel: "Makanan",
    keywords: ["salad", "sayur", "sehat", "lalapan", "fresh", "diet"],
    icon: Salad,
  },
  {
    id: "fish",
    label: "Ikan & Seafood",
    group: "makanan",
    groupLabel: "Makanan",
    keywords: ["cakalang", "ikan", "tuna", "seafood", "laut", "tongkol", "fish"],
    icon: Fish,
  },
  {
    id: "beef",
    label: "Daging & Sapi",
    group: "makanan",
    groupLabel: "Makanan",
    keywords: ["daging", "sapi", "meat", "steak", "beef", "iga"],
    icon: Beef,
  },
  {
    id: "egg-fried",
    label: "Telur Mata Sapi",
    group: "makanan",
    groupLabel: "Makanan",
    keywords: ["telur", "egg", "sarapan", "ceplok", "dadar"],
    icon: EggFried,
  },
  {
    id: "flame",
    label: "Bakar & Pedas",
    group: "makanan",
    groupLabel: "Makanan",
    keywords: ["bakar", "pedas", "panggang", "grill", "spicy", "hot", "sambal", "api"],
    icon: Flame,
  },

  // --- MINUMAN (BEVERAGES) ---
  {
    id: "cup-soda",
    label: "Minuman Dingin / Es",
    group: "minuman",
    groupLabel: "Minuman",
    keywords: ["es", "dingin", "soda", "sirup", "boba", "drink", "beverage", "teh es"],
    icon: CupSoda,
  },
  {
    id: "coffee",
    label: "Kopi & Teh Hangat",
    group: "minuman",
    groupLabel: "Minuman",
    keywords: ["kopi", "coffee", "latte", "espresso", "teh", "tea", "hangat", "hot"],
    icon: Coffee,
  },
  {
    id: "milk",
    label: "Susu & Shake",
    group: "minuman",
    groupLabel: "Minuman",
    keywords: ["susu", "milk", "shake", "matcha", "dairy"],
    icon: Milk,
  },
  {
    id: "glass-water",
    label: "Air Mineral / Segar",
    group: "minuman",
    groupLabel: "Minuman",
    keywords: ["air", "water", "mineral", "segar", "fresh", "jus", "juice"],
    icon: GlassWater,
  },
  {
    id: "wine",
    label: "Mocktail / Sirup",
    group: "minuman",
    groupLabel: "Minuman",
    keywords: ["sirup", "mocktail", "cocktail", "gelas"],
    icon: Wine,
  },

  // --- SNACK & CAMILAN ---
  {
    id: "cookie",
    label: "Kue Kering & Biskuit",
    group: "snack",
    groupLabel: "Snack",
    keywords: ["kue", "biskuit", "kering", "cookies", "snack", "camilan"],
    icon: Cookie,
  },
  {
    id: "popcorn",
    label: "Popcorn & Camilan Ringan",
    group: "snack",
    groupLabel: "Snack",
    keywords: ["popcorn", "jagung", "keripik", "chips", "camilan"],
    icon: Popcorn,
  },
  {
    id: "sandwich",
    label: "Roti Toast & Risol",
    group: "snack",
    groupLabel: "Snack",
    keywords: ["roti", "sandwich", "toast", "risol", "mayo", "gorengan"],
    icon: Sandwich,
  },
  {
    id: "pizza",
    label: "Pizza & Gurih",
    group: "snack",
    groupLabel: "Snack",
    keywords: ["pizza", "slice", "keju", "cheese", "mentai"],
    icon: Pizza,
  },
  {
    id: "hamburger",
    label: "Burger & Fast Food",
    group: "snack",
    groupLabel: "Snack",
    keywords: ["burger", "hamburger", "fast food", "roti isi"],
    icon: Hamburger,
  },

  // --- DESSERT & MANIS ---
  {
    id: "cake-slice",
    label: "Kue / Tart Potong",
    group: "dessert",
    groupLabel: "Dessert",
    keywords: ["kue", "cake", "tart", "tiramisu", "bolu", "slice", "dessert", "manis"],
    icon: CakeSlice,
  },
  {
    id: "cupcake",
    label: "Cupcake & Muffin",
    group: "dessert",
    groupLabel: "Dessert",
    keywords: ["cupcake", "muffin", "manis", "roti kecil"],
    icon: Cupcake,
  },
  {
    id: "ice-cream",
    label: "Es Krim Cone",
    group: "dessert",
    groupLabel: "Dessert",
    keywords: ["es krim", "ice cream", "gelato", "cone", "dingin", "manis"],
    icon: IceCream,
  },
  {
    id: "ice-cream-bowl",
    label: "Es Krim Mangkuk / Sundae",
    group: "dessert",
    groupLabel: "Dessert",
    keywords: ["sundae", "es campur", "gelato", "dessert bowl"],
    icon: IceCreamBowl,
  },
  {
    id: "candy",
    label: "Permen & Manisan",
    group: "dessert",
    groupLabel: "Dessert",
    keywords: ["permen", "manisan", "candy", "sweet"],
    icon: Candy,
  },

  // --- BAKERY & OLAHAN TEPUNG ---
  {
    id: "croissant",
    label: "Croissant & Pastry",
    group: "bakery",
    groupLabel: "Bakery",
    keywords: ["croissant", "pastry", "puff", "danish", "roti"],
    icon: Croissant,
  },
  {
    id: "donut",
    label: "Donat",
    group: "bakery",
    groupLabel: "Bakery",
    keywords: ["donat", "donut", "manis", "glaze"],
    icon: Donut,
  },
  {
    id: "wheat",
    label: "Gandum & Roti Klasik",
    group: "bakery",
    groupLabel: "Bakery",
    keywords: ["gandum", "wheat", "grain", "roti tawar"],
    icon: Wheat,
  },

  // --- UMUM & SPESIAL ---
  {
    id: "sparkles",
    label: "Menu Spesial / Rekomendasi",
    group: "umum",
    groupLabel: "Umum",
    keywords: ["spesial", "favorit", "bintang", "star", "best seller", "rekomendasi"],
    icon: Sparkles,
  },
  {
    id: "store",
    label: "Signature / Khas Nook",
    group: "umum",
    groupLabel: "Umum",
    keywords: ["toko", "nook", "signature", "khas", "house"],
    icon: Store,
  },
  {
    id: "tag",
    label: "Promo / Diskon",
    group: "umum",
    groupLabel: "Umum",
    keywords: ["promo", "diskon", "hemat", "tag", "sale"],
    icon: Tag,
  },
  {
    id: "shopping-bag",
    label: "Paket / Bundling",
    group: "umum",
    groupLabel: "Umum",
    keywords: ["paket", "bundling", "combo", "takeout", "bag"],
    icon: ShoppingBag,
  },
  {
    id: "layout-grid",
    label: "Semua Kategori",
    group: "umum",
    groupLabel: "Umum",
    keywords: ["semua", "all", "grid", "kategori"],
    icon: LayoutGrid,
  },
];

/**
 * Strict allowlist map from icon identifier to Lucide icon component.
 */
export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  SUPPORTED_CATEGORY_ICONS.map((def) => [def.id, def.icon])
);

/**
 * Fallback icon ID and component used when a category's icon is unspecified, null, or unknown.
 */
export const FALLBACK_CATEGORY_ICON_ID = "utensils";
export const FALLBACK_CATEGORY_ICON: LucideIcon = Utensils;

/**
 * Resolves a Lucide icon component from an icon identifier string safely.
 */
export function getCategoryIcon(iconId?: string | null): LucideIcon {
  if (!iconId) return FALLBACK_CATEGORY_ICON;
  const normalized = iconId.trim().toLowerCase();
  return CATEGORY_ICON_MAP[normalized] || FALLBACK_CATEGORY_ICON;
}

/**
 * Returns a sensible default icon identifier based on category slug/name if not configured.
 */
export function getDefaultIconForSlug(slugOrName?: string | null): string {
  if (!slugOrName) return "utensils";
  const s = slugOrName.toLowerCase();
  const words = s.split(/[^a-z0-9]+/).filter(Boolean);
  const hasWord = (w: string) => words.includes(w);

  if (s.includes("kopi") || s.includes("coffee") || s.includes("espresso") || s.includes("latte")) return "coffee";
  if (s.includes("teh") || s.includes("tea")) return "coffee";
  if (s.includes("susu") || s.includes("milk") || s.includes("shake")) return "milk";
  if (s.includes("dessert") || s.includes("cake") || s.includes("tart") || s.includes("tiramisu")) return "cake-slice";
  if (s.includes("es krim") || s.includes("ice cream") || s.includes("gelato")) return "ice-cream";
  if (s.includes("minum") || s.includes("drink") || s.includes("beverage") || hasWord("es") || s.includes("juice") || s.includes("jus")) return "cup-soda";
  if (s.includes("snack") || s.includes("camilan") || s.includes("biskuit") || s.includes("keripik") || s.includes("dimsum")) return "cookie";
  if (s.includes("roti") || s.includes("bakery") || s.includes("pastry") || s.includes("croissant") || s.includes("toast")) return "croissant";
  if (s.includes("mie") || s.includes("soup") || s.includes("kuah") || s.includes("bakso") || s.includes("soto")) return "soup";
  if (s.includes("paket") || s.includes("bundling") || s.includes("combo")) return "shopping-bag";
  if (s.includes("makan") || s.includes("nasi") || s.includes("rice") || s.includes("bowl") || s.includes("lauk")) return "utensils";
  if (s.includes("semua") || s.includes("all")) return "layout-grid";
  return "utensils";
}

/**
 * Curated Category Tabs for Icon Picker Modal
 */
export const ICON_GROUPS: { key: IconGroupKey; label: string }[] = [
  { key: "all", label: "Semua Ikon" },
  { key: "makanan", label: "Makanan" },
  { key: "minuman", label: "Minuman" },
  { key: "snack", label: "Snack" },
  { key: "dessert", label: "Dessert" },
  { key: "bakery", label: "Bakery" },
  { key: "umum", label: "Umum & Spesial" },
];
