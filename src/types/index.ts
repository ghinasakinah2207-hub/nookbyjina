export interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
}

export interface OptionValue {
  id: string;
  name: string;
  priceDelta: number; // e.g. 0 or +2000
}

export interface OptionGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  values: OptionValue[];
}

export interface Addon {
  id: string;
  name: string;
  price: number;
}

export interface ProductCategoryRef {
  id?: string;
  name: string;
  slug?: string;
}

export interface Product {
  id: string;
  dbId?: string;
  slug: string;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  categorySlug?: string;
  categories?: ProductCategoryRef[];
  categoryNames?: string[];
  tags?: string[];
  basePrice: number;
  isAvailable: boolean; // true = Tersedia, false = Habis
  isArchived?: boolean;
  images: string[];
  optionGroups: OptionGroup[];
  addons: Addon[];
  isHighlight?: boolean;
  hpp?: number | null;
  isOptionsLoaded?: boolean;
}

export interface SelectedOption {
  groupId: string;
  groupName: string;
  valueId: string;
  valueName: string;
  priceDelta: number;
  optionValueId?: string;
  optionValue?: string;
  optionName?: string;
}

export interface SelectedAddon {
  addonId: string;
  addonName: string;
  price: number;
}

export interface CartItem {
  id: string; // unique deterministic id based on productId + options + addons + itemNote
  productId: string;
  productName: string;
  productImage: string;
  basePrice: number;
  selectedOptions: SelectedOption[];
  selectedAddons: SelectedAddon[];
  itemNote: string;
  quantity: number;
  unitPrice: number;
  itemTotal: number;
  isAvailable: boolean;
}

export type FulfillmentType = "pickup" | "delivery";

export type OrderStatus =
  | "Pesanan baru"
  | "Diproses"
  | "Siap"
  | "Selesai"
  | "Dibatalkan";

export type PaymentStatus =
  | "Menunggu Verifikasi"
  | "Menunggu Pembayaran"
  | "Lunas"
  | "Dibatalkan";

export type PaymentMethod = "QRIS Statis" | "Cash";

export interface PaymentMethodsConfig {
  qris: boolean;
  cash: boolean;
}

export interface Order {
  id: string; // TJ-YYMMDD-NNN
  token: string; // High-entropy secure access token
  createdAt: string; // ISO 8601
  customerName: string;
  customerWhatsapp: string;
  fulfillmentType: FulfillmentType;
  deliveryArea: string;
  orderNote: string;
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentDeadline: string; // ISO 8601, 30 minutes after creation
  merchantName: string;
}

export interface Banner {
  id: string;
  title?: string;
  subtitle?: string;
  imageUrl: string;
  targetUrl?: string;
  isActive: boolean;
  sortOrder?: number;
  createdAt?: string;
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  location: string;
  isOpen: boolean;
  operatingHoursText: string;
  adminWhatsapp: string;
  instagramUrl?: string;
  qrisMerchantName: string;
  qrisNmid: string;
  qrisImageUrl?: string;
  deliveryConfig: {
    configuredArea: string; // "Lhoksukon"
    standardFee: number; // 4000
    freeShippingThreshold: number; // 50000 (>= 50000 is free)
  };
  paymentMethods: PaymentMethodsConfig;
  updatedAt?: string;
}

export interface HomepageSection {
  id: string;
  title: string;
  subtitle?: string | null;
  isActive: boolean;
  sortOrder: number;
  maxProducts?: number | null;
  viewAllUrl?: string | null;
  productIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface HomepageSectionWithProducts {
  id: string;
  title: string;
  subtitle?: string | null;
  isActive: boolean;
  sortOrder: number;
  maxProducts?: number | null;
  viewAllUrl?: string | null;
  products: Product[];
}

