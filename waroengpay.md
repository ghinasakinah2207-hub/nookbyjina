# WaroengPay API

> Payment gateway QRIS. Buat tagihan QRIS dinamis dengan nominal unik, arahkan pembeli ke halaman bayar, lalu terima webhook (atau cek status lewat API) saat dana masuk ke rekening merchant. Semua endpoint REST, JSON, HTTPS.

- Base URL: `https://waroengpay.com`
- Dokumentasi interaktif: https://waroengpay.com/dashboard#integrasi
- Versi Markdown ini: https://waroengpay.com/docs.md (sama dengan https://waroengpay.com/llms.txt)

## Ringkasan untuk agent

1. Ambil API key (`wp_live_...`) dari dashboard → Integrasi & API → Kredensial. Simpan di env `WAROENGPAY_API_KEY`. Jangan taruh di frontend.
2. `POST /api/payments` dengan `amount` (rupiah) → dapat `id`, `pay_url`, `qris`, dan `amount` final (sudah + kode unik). Simpan `id` (`WRG-...`) di pesananmu.
3. Arahkan pembeli ke `pay_url`, atau render QR sendiri dari string `qris`. Tampilkan `amount` apa adanya.
4. Tunggu lunas dengan salah satu cara:
   - Webhook `payment.paid` ke `callback_url` (verifikasi HMAC, lihat bawah), atau
   - Polling `GET /api/payments/:id` sampai `status` = `paid` (cukup tiap 5–10 detik, berhenti saat status final).
5. Saat `payment.paid`: cari pesanan lewat `data.id` (bukan `reference`), pastikan `data.base_amount` = total pesanan, dan abaikan `livemode: false`. Lihat Memproses `payment.paid` dengan aman.
6. Jangan anggap lunas hanya karena pembeli kembali ke `redirect_url`.
7. Uji dulu tanpa uang sungguhan: pakai API key `wp_test_...` (mode uji / sandbox), lalu lunasi tagihan uji dengan `POST /api/payments/:id/simulate`. Lihat bagian Mode uji.

## Autentikasi

Setiap request wajib membawa header:

```http
Authorization: Bearer wp_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

- API key tersembunyi di dashboard dan bisa ditampilkan lagi dengan password akun (disimpan terenkripsi). Curiga bocor? Buat ulang: key lama langsung mati.
- Membuat ulang API key langsung mematikan key lama.
- Di dashboard, membuat API key, menampilkan / mengganti secret webhook, dan mengganti URL webhook butuh password akun. Kartu API key menampilkan kapan dan dari IP mana key itu terakhir dipakai; kalau bukan server tokomu, buat ulang key-nya.
- Key salah / akun nonaktif → `401 invalid_api_key`.
- Data antar akun terpisah: kamu hanya bisa melihat tagihanmu sendiri.
- Key `wp_test_...` = mode uji (sandbox): hanya membuat & membaca tagihan uji. Key live tidak bisa membaca tagihan uji, dan sebaliknya (`404`).

## Buat tagihan

`POST /api/payments` → `201 Created` (atau `200` bila Idempotency-Key sama dipakai ulang)

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `amount` | integer | ya | Nominal rupiah, 1000 sampai 10000000. Kode unik kecil (default Rp100–Rp250, diatur admin) ditambahkan otomatis. |
| `reference` | string | tidak | Nomor pesanan di sistemmu (maks 100). Ikut di webhook. Tidak unik: jangan dipakai untuk mencocokkan pembayaran, pakai `id`. |
| `description` | string | tidak | Keterangan di halaman bayar (maks 200). |
| `callback_url` | url | tidak | Penerima webhook tagihan ini. Kosong = URL webhook default akun. Kosong keduanya = tanpa webhook (pakai polling). |
| `redirect_url` | url | tidak | Pembeli diarahkan ke sini 6 detik setelah lunas. |
| `expires_in` | integer | tidak | Masa berlaku menit, 5–60. Default 15. |
| `platform_fee` | integer | tidak | Potongan modal mitra dalam rupiah, 0 sampai `amount` (mis. modal produk reseller). Ditambahkan ke `fee` → `net_amount` otomatis bersih. Default 0. |

Header opsional `Idempotency-Key` (1–100 karakter `[A-Za-z0-9_.:-]`): request ulang dengan key sama mengembalikan tagihan yang sama, bukan tagihan baru. Pakai nomor pesanan.

```bash
curl -X POST https://waroengpay.com/api/payments \
  -H "Authorization: Bearer $WAROENGPAY_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: INV-2041" \
  -d '{"amount":50000,"reference":"INV-2041","description":"Paket Premium 1 bulan"}'
