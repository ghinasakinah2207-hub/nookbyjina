import * as fs from "fs";
import * as path from "path";

interface Check {
  file: string;
  expectedPatterns: (string | RegExp)[];
  forbiddenPatterns: (string | RegExp)[];
  preservedInternalPatterns: (string | RegExp)[];
}

const checks: Check[] = [
  {
    file: "src/components/cart/CartClient.tsx",
    expectedPatterns: [
      '<main className="max-w-md mx-auto px-4 pt-4 space-y-3">',
      '<div className="space-y-2.5">', // cart items list wrapper
    ],
    forbiddenPatterns: [
      '<main className="max-w-md mx-auto px-4 pt-4 space-y-4">',
      'Cart Items List */\n            <div className="space-y-3">',
    ],
    preservedInternalPatterns: [
      /className=\{`bg-white border rounded-2xl p-3\.5 space-y-3/,
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-2"',
      'formatRupiah',
      'updateQuantity',
    ],
  },
  {
    file: "src/components/checkout/CheckoutClient.tsx",
    expectedPatterns: [
      '<main className="max-w-md mx-auto px-4 pt-3 space-y-3">',
      '<form id="checkout-form" onSubmit={handleCreateOrder} className="space-y-3">',
    ],
    forbiddenPatterns: [
      '<main className="max-w-md mx-auto px-4 pt-3 space-y-4">',
      '<form id="checkout-form" onSubmit={handleCreateOrder} className="space-y-4">',
    ],
    preservedInternalPatterns: [
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3.5"', // Customer contact card
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3"', // Menu summary card
      'calculateDeliveryFee',
      'validateIndonesianPhone',
    ],
  },
  {
    file: "src/app/pembayaran/[order]/page.tsx",
    expectedPatterns: [
      '<main className="max-w-md mx-auto px-3 sm:px-4 pt-4 space-y-2.5">', // skeleton
      '<main className="max-w-md mx-auto px-3 sm:px-4 pt-3.5 space-y-2.5">', // main
    ],
    forbiddenPatterns: [
      '<main className="max-w-md mx-auto px-3 sm:px-4 pt-4 space-y-3.5">',
      '<main className="max-w-md mx-auto px-3 sm:px-4 pt-3.5 space-y-3.5">',
    ],
    preservedInternalPatterns: [
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs"', // Order summary
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-3 sm:p-4 shadow-xs flex flex-col items-center justify-center space-y-2.5"', // QRIS card
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 text-xs text-[#737373] space-y-2 shadow-xs"', // Instructions card
      'formatRupiah',
      'router.replace(`/pesanan/${order.token}`)',
    ],
  },
  {
    file: "src/app/pesanan/[token]/page.tsx",
    expectedPatterns: [
      '<main className="max-w-md mx-auto px-4 pt-4 space-y-3">',
    ],
    forbiddenPatterns: [
      '<main className="max-w-md mx-auto px-4 pt-4 space-y-4">',
    ],
    preservedInternalPatterns: [
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3"', // Header card
      'className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-xs text-[#8A4B08]"', // Cash card
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3"', // Items breakdown card
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-2 text-xs text-[#737373]"', // Fulfillment card
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3"', // Share token card
    ],
  },
  {
    file: "src/app/pesanan/page.tsx",
    expectedPatterns: [
      '<main className="max-w-md mx-auto px-4 pt-4 space-y-3">',
      '<div className="space-y-2.5">',
    ],
    forbiddenPatterns: [
      '<main className="max-w-md mx-auto px-4 pt-4 space-y-4">',
      'orders tercatat di perangkat ini</span>\n            </div>\n\n            <div className="space-y-3">',
    ],
    preservedInternalPatterns: [
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3"', // Order card
      'formatRupiah',
    ],
  },
  {
    file: "src/app/sukses/page.tsx",
    expectedPatterns: [
      '<main className="max-w-md mx-auto px-4 pt-5 space-y-3">',
    ],
    forbiddenPatterns: [
      '<main className="max-w-md mx-auto px-4 pt-6 space-y-4">',
    ],
    preservedInternalPatterns: [
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-6 text-center space-y-3"',
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3"',
    ],
  },
];

let allPassed = true;

for (const check of checks) {
  const filePath = path.resolve(process.cwd(), check.file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${check.file}`);
    allPassed = false;
    continue;
  }

  const content = fs.readFileSync(filePath, "utf-8");

  for (const expected of check.expectedPatterns) {
    const isMatch = typeof expected === "string" ? content.includes(expected) : expected.test(content);
    if (!isMatch) {
      console.error(`❌ ${check.file}: Missing expected pattern: ${expected}`);
      allPassed = false;
    }
  }

  for (const forbidden of check.forbiddenPatterns) {
    const isMatch = typeof forbidden === "string" ? content.includes(forbidden) : forbidden.test(content);
    if (isMatch) {
      console.error(`❌ ${check.file}: Found forbidden old pattern: ${forbidden}`);
      allPassed = false;
    }
  }

  for (const preserved of check.preservedInternalPatterns) {
    const isMatch = typeof preserved === "string" ? content.includes(preserved) : preserved.test(content);
    if (!isMatch) {
      console.error(`❌ ${check.file}: Preserved pattern was altered or missing: ${preserved}`);
      allPassed = false;
    }
  }
}

if (allPassed) {
  console.log("✅ ALL CARD SPACING CHECKS PASSED!");
  process.exit(0);
} else {
  console.error("❌ Some checks failed.");
  process.exit(1);
}
