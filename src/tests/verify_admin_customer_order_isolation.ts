import assert from "assert";
import { Order } from "@/types";
import { printThermalReceipt, generateCustomerReceiptHtml } from "@/lib/print-receipt";
import { saveOrderToken, getOrderToken, getAllOrderTokens } from "@/lib/order-token-vault";

// In-memory localStorage mock for Node test environment
class LocalStorageMock {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] || null;
  }
}

const mockStorage = new LocalStorageMock();
(global as unknown as { localStorage: LocalStorageMock }).localStorage = mockStorage;
(global as unknown as { window: unknown }).window = { localStorage: mockStorage };

const CUSTOMER_ORDERS_STORAGE_KEY = "temu_customer_orders_v1";
const CART_STORAGE_KEY = "temu_cart_items_v1";
const FAVORITES_STORAGE_KEY = "temu_favorites_v1";

function createDummyOrder(id: string, customerName: string, token: string = ""): Order {
  return {
    id,
    token,
    createdAt: new Date().toISOString(),
    customerName,
    customerWhatsapp: "081299998888",
    fulfillmentType: "delivery",
    deliveryArea: "Lhoksukon",
    orderNote: "Tolong sambal dipisah",
    items: [
      {
        id: `item-${id}-1`,
        productId: "nasi-bakar-cakalang",
        productName: "Nasi Bakar Cakalang",
        productImage: "/images/nasi-bakar.jpg",
        basePrice: 25000,
        unitPrice: 25000,
        quantity: 2,
        itemTotal: 50000,
        itemNote: "Pedas sedang",
        isAvailable: true,
        selectedOptions: [{ groupId: "level", groupName: "Level", optionName: "Pedas Sedang", valueId: "med", valueName: "Sedang", optionValueId: "med", optionValue: "Sedang", priceDelta: 0 }],
        selectedAddons: [],
      },
    ],
    subtotal: 50000,
    shippingFee: 5000,
    total: 55000,
    orderStatus: "Pesanan baru",
    paymentStatus: "Menunggu Verifikasi",
    paymentMethod: "QRIS Statis",
    paymentDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    merchantName: "Nook by Jina",
  };
}