```

```js
const res = await fetch("https://waroengpay.com/api/payments", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.WAROENGPAY_API_KEY}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "INV-2041",
  },
  body: JSON.stringify({ amount: 50000, reference: "INV-2041" }),
});
if (!res.ok) throw new Error((await res.json()).error);
const tagihan = await res.json(); // simpan tagihan.id di pesanan INV-2041; lalu tagihan.pay_url, tagihan.qris, tagihan.amount
```

Respons:

```json
{
  "id": "WRG-7K2M9QX4BD1PZ",
  "reference": "INV-2041",
  "description": "Paket Premium 1 bulan",
  "status": "pending",
  "base_amount": 50000,
  "unique_code": 137,
  "amount": 50137,
  "fee": 0,
  "net_amount": 50137,
  "qris": "000201010212265...6304A1B2",
  "pay_url": "https://waroengpay.com/pay/WRG-7K2M9QX4BD1PZ",
  "callback_url": null,
  "redirect_url": null,
  "created_at": "2026-09-24T03:00:00.000Z",
  "expires_at": "2026-09-24T03:15:00.000Z",
  "paid_at": null,
  "late": false,
  "livemode": true,
  "link_id": null,
  "customer": null,
  "payment": null
}
```

Penting: pembeli harus membayar `amount` persis (sudah termasuk kode unik). Nominal berbeda tidak bisa dicocokkan otomatis.

`fee` = biaya layanan platform untuk tagihan ini (dikunci saat tagihan dibuat; saat ini = kode unik, ditambah 0,7% dari `base_amount` bila di atas Rp500.000, sehingga `net_amount` = harga barang), sudah termasuk `platform_fee` bila diisi; `net_amount` = `amount - fee`, yang masuk ke saldo merchant. `platform_fee` = bagian `fee` yang berupa potongan modal mitra.

`late` = `true` bila tagihan dibayar setelah kedaluwarsa/dibatalkan lalu dicocokkan manual oleh admin (lihat bagian Pembayaran telat).

`livemode` = `false` untuk tagihan mode uji (dibuat dengan key `wp_test_...`). Tagihan uji tidak pernah menjadi uang.

`link_id` = id link pembayaran bila tagihan dibuat pembeli lewat link pembayaran (lihat bagian Link pembayaran); `null` untuk tagihan dari API/dashboard.

`customer` = isian pembeli di link pembayaran bila link memintanya: `{ "name", "phone", "note" }` (`phone` = nomor WhatsApp berawalan 62; isian yang tidak diminta bernilai `null`). `null` bila tidak ada.

## Cek status tagihan

`GET /api/payments/:id` → objek tagihan terbaru.

```bash
curl https://waroengpay.com/api/payments/WRG-7K2M9QX4BD1PZ -H "Authorization: Bearer $WAROENGPAY_API_KEY"
```

Setelah lunas, `payment` berisi `issuer` (bank/e-wallet pembayar), `payer` (nama disamarkan bank), `bca_ref` (nomor referensi transaksi), `transaction_at`. Field `webhooks` berisi 20 pengiriman webhook terakhir.

Contoh polling tanpa webhook (Node.js):

```js
async function tungguLunas(id) {
  for (;;) {
    const t = await (await fetch(`https://waroengpay.com/api/payments/${id}`, {
      headers: { Authorization: `Bearer ${process.env.WAROENGPAY_API_KEY}` },
    })).json();
    if (t.status !== "pending") return t; // paid | expired | cancelled
    await new Promise((r) => setTimeout(r, 5000));
  }
}
```

## Daftar tagihan

`GET /api/payments` — terbaru lebih dulu.

| Query | Tipe | Keterangan |
|---|---|---|
| `status` | string | `pending`, `paid`, `expired`, atau `cancelled`. |
| `from`, `to` | ISO 8601 | Rentang waktu: `from` ikut, `to` tidak ikut. |
| `by` | string | `paid` = rentang & urutan memakai waktu bayar. Default waktu dibuat. |
| `q` | string | Cari di referensi, keterangan, ID, ref bank, nama pembayar, atau nominal persis. |
| `issuer` | string | Bank / e-wallet pembayar, mis. `DANA`. |
| `summary` | `1` | Tambah `summary`: jumlah & total seluruh hasil filter, per status, dan per sumber. |
| `limit` | integer | 1–200, default 50. |
| `before`, `before_id` | ISO 8601, string | Isi dengan `next_before` dan `next_before_id` dari respons sebelumnya untuk halaman berikutnya. |

```json
{ "data": [ { "id": "WRG-7K2M9QX4BD1PZ", "status": "paid", "amount": 50137 } ], "has_more": true,
  "next_before": "2026-09-24T03:00:00.000Z", "next_before_id": "WRG-7K2M9QX4BD1PZ" }
