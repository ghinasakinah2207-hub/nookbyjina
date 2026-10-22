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
    file: "src/components/admin/DashboardOverview.tsx",
    expectedPatterns: [
      '<div className="space-y-3 sm:space-y-4">',
      '<div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">',
      '<div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">',
      '<div className="space-y-2.5">',
    ],
    forbiddenPatterns: [
      '<div className="space-y-4 sm:space-y-6">',
      '<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">',
      '<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">',
      'recentOrders.map((order) => {\n              const dateObj\n            }) : (\n          <div className="space-y-3">',
    ],
    preservedInternalPatterns: [
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 flex flex-col justify-between"',
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-6 space-y-4"',
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-5 space-y-3"',
      'formatRupiah(metrics.totalRevenue)',
    ],
  },
  {
    file: "src/components/admin/PaymentsManager.tsx",
    expectedPatterns: [
      '<div className="space-y-4">',
      '<div className="space-y-2.5">',
      '<div className="grid grid-cols-1 md:grid-cols-2 gap-3">',
    ],
    forbiddenPatterns: [
      'return (\n    <div className="space-y-6">',
      '<div className="grid grid-cols-1 md:grid-cols-2 gap-4">',
    ],
    preservedInternalPatterns: [
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-5 space-y-3"',
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-5 space-y-4"',
      'handleConfirmQrisLunas',
      'handleConfirmCashLunas',
    ],
  },
  {
    file: "src/components/admin/ReportsManager.tsx",
    expectedPatterns: [
      '<div className="space-y-4">',
      '<div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">',
      '<div className="space-y-2.5">',
    ],
    forbiddenPatterns: [
      'return (\n    <div className="space-y-6">',
      '<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">',
    ],
    preservedInternalPatterns: [
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5 flex flex-col justify-between"',
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-5 space-y-4"',
      'reportStats',
      'formatRupiah',
    ],
  },
  {
    file: "src/components/admin/SettingsManager.tsx",
    expectedPatterns: [
      '<form onSubmit={handleSave} className="space-y-4">',
    ],
    forbiddenPatterns: [
      '<form onSubmit={handleSave} className="space-y-6">',
    ],
    preservedInternalPatterns: [
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs"',
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs"',
      'toggleStoreStatusAction',
      'saveStoreSettingsAction',
    ],
  },
  {
    file: "src/components/admin/OrdersManager.tsx",
    expectedPatterns: [
      '<div className="space-y-3">',
      '<div className="space-y-3 print-hide">',
      '<div className="space-y-2.5">',
      '<div className="space-y-3 print-hide">',
    ],
    forbiddenPatterns: [
      'return (\n    <div className="space-y-4">',
      '<div className="space-y-4 print-hide">\n        {/* Error Feedback for Printing */}',
    ],
    preservedInternalPatterns: [
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3"',
      /className=\{`bg-white border rounded-2xl p-4 sm:p-5 transition-colors space-y-3\.5/,
      'className="p-3 bg-[#FAF9F8] rounded-xl space-y-1.5 text-xs"',
      'printThermalReceipt',
    ],
  },
  {
    file: "src/components/admin/MenuManager.tsx",
    expectedPatterns: [
      '<div className="space-y-3">',
      '<div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">',
    ],
    forbiddenPatterns: [
      'return (\n    <div className="space-y-4">',
      '<div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">',
    ],
    preservedInternalPatterns: [
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 space-y-3"',
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-neutral-300 transition-colors"',
      'toggleProductAvailabilityAction',
      'archiveProductAction',
    ],
  },
  {
    file: "src/components/admin/HomepageSectionManager.tsx",
    expectedPatterns: [
      '<div className="space-y-3.5">',
      '<div className="space-y-2.5">',
    ],
    forbiddenPatterns: [
      'return (\n    <div className="space-y-5">',
      '<div className="space-y-3">\n        <div className="flex items-center justify-between px-1">',
    ],
    preservedInternalPatterns: [
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-3 sm:p-3.5 flex items-center justify-between divide-x divide-[#E5E5E5] flex-1"',
      'saveHomepageSectionAction',
      'reorderHomepageSectionsAction',
    ],
  },
  {
    file: "src/components/admin/BannerSliderManager.tsx",
    expectedPatterns: [
      '<div className="space-y-3">',
      '<div className="space-y-2.5">',
    ],
    forbiddenPatterns: [
      'return (\n    <div className="space-y-4">',
      'banners.length === 0 ? (\n        <div className="bg-white border border-dashed border-[#E5E5E5] rounded-2xl p-8 text-center space-y-3">\n          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-[#737373]">\n            <ImageIcon className="w-6 h-6" />\n          </div>\n        </div>\n      ) : (\n        <div className="space-y-3">',
    ],
    preservedInternalPatterns: [
      'className="bg-white border border-[#E5E5E5] rounded-2xl p-4 sm:p-5"',
      /className=\{`bg-white border rounded-2xl p-3\.5 sm:p-4 transition-colors/,
      'uploadBannerImageAction',
      'saveHomeBannerAction',
    ],
  },
  {
    file: "src/components/admin/AddProductModal.tsx",
    expectedPatterns: [
      '<form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">',
      '<div className="space-y-2.5">',
    ],
    forbiddenPatterns: [
      '<form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs">',
    ],
    preservedInternalPatterns: [
      'className="p-3.5 rounded-xl border border-neutral-200 bg-[#FAF9F8] space-y-3"',
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
  console.log("✅ ALL ADMIN CARD SPACING CHECKS PASSED!");
  process.exit(0);
} else {
  console.error("❌ Some admin checks failed.");
  process.exit(1);
}
