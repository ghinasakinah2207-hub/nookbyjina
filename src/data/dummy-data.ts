import { Category, Product, Banner, StoreSettings } from "@/types";

export const STORE_SETTINGS: StoreSettings = {
  storeName: "Nook by Jina",
  tagline: "Makanan homemade dibuat dengan penuh rasa dan kehangatan.",
  location: "Lhoksukon, Aceh Utara",
  isOpen: true,
  operatingHoursText: "Setiap Hari: 09:00 – 17:00 WIB",
  adminWhatsapp: "6282273180000", // Format internasional tanpa +, placeholder admin
  instagramUrl: "",
  qrisMerchantName: "Nook by Jina",
  qrisNmid: "ID1020038829101",
  qrisImageUrl: "",
  deliveryConfig: {
    configuredArea: "Lhoksukon",
    standardFee: 4000,
    freeShippingThreshold: 50000, // >= 50000 = free
  },
  paymentMethods: {
    qris: true,
    cash: true,
  },
};

export const CATEGORIES: Category[] = [
  { id: "cat-makanan", name: "Makanan", slug: "makanan", icon: "utensils" },
  { id: "cat-minuman", name: "Minuman", slug: "minuman", icon: "cup-soda" },
  { id: "cat-snack", name: "Snack", slug: "snack", icon: "cookie" },
];

export const PRODUCTS: Product[] = [
  {
    id: "nasi-bakar-cakalang",
    slug: "nasi-bakar-cakalang",
    name: "Nasi Bakar Cakalang Asap",
    description:
      "Nasi gurih kaya rempah beraroma daun kemangi segar, dibungkus daun pisang lalu dibakar hangat. Diisi suwiran ikan cakalang asap gurih pedas istimewa.",
    categoryId: "cat-makanan",
    categoryName: "Makanan",
    basePrice: 25000,
    isAvailable: true,
    isHighlight: true,
    images: ["/images/hero-food.webp", "/images/banner-promo-1.webp"],
    optionGroups: [
      {
        id: "opt-pedas",
        name: "Level Pedas",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        values: [
          { id: "pedas-0", name: "Level 0 (Tidak Pedas)", priceDelta: 0 },
          { id: "pedas-1", name: "Level 1 (Sedang)", priceDelta: 0 },
          { id: "pedas-2", name: "Level 2 (Pedas Mantap)", priceDelta: 0 },
        ],
      },
      {
        id: "opt-porsi",
        name: "Porsi Nasi",
        required: false,
        minSelect: 0,
        maxSelect: 1,
        values: [
          { id: "porsi-std", name: "Standar", priceDelta: 0 },
          { id: "porsi-jumbo", name: "Porsi Jumbo (+ Nasi Ekstra)", priceDelta: 5000 },
        ],
      },
    ],
    addons: [
      { id: "addon-sambal", name: "Ekstra Sambal Cakalang", price: 4000 },
      { id: "addon-telur", name: "Telur Dadar Iris Gurih", price: 3000 },
      { id: "addon-kerupuk", name: "Kerupuk Kaleng Renyah", price: 2000 },
    ],
  },
  {
    id: "ayam-suwir-matah",
    slug: "ayam-suwir-matah",
    name: "Rice Bowl Ayam Suwir Sambal Matah",
    description:
      "Nasi putih hangat pulen berpadu suwiran daging ayam gurih empuk, sambal matah serai bawang segar harum, dan telur mata sapi lezat.",
    categoryId: "cat-makanan",
    categoryName: "Makanan",
    basePrice: 28000,
    isAvailable: true,
    isHighlight: true,
    images: ["/images/ayam-suwir-matah.webp"],
    optionGroups: [
      {
        id: "opt-telur",
        name: "Tingkat Kematangan Telur",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        values: [
          { id: "telur-setengah", name: "Setengah Matang (Lumer)", priceDelta: 0 },
          { id: "telur-matang", name: "Matang Sempurna", priceDelta: 0 },
        ],
      },
    ],
    addons: [
      { id: "addon-matah-ekstra", name: "Ekstra Sambal Matah Fresh", price: 3000 },
      { id: "addon-kerupuk-matah", name: "Kerupuk Kaleng Renyah", price: 2000 },
    ],
  },
  {
    id: "risol-mayo-beef",
    slug: "risol-mayo-beef",
    name: "Risol Mayo Beef Lumer (Isi 3)",
    description:
      "Kulit risol lembut dengan baluran tepung panir garing keemasan. Isian melimpah: potongan smoked beef premium, telur rebus, keju, dan saus mayo creamy gurih.",
    categoryId: "cat-snack",
    categoryName: "Snack",
    basePrice: 18000,
    isAvailable: true,
    isHighlight: true,
    images: ["/images/risol-mayo.webp"],
    optionGroups: [
      {
        id: "opt-saus-risol",
        name: "Varian Rasa",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        values: [
          { id: "risol-ori", name: "Original Mayo Creamy", priceDelta: 0 },
          { id: "risol-spicy", name: "Spicy Mayo Pedas Gurih", priceDelta: 1000 },
        ],
      },
    ],
    addons: [
      { id: "addon-saus-cocol", name: "Ekstra Saus Sambal Cocol", price: 1500 },
      { id: "addon-keju-lumer", name: "Ekstra Keju Mozzarella (+Lumer)", price: 4000 },
    ],
  },
  {
    id: "dimsum-mentai",
    slug: "dimsum-mentai",
    name: "Dimsum Mentai Homemade (Isi 4)",
    description:
      "Dimsum siomay ayam udang buatan sendiri dengan tekstur kenyal dan padat daging. Disiram saus mentai gurih manis creamy yang dibakar (torched) harum dengan taburan tobiko.",
    categoryId: "cat-snack",
    categoryName: "Snack",
    basePrice: 22000,
    isAvailable: true,
    isHighlight: true,
    images: ["/images/dimsum-mentai.webp"],
    optionGroups: [
      {
        id: "opt-mentai",
        name: "Kepedasan Saus Mentai",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        values: [
          { id: "mentai-normal", name: "Mentai Regular (Gurih Manis)", priceDelta: 0 },
          { id: "mentai-spicy", name: "Mentai Spicy (Sedikit Pedas)", priceDelta: 0 },
        ],
      },
    ],
    addons: [
      { id: "addon-chili-oil", name: "Homemade Chili Oil Pedas", price: 3000 },
      { id: "addon-tobiko", name: "Ekstra Tobiko Melimpah", price: 3500 },
    ],
  },
  {
    id: "dessert-box-tiramisu",
    slug: "dessert-box-tiramisu",
    name: "Dessert Box Tiramisu Homemade",
    description:
      "Dessert box personal dengan sponge biskuit lembut direndam espresso wangi, krim keju mascarpone lembut tidak enek, dan taburan cokelat bubuk Belanda premium.",
    categoryId: "cat-snack",
    categoryName: "Snack",
    basePrice: 20000,
    isAvailable: true,
    isHighlight: false,
    images: ["/images/dessert-tiramisu.webp"],
    optionGroups: [],
    addons: [
      { id: "addon-kartu-ucapan", name: "Kartu Ucapan Mini & Pita", price: 2500 },
    ],
  },
  {
    id: "es-kopi-susu-aren",
    slug: "es-kopi-susu-aren",
    name: "Es Kopi Susu Aren Homemade",
    description:
      "Kombinasi espresso kopi lokal Aceh harum, susu segar lembut creamy, dan manisnya sirup gula aren asli. Segar dan cocok dinikmati dingin.",
    categoryId: "cat-minuman",
    categoryName: "Minuman",
    basePrice: 15000,
    isAvailable: true,
    isHighlight: false,
    images: ["/images/kopi-susu-aren.webp"],
    optionGroups: [
      {
        id: "opt-sweetness",
        name: "Tingkat Manis Gula Aren",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        values: [
          { id: "sweet-normal", name: "Normal Aren (Pas)", priceDelta: 0 },
          { id: "sweet-less", name: "Less Sugar (Sedikit Manis)", priceDelta: 0 },
        ],
      },
      {
        id: "opt-ice",
        name: "Takaran Es Batu",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        values: [
          { id: "ice-normal", name: "Es Standar (Dingin Segar)", priceDelta: 0 },
          { id: "ice-less", name: "Less Ice (Es Sedikit)", priceDelta: 0 },
        ],
      },
    ],
    addons: [
      { id: "addon-espresso-shot", name: "Ekstra 1 Shot Espresso", price: 4000 },
      { id: "addon-cincau", name: "Grass Jelly Cincau Hitam", price: 3000 },
    ],
  },
  {
    id: "risol-ragout-sayur",
    slug: "risol-ragout-sayur",
    name: "Risol Ragout Ayam Sayur (Isi 3)",
    description:
      "Risol klasik berisi olahan ragout ayam cincang, wortel, dan kentang gurih harum pala. Disajikan dengan cabai rawit hijau.",
    categoryId: "cat-snack",
    categoryName: "Snack",
    basePrice: 15000,
    isAvailable: false, // STATUS HABIS UNTUK PENGUJIAN KETENTUAN PRD
    isHighlight: false,
    images: ["/images/risol-mayo.webp"],
    optionGroups: [],
    addons: [],
  },
];

