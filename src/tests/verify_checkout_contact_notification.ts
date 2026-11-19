import { validateIndonesianPhone } from "@/lib/phone";

/**
 * Regression Test: Checkout Contact Validation & Notification Toast
 * Ensures validation logic on checkout page behaves properly when contact info is missing.
 */
function testAssert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

console.log("=== Testing Checkout Contact Validation Logic ===");

// 1. When both name and phone are empty
{
  const customerName = "";
  const customerWhatsapp = "";
  const newErrors: { customerName?: string; customerWhatsapp?: string } = {};

  if (!customerName.trim() || customerName.trim().length < 2) {
    newErrors.customerName = "Nama lengkap wajib diisi (minimal 2 karakter).";
  }

  const phoneValidation = validateIndonesianPhone(customerWhatsapp);
  if (!phoneValidation.isValid) {
    newErrors.customerWhatsapp = phoneValidation.error;
  }

  testAssert(Boolean(newErrors.customerName), "Flags empty customerName");
  testAssert(Boolean(newErrors.customerWhatsapp), "Flags empty customerWhatsapp");

  let title = "Data Kontak Belum Lengkap";
  let message = "Nama lengkap dan nomor WhatsApp aktif wajib diisi.";
  if (newErrors.customerName && !newErrors.customerWhatsapp) {
    title = "Nama Belum Diisi";
    message = "Nama lengkap pemesan wajib diisi (minimal 2 karakter).";
  } else if (!newErrors.customerName && newErrors.customerWhatsapp) {
    title = "Nomor WhatsApp Belum Benar";
    message = newErrors.customerWhatsapp;
  }

  testAssert(title === "Data Kontak Belum Lengkap" && message.length > 0, "Generates correct title when both missing");
}

// 2. When only name is missing
{
  const customerName = "";
  const customerWhatsapp = "081234567890";
  const newErrors: { customerName?: string; customerWhatsapp?: string } = {};

  if (!customerName.trim() || customerName.trim().length < 2) {
    newErrors.customerName = "Nama lengkap wajib diisi (minimal 2 karakter).";
  }

  const phoneValidation = validateIndonesianPhone(customerWhatsapp);
  if (!phoneValidation.isValid) {
    newErrors.customerWhatsapp = phoneValidation.error;
  }

  testAssert(Boolean(newErrors.customerName), "Flags empty customerName");
  testAssert(!newErrors.customerWhatsapp, "Validates proper Indonesian phone");

  let title = "Data Kontak Belum Lengkap";
  let message = "Nama lengkap dan nomor WhatsApp aktif wajib diisi.";
  if (newErrors.customerName && !newErrors.customerWhatsapp) {
    title = "Nama Belum Diisi";
    message = "Nama lengkap pemesan wajib diisi (minimal 2 karakter).";
  } else if (!newErrors.customerName && newErrors.customerWhatsapp) {
    title = "Nomor WhatsApp Belum Benar";
    message = newErrors.customerWhatsapp;
  }

  testAssert(title === "Nama Belum Diisi" && message.length > 0, "Generates correct title when only name missing");
}

// 3. When only phone is missing / invalid
{
  const customerName = "Budi Santoso";
  const customerWhatsapp = "1234";
  const newErrors: { customerName?: string; customerWhatsapp?: string } = {};

  if (!customerName.trim() || customerName.trim().length < 2) {
    newErrors.customerName = "Nama lengkap wajib diisi (minimal 2 karakter).";
  }

  const phoneValidation = validateIndonesianPhone(customerWhatsapp);
  if (!phoneValidation.isValid) {
    newErrors.customerWhatsapp = phoneValidation.error;
  }

  testAssert(!newErrors.customerName, "Accepts valid customerName");
  testAssert(Boolean(newErrors.customerWhatsapp), "Rejects invalid phone number");

  let title = "Data Kontak Belum Lengkap";
  let message = "Nama lengkap dan nomor WhatsApp aktif wajib diisi.";
  if (newErrors.customerName && !newErrors.customerWhatsapp) {
    title = "Nama Belum Diisi";
    message = "Nama lengkap pemesan wajib diisi (minimal 2 karakter).";
  } else if (!newErrors.customerName && newErrors.customerWhatsapp) {
    title = "Nomor WhatsApp Belum Benar";
    message = newErrors.customerWhatsapp;
  }

  testAssert(title === "Nomor WhatsApp Belum Benar" && message.length > 0, "Generates correct title when only phone missing");
}

console.log("All checkout contact validation assertions passed successfully!");