```

## Struk tagihan

`GET /api/payments/:id/receipt.png` — gambar PNG untuk dikirim ke pembeli (nominal, pembayar, sumber, ref transaksi). Hanya tagihan `paid`; selain itu → `409 not_paid`.

## Batalkan tagihan

`POST /api/payments/:id/cancel` — hanya untuk tagihan `pending`. Selain itu → `409 not_pending`. Bila ada callback_url, event `payment.cancelled` dikirim.

## Siklus status

`pending` → salah satu status final: `paid` | `expired` | `cancelled`.

| Status | Arti |
|---|---|
| `pending` | QR aktif dan bisa dibayar. Mutasi rekening dicek tiap 8 detik. |
| `paid` | Kredit dengan nominal persis ditemukan di mutasi rekening dalam jendela waktu tagihan. |
| `expired` | Lewat batas waktu + 5 menit masa tenggang tanpa pembayaran cocok. |
| `cancelled` | Dibatalkan lewat dashboard atau API sebelum dibayar. |

## Webhook

Opsional. Diatur per akun (dashboard → Integrasi & API → Webhook) atau per tagihan lewat `callback_url`. Tanpa webhook, cek status lewat `GET /api/payments/:id`.

WaroengPay mengirim `POST` JSON saat status jadi final.

| Event | Dikirim saat |
|---|---|
| `payment.paid` | Tagihan lunas. |
| `payment.expired` | Lewat batas waktu tanpa pembayaran. |
| `payment.cancelled` | Tagihan dibatalkan. |
| `ping` | Tombol "Kirim tes" di dashboard. |

### Pembayaran telat (`late: true`)

Pembeli kadang tetap membayar setelah tagihan kedaluwarsa atau dibatalkan. Admin WaroengPay bisa mencocokkan pembayaran itu secara manual; tagihan lalu berubah jadi `paid` dan kamu menerima `payment.paid` dengan `data.late = true`, **setelah** sebelumnya menerima `payment.expired` / `payment.cancelled`.

Integrasi wajib menangani urutan ini: jangan menolak `payment.paid` hanya karena pesanan sudah ditandai kedaluwarsa. Pilihannya: tetap proses pesanan, atau refund/hubungi pembeli. Dana tagihan ini tetap masuk ke saldo merchant.

Header:

```
X-WaroengPay-Event: payment.paid
X-WaroengPay-Delivery: 1842
X-WaroengPay-Timestamp: 1790218992
X-Signature: <hex HMAC-SHA256(webhook_secret, "<timestamp>.<raw body>")>
User-Agent: WaroengPay-Webhook/1.0
```

Body:

```json
{
  "id": "evt_Qm2vK8sPz1Lx0aB7",
  "event": "payment.paid",
  "created_at": "2026-09-24T03:03:12.000Z",
  "livemode": true,
  "data": {
    "id": "WRG-7K2M9QX4BD1PZ",
    "reference": "INV-2041",
    "status": "paid",
    "base_amount": 50000,
    "amount": 50137,
    "pay_url": "https://waroengpay.com/pay/WRG-7K2M9QX4BD1PZ",
    "paid_at": "2026-09-24T03:03:12.000Z",
    "late": false,
    "livemode": true,
    "link_id": null,
    "customer": null,
    "payment": { "issuer": "DANA", "payer": "BU**I SAN**SO", "bca_ref": "236433285", "transaction_at": "2026-09-24T03:03:00.000Z" }
  }
}
```

### Memproses `payment.paid` dengan aman

Tanda tangan yang valid hanya membuktikan event berasal dari WaroengPay, **bukan** bahwa event itu untuk pesanan yang kamu kira. Siapa pun yang memegang API key atau sesi dashboard-mu bisa membuat tagihan Rp1.000 dengan `reference` pesanan Rp5.000.000 lalu membayarnya; webhook-nya tetap bertanda tangan asli.

1. Saat membuat tagihan, simpan `id` tagihan (`WRG-...`) di pesananmu.
2. Saat `payment.paid`, cari pesanan lewat `data.id`, **bukan** `data.reference` (tidak unik, bebas diisi).
3. Cocokkan nominal: `data.base_amount` harus sama dengan total pesanan (atau `data.amount` sama dengan `amount` yang kamu simpan). Beda → jangan tandai lunas, cek manual.
4. Abaikan event `livemode: false` (mode uji) di server produksi.
5. Lewati `id` event yang sudah pernah diproses. Ragu? Ambil ulang `GET /api/payments/:id` dengan API key-mu.

Verifikasi + pemrosesan (Node.js + Express):

```js
import crypto from "node:crypto";
app.post("/webhook/waroengpay", express.raw({ type: "application/json" }), async (req, res) => {
  const ts = req.get("x-waroengpay-timestamp") || "";
  const sig = req.get("x-signature") || "";
  const expected = crypto.createHmac("sha256", process.env.WAROENGPAY_WEBHOOK_SECRET).update(`${ts}.${req.body}`).digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(ts)) < 300;
  if (!fresh || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return res.sendStatus(401);
  const event = JSON.parse(req.body);
  if (event.livemode === false) return res.sendStatus(200); // event mode uji: jangan pernah menandai pesanan asli
  if (event.event === "payment.paid") {
    const order = await db.orders.findByWaroengpayId(event.data.id); // id tagihan yang disimpan saat membuat tagihan, BUKAN reference
    if (!order || event.data.base_amount !== order.total) return res.sendStatus(200); // bukan pesanan ini / nominal beda: jangan tandai lunas
    await db.orders.markPaid(order.id, event.id); // lewati bila event.id sudah diproses
  }
  res.sendStatus(200);
});
```

PHP:

```php
<?php
$body = file_get_contents("php://input");
$ts = $_SERVER["HTTP_X_WAROENGPAY_TIMESTAMP"] ?? "";
$expected = hash_hmac("sha256", $ts . "." . $body, getenv("WAROENGPAY_WEBHOOK_SECRET"));
if (!hash_equals($expected, $_SERVER["HTTP_X_SIGNATURE"] ?? "") || abs(time() - (int) $ts) > 300) { http_response_code(401); exit; }
$event = json_decode($body, true);
if (($event["livemode"] ?? true) === false) { http_response_code(200); exit; } // event mode uji (event ping tanpa livemode)
if ($event["event"] === "payment.paid") {
  $order = find_order_by_waroengpay_id($event["data"]["id"]); // id tagihan, BUKAN reference
  if ($order && $event["data"]["base_amount"] === $order["total"]) mark_paid($order, $event["id"]); // nominal harus sama
}
http_response_code(200);
```

Python (Flask):

```python
import hashlib, hmac, os, time
@app.post("/webhook/waroengpay")
def waroengpay():
    ts = request.headers.get("X-WaroengPay-Timestamp", "")
    expected = hmac.new(os.environ["WAROENGPAY_WEBHOOK_SECRET"].encode(), f"{ts}.".encode() + request.get_data(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("X-Signature", "")) or abs(time.time() - int(ts or 0)) > 300:
        abort(401)
    event = request.get_json()
    if event.get("livemode") is False:
        return "", 200  # event mode uji
    if event["event"] == "payment.paid":
        order = find_order_by_waroengpay_id(event["data"]["id"])  # id tagihan, BUKAN reference
        if order and event["data"]["base_amount"] == order.total:  # nominal harus sama
            mark_paid(order, event["id"])  # lewati bila event.id sudah diproses
    return "", 200
```

Aturan:
- Balas 2xx dalam 10 detik; proses berat di belakang.
- Gagal/non-2xx dicoba ulang: langsung, +30 dtk, +2 mnt, +10 mnt, +30 mnt, +2 jam.
- Event bisa terkirim lebih dari sekali: simpan `id` event dan lewati duplikat.
- URL ke jaringan privat (localhost, 10.x, 192.168.x, metadata cloud) ditolak; redirect tidak diikuti.
- `callback_url` / URL webhook hanya boleh memakai port 80, 443, 8080, atau 8443 (port lain → `400 invalid_url`). Batas waktu 10 detik dihitung total (koneksi sampai header balasan).
- Riwayat pengiriman webhook disimpan 30 hari. Tes webhook dari dashboard maksimal 5 kali per 10 menit.

## Halaman bayar

`pay_url` = `https://waroengpay.com/pay/<id>`: QR, nominal persis, hitung mundur, tombol cek transaksi, berubah otomatis saat lunas. Bila ada `redirect_url`, pembeli diarahkan ke sana 6 detik setelah lunas (tagihan mode uji tidak dialihkan otomatis: alamatnya ditampilkan dan pembeli harus menekan tombol). Setelah lunas, pembeli bisa mengunduh bukti bayar (gambar PNG berisi URL halaman ini untuk dicek keasliannya) atau mencetaknya. Bila mutasi rekening sedang terlambat dibaca, halaman menampilkan pemberitahuan agar pembeli tidak membayar ulang; status tetap diperbarui otomatis.

Kepala halaman bayar menampilkan profil toko (dashboard → Akun → Profil toko): logo, nama toko, tagline, dan centang biru bila toko sudah diverifikasi admin WaroengPay. Mengganti nama, tagline, atau logo toko mencabut centang sampai admin mengecek ulang.

## Link pembayaran

Link yang bisa dibagikan berkali-kali tanpa kode (bio Instagram, WhatsApp, QR cetak). Dibuat di dashboard → Tagihan → Link pembayaran (tidak lewat API key).

- `https://waroengpay.com/l/<slug>`: halaman untuk pembeli. Nominal tetap, atau diisi pembeli dalam batas minimal–maksimal yang kamu tentukan.
- `https://waroengpay.com/l/<slug>/qr.svg`: QR berisi URL link, siap dicetak (404 bila link atau pemiliknya nonaktif).
- Setiap pembeli yang menekan tombol bayar mendapat tagihan QRIS biasa (nominal + kode unik) lalu diarahkan ke `pay_url`-nya.

Tagihan dari link: `link_id` terisi, `reference` = `null`, `description` = judul link, `redirect_url` = redirect link (bila ada). Webhook dikirim ke URL webhook default akunmu; lewati atau tangani tagihan dengan `link_id` yang tidak kamu buat sendiri. Tagihan dari link berlaku 10 menit. Pembeli yang kembali / memuat ulang dengan nominal sama mendapat tagihan menunggu yang sama. Batas: 10 tagihan per 10 menit per IP pembeli, 3 tagihan menunggu per link per IP pembeli, 30 tagihan menunggu per link. Link nonaktif atau pemiliknya nonaktif → halaman 404. Slug yang sudah diganti atau dihapus tetap dicadangkan untukmu: merchant lain tidak bisa memakainya, alamat lamanya 404.

## Mode uji (sandbox)

Uji integrasi dari awal sampai webhook tanpa uang sungguhan. Buat API key uji di dashboard → Integrasi & API → Kredensial (`wp_test_...`), lalu panggil endpoint yang sama persis.

- Tagihan uji: `livemode: false`. `qris` berisi teks `WAROENGPAY-TEST|<id>|<amount>` (bukan QRIS), jadi tidak bisa dibayar aplikasi mana pun. Halaman bayarnya menampilkan banner MODE UJI dan tombol "Simulasikan bayar".
- Terpisah total dari live: key live tidak melihat tagihan uji (dan sebaliknya), `Idempotency-Key` berlaku per mode, kode unik tagihan uji tidak memesan nominal live. Tagihan uji tidak pernah masuk saldo, penarikan, statistik dashboard, atau notifikasi.
- Webhook tagihan uji hanya dikirim ke `callback_url` yang diisi saat membuat tagihan uji (URL webhook default akun **tidak** dipakai), dengan `livemode: false` di event dan `data`, dan ditandatangani **secret mode uji** (`whsec_test_...`, tampil di dashboard → Integrasi & API → Webhook setelah memasukkan password akun), bukan secret live. Server produksi yang memverifikasi dengan secret live otomatis menolaknya; tetap abaikan event dengan `livemode: false`.
- Tagihan uji yang tidak disimulasikan kedaluwarsa sendiri (batas waktu + 5 menit), sama seperti live.

`POST /api/payments/:id/simulate` (hanya key `wp_test_...`) → objek tagihan terbaru.

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `action` | string | tidak | `pay` (default) = lunas: `payment.issuer` = `SANDBOX`, `bca_ref` palsu `SANDBOX-...`, webhook `payment.paid`. `expire` = kedaluwarsa, webhook `payment.expired`. |

```bash
curl -X POST https://waroengpay.com/api/payments/WRG-7K2M9QX4BD1PZ/simulate \
  -H "Authorization: Bearer $WAROENGPAY_TEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"pay"}'
```

Hanya tagihan uji yang masih `pending`. Tagihan live → `403 live_invoice` (ditolak di server, tidak mungkin dilunasi lewat simulasi); tagihan uji yang sudah final → `409 not_pending`.

## Error

Semua error: `{ "error": "pesan untuk manusia", "code": "kode_mesin" }`.

| HTTP | code | Arti |
|---|---|---|
| 400 | `invalid_amount`, `invalid_url`, `invalid_expires_in`, `invalid_json`, `invalid_idempotency_key`, `invalid_action` | Input tidak valid. |
| 401 | `unauthorized`, `invalid_api_key` | API key tidak ada / salah / sudah dibuat ulang. |
| 403 | `account_not_active`, `forbidden` | Akun belum disetujui / nonaktif. |
| 403 | `live_invoice` | Simulasi hanya untuk tagihan mode uji. |
| 404 | `not_found` | Tagihan tidak ada atau bukan milikmu. |
| 409 | `not_pending`, `not_final` | Aksi tidak cocok dengan status tagihan. |
| 413 | `payload_too_large` | Body > 20 KB. |
| 429 | `rate_limited`, `too_many_pending` | Terlalu banyak request; lihat header `Retry-After`. |
| 503 | `amount_busy` | Kode unik untuk nominal itu sedang habis; coba lagi sebentar. |

## Batasan

- Nominal Rp1.000–Rp10.000.000 + kode unik kecil (default Rp100–Rp250; baca `unique_code` di respons).
- Masa berlaku 5–60 menit (default 15) + 5 menit masa tenggang.
- Maks 50 tagihan pending per akun (dan maks 25 pending dengan `amount` yang sama); maks 30 tagihan dibuat per menit per akun. Tagihan dari link pembayaran ikut dihitung.
- Maks 300 request per menit per IP; body JSON maks 20 KB.