export const BANNERS: Banner[] = [
  {
    id: "banner-1",
    title: "Sajian Homemade Penuh Rasa",
    subtitle: "Pre-order menu favoritmu hari ini untuk area Lhoksukon & sekitarnya.",
    imageUrl: "/images/banner-promo-1.webp",
    targetUrl: "/menu",
    isActive: true,
  },
  {
    id: "banner-2",
    title: "Nasi Bakar Cakalang Asap",
    subtitle: "Aroma daun kemangi & suwiran cakalang asap gurih pedas khas Nook by Jina.",
    imageUrl: "/images/hero-food.webp",
    targetUrl: "/produk/nasi-bakar-cakalang",
    isActive: true,
  },
  {
    id: "banner-3",
    title: "Dimsum Mentai Homemade",
    subtitle: "Siomay ayam udang lembut dengan saus mentai bakar harum & taburan tobiko.",
    imageUrl: "/images/dimsum-mentai.webp",
    targetUrl: "/produk/dimsum-mentai",
    isActive: true,
  },
];

/**
 * Format angka ke format mata uang Rupiah Indonesia (misal: Rp25.000)
 */
export function formatRupiah(amount: number): string {
  return "Rp" + amount.toLocaleString("id-ID");
}

/**
 * Generate unique Order ID berformat TJ-YYMMDD-NNN sesuai PRD
 */
export function generateOrderId(sequenceNumber: number = 1): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const nnn = String(sequenceNumber).padStart(3, "0");
  return `TJ-${yy}${mm}${dd}-${nnn}`;
}

/**
 * Generate random high-entropy token untuk akses detail pesanan anonim
 */
export function generateOrderToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