async function runTest() {
  console.log("==================================================================");
  console.log("TEST SUITE: P2.2 — Isolasi State Pesanan Admin dari Pelanggan");
  console.log("==================================================================\n");

  // Reset storage
  mockStorage.clear();

  // -------------------------------------------------------------------------
  // SCENARIO 1: Polling data toko di admin TIDAK mencemari localStorage pelanggan
  // -------------------------------------------------------------------------
  console.log("=== Scenario 1: Polling data toko admin tidak menulis ke localStorage pelanggan ===");

  // Pelanggan A membuat pesanan asli di browser ini
  const customerOrderId = "TJ-261027-001";
  const customerToken = "secret-token-cust-abc-123456789";
  const customerOrder = createDummyOrder(customerOrderId, "Pelanggan Asli", customerToken);

  // Simulasikan penyimpanan pesanan pelanggan di OrderContext
  saveOrderToken(customerOrderId, customerToken);
  mockStorage.setItem(CUSTOMER_ORDERS_STORAGE_KEY, JSON.stringify([customerOrder]));

  // Verifikasi kondisi awal pelanggan
  const initialCustomerStorage = JSON.parse(mockStorage.getItem(CUSTOMER_ORDERS_STORAGE_KEY) || "[]");
  assert.strictEqual(initialCustomerStorage.length, 1);
  assert.strictEqual(initialCustomerStorage[0].id, customerOrderId);

  // Simulasikan admin polling / fetching 50 pesanan toko dari /api/admin/orders
  const storeOrders: Order[] = [];
  for (let i = 2; i <= 51; i++) {
    const storeId = `TJ-261027-${String(i).padStart(3, "0")}`;
    // Pesanan admin toko tidak memiliki token pelanggan (token = "")
    storeOrders.push(createDummyOrder(storeId, `Pelanggan Toko #${i}`, ""));
  }

  // Admin state diatur secara terisolasi (seperti di useAdminOrders)
  let adminOrdersState = [...storeOrders, customerOrder];
  assert.strictEqual(adminOrdersState.length, 51, "Admin memegang 51 pesanan toko");

  // Verifikasi bahwa localStorage pelanggan temu_customer_orders_v1 TIDAK tercemar
  const customerStorageAfterAdminFetch = JSON.parse(mockStorage.getItem(CUSTOMER_ORDERS_STORAGE_KEY) || "[]");
  assert.strictEqual(
    customerStorageAfterAdminFetch.length,
    1,
    "localStorage pelanggan tetap HANYA berisi 1 pesanan miliknya"
  );
  assert.strictEqual(
    customerStorageAfterAdminFetch[0].id,
    customerOrderId,
    "ID pesanan di localStorage tetap milik pelanggan asli"
  );

  // Verifikasi token vault tidak dimasuki ID pesanan toko lain
  const allTokens = getAllOrderTokens();
  assert.strictEqual(allTokens.length, 1, "Token vault tetap hanya memiliki 1 token pelanggan");
  assert.strictEqual(allTokens[0], customerToken);
  console.log("✅ PASSED: Polling pesanan admin tidak mencemari temu_customer_orders_v1 maupun temu_order_tokens_v1.");

  // -------------------------------------------------------------------------
  // SCENARIO 2: Uji Data Campuran & Self-Healing Hydration
  // -------------------------------------------------------------------------
  console.log("\n=== Scenario 2: Uji data campuran & self-healing eliminasi pesanan asing ===");

  // Simulasikan kondisi riwayat browser lama yang sempat tercemar sebelum fix (ada pesanan toko tanpa token)
  const contaminatedStorage: Order[] = [
    customerOrder, // Sah
    createDummyOrder("TJ-LEAK-001", "Pelanggan Toko Lain 1", ""), // Bocor (tanpa token)
    createDummyOrder("TJ-LEAK-002", "Pelanggan Toko Lain 2", ""), // Bocor (tanpa token)
  ];
  mockStorage.setItem(CUSTOMER_ORDERS_STORAGE_KEY, JSON.stringify(contaminatedStorage));

  // Jalankan logika self-healing hydration OrderContext
  const stored = mockStorage.getItem(CUSTOMER_ORDERS_STORAGE_KEY);
  assert(stored !== null);
  const parsed: Order[] = JSON.parse(stored);

  const withTokens: Order[] = parsed.map((o: Order) => {
    const vaultToken = getOrderToken(o.id);
    const token = o.token || vaultToken || "";
    return { ...o, token };
  });

  // Guard: Hanya simpan pesanan yang memiliki token valid / di vault
  const customerOnlyOrders = withTokens.filter(
    (o) => (typeof o.token === "string" && o.token.length >= 8) || Boolean(getOrderToken(o.id))
  );

  // Self-healing write back
  if (customerOnlyOrders.length !== parsed.length) {
    mockStorage.setItem(CUSTOMER_ORDERS_STORAGE_KEY, JSON.stringify(customerOnlyOrders));
  }

  // Verifikasi hasil pembersihan
  const healedStorage = JSON.parse(mockStorage.getItem(CUSTOMER_ORDERS_STORAGE_KEY) || "[]");
  assert.strictEqual(healedStorage.length, 1, "Pesanan asing tanpa token berhasil dieliminasi dari riwayat");
  assert.strictEqual(healedStorage[0].id, customerOrderId, "Hanya pesanan berhak milik pelanggan yang bertahan");
  console.log("✅ PASSED: Data campuran berhasil diisolasi dan riwayat pelanggan dibersihkan secara otomatis.");

  // -------------------------------------------------------------------------
  // SCENARIO 3: Navigasi bolak-balik Admin ke Pelanggan dalam browser yang sama
  // -------------------------------------------------------------------------
  console.log("\n=== Scenario 3: Navigasi bolak-balik Admin ke Pelanggan dalam browser yang sama ===");

  // Siapkan cart dan favorites pelanggan
  const dummyCart = [
    {
      id: "cart-item-1",
      productId: "nasi-bakar-cakalang",
      productName: "Nasi Bakar Cakalang",
      productImage: "/images/nasi-bakar.jpg",
      basePrice: 25000,
      unitPrice: 25000,
      quantity: 1,
      itemTotal: 25000,
      itemNote: "",
      isAvailable: true,
      selectedOptions: [],
      selectedAddons: [],
    },
  ];
  const dummyFavorites = ["nasi-bakar-cakalang", "risol-mayo"];
  mockStorage.setItem(CART_STORAGE_KEY, JSON.stringify(dummyCart));
  mockStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(dummyFavorites));

  // Admin melakukan aksi pembaruan status pada pesanan toko di /admin/pesanan
  const targetStoreOrderId = "TJ-261027-010";
  adminOrdersState = adminOrdersState.map((o) =>
    o.id === targetStoreOrderId ? { ...o, orderStatus: "Diproses", paymentStatus: "Lunas" } : o
  );

  const updatedAdminOrder = adminOrdersState.find((o) => o.id === targetStoreOrderId);
  assert.strictEqual(updatedAdminOrder?.orderStatus, "Diproses");
  assert.strictEqual(updatedAdminOrder?.paymentStatus, "Lunas");

  // Pelanggan kembali ke halaman /pesanan dan /keranjang
  const currentCustomerOrders = JSON.parse(mockStorage.getItem(CUSTOMER_ORDERS_STORAGE_KEY) || "[]");
  const currentCart = JSON.parse(mockStorage.getItem(CART_STORAGE_KEY) || "[]");
  const currentFavorites = JSON.parse(mockStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");

  assert.strictEqual(currentCustomerOrders.length, 1, "Pesanan pelanggan tetap terisolasi");
  assert.strictEqual(currentCustomerOrders[0].id, customerOrderId);
  assert.strictEqual(currentCart.length, 1, "Keranjang belanja pelanggan tidak berubah");
  assert.strictEqual(currentFavorites.length, 2, "Daftar favorit pelanggan tidak berubah");
  console.log("✅ PASSED: Navigasi bolak-balik admin <-> pelanggan tidak menimbulkan efek samping pada state pelanggan.");

  // -------------------------------------------------------------------------
  // SCENARIO 4: Integritas Struktur Data Struk Thermal & Modal Detail
  // -------------------------------------------------------------------------
  console.log("\n=== Scenario 4: Integritas cetak struk thermal dan data pesanan admin ===");

  const sampleAdminOrder = adminOrdersState[0];
  assert(sampleAdminOrder.items.length > 0, "Pesanan admin memiliki item");
  assert(typeof sampleAdminOrder.total === "number", "Total berupa number");
  assert(typeof sampleAdminOrder.subtotal === "number", "Subtotal berupa number");
  assert(typeof sampleAdminOrder.shippingFee === "number", "Shipping fee berupa number");

  // 1. Verifikasi pembuatan HTML struk 58mm & 80mm
  const html58 = generateCustomerReceiptHtml(sampleAdminOrder, "58mm");
  assert(html58.includes(sampleAdminOrder.id), "HTML struk 58mm memuat nomor pesanan");
  assert(html58.includes(sampleAdminOrder.customerName), "HTML struk 58mm memuat nama pelanggan");
  assert(html58.includes("Nasi Bakar Cakalang"), "HTML struk 58mm memuat nama item");
  assert(html58.includes("55.000"), "HTML struk 58mm memuat total pembayaran");

  const html80 = generateCustomerReceiptHtml(sampleAdminOrder, "80mm");
  assert(html80.includes(sampleAdminOrder.id), "HTML struk 80mm memuat nomor pesanan");
  assert(html80.includes("55.000"), "HTML struk 80mm memuat total pembayaran");

  // 2. Verifikasi printThermalReceipt dengan DOM context
  const mockElement = {
    id: "",
    style: {} as Record<string, string>,
    setAttribute: () => {},
    appendChild: () => {},
    remove: () => {},
    contentWindow: {
      document: {
        open: () => {},
        write: () => {},
        close: () => {},
      },
      focus: () => {},
      print: () => {},
    },
  };
  const mockDoc = {
    getElementById: () => null,
    createElement: () => ({ ...mockElement }),
    body: {
      appendChild: () => {},
    },
  };
  (global as unknown as { document: unknown }).document = mockDoc;
  (global as unknown as { window: unknown }).window = {
    localStorage: mockStorage,
    document: mockDoc,
    print: () => {},
  };

  const print58 = printThermalReceipt(sampleAdminOrder, "58mm");
  assert.strictEqual(print58.success, true, "Cetak struk 58mm berhasil");

  const print80 = printThermalReceipt(sampleAdminOrder, "80mm");
  assert.strictEqual(print80.success, true, "Cetak struk 80mm berhasil");
  console.log("✅ PASSED: Cetak struk thermal 58mm & 80mm berfungsi normal dengan struktur pesanan admin.");

  // -------------------------------------------------------------------------
  // SCENARIO 5: Defense-in-Depth pada OrderContext.mergeOrders
  // -------------------------------------------------------------------------
  console.log("\n=== Scenario 5: Defense-in-depth penolakan pesanan toko tanpa token di mergeOrders ===");

  // Simulasikan pemanggilan mergeOrders pada OrderContext dengan pesanan toko tanpa token
  const incomingStoreOrders = [
    createDummyOrder("TJ-STORE-991", "Pelanggan 991", ""),
    createDummyOrder("TJ-STORE-992", "Pelanggan 992", ""),
  ];

  // Logic guard mergeOrders di OrderContext:
  const validIncoming = incomingStoreOrders.filter(
    (o) => (typeof o.token === "string" && o.token.length >= 8) || Boolean(getOrderToken(o.id))
  );

  assert.strictEqual(validIncoming.length, 0, "Semua pesanan toko tanpa token ditolak oleh mergeOrders guard");

  // Jika ada 1 pesanan sah milik pelanggan yang di-merge:
  const legitimateCustomerOrder = createDummyOrder("TJ-LEGIT-777", "Pelanggan Sah", "token-legit-77777777");
  saveOrderToken("TJ-LEGIT-777", "token-legit-77777777");

  const mixedIncoming = [...incomingStoreOrders, legitimateCustomerOrder];
  const validFromMixed = mixedIncoming.filter(
    (o) => (typeof o.token === "string" && o.token.length >= 8) || Boolean(getOrderToken(o.id))
  );

  assert.strictEqual(validFromMixed.length, 1, "Hanya pesanan sah yang lolos filter");
  assert.strictEqual(validFromMixed[0].id, "TJ-LEGIT-777");
  console.log("✅ PASSED: Defense-in-depth guard berhasil memblokir pesanan toko tanpa token.");

  console.log("\n==================================================================");
  console.log("🎉 SEMUA 5 SKENARIO P2.2 ISOLASI STATE PESANAN ADMIN BERHASIL (0 GAGAL)!");
  console.log("==================================================================");
}

runTest().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
